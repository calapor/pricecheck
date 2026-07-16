import Anthropic from "@anthropic-ai/sdk";
import {
  GENERATOR_SYSTEM_PROMPT,
  GENERATOR_USER_TEMPLATE,
  JUDGE_SYSTEM_PROMPT,
  JUDGE_USER_TEMPLATE,
  compilePlugin,
  escalatingFetcher,
  stripScriptsAndStyles,
  detectBotWall,
  botWallMessage,
  type HtmlFetcher,
  type JudgeVerdict,
} from "@pricecheck/scrapers";
import { browserFetcher } from "@pricecheck/scrapers/browser";
import { recordAiUsage } from "@pricecheck/db";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isClaudeHalted, CLAUDE_HALTED_MESSAGE } from "@/lib/claude-halt";

// First-attempt generator + the judge run on Sonnet. On a truncated draft we retry once
// on Opus, which is far better at completing long, multi-path structured code in one pass.
const GENERATOR_MODEL = process.env.GENERATOR_MODEL ?? "claude-sonnet-4-6";
const GENERATOR_RETRY_MODEL = process.env.GENERATOR_RETRY_MODEL ?? "claude-opus-4-8";
const GENERATOR_MAX_TOKENS = parseInt(process.env.GENERATOR_MAX_TOKENS || "16000", 10) || 16000;

// Anthropic SDK throws at call time if the key is missing/invalid.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-IE,en;q=0.9",
};

/**
 * Plain-HTTP fetch of the shop page with browser-like headers. On a bot-wall status
 * it throws a message containing the code (e.g. "HTTP 403") so {@link escalatingFetcher}
 * can recognise it and hand off to the stealth headless browser — the same 401/403 →
 * browser path the worker and install smoke-test use. Without this, shops behind
 * Cloudflare/Akamai (e.g. Dunnes) fail the add-shop flow with a bare "HTTP 403".
 */
const primaryFetch: HtmlFetcher = async (url) => {
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
};

/** Extract slug/displayName/baseUrl from the METADATA comment the generator embeds. */
function extractMetadata(
  bundle: string,
): { slug: string; displayName: string; baseUrl: string } | null {
  const m = bundle.match(/\/\/\s*METADATA:\s*(\{[^\n]+\})/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!) as { slug: string; displayName: string; baseUrl: string };
  } catch {
    return null;
  }
}

/**
 * Structural completeness gate for a generated bundle. The model sometimes stops early with
 * stop_reason="end_turn" (not "max_tokens"), leaving scrape() half-written — the token guard
 * never catches this. Reuse the same sandbox compile the install path uses: a bundle that
 * evaluates and exports a scrape() function is, by definition, not truncated. compilePlugin
 * throws on a syntax error (a mid-function cut) or a missing scrape export.
 */
function isBundleComplete(bundleJs: string): boolean {
  const meta = extractMetadata(bundleJs);
  try {
    compilePlugin({
      slug: meta?.slug ?? "gen",
      displayName: meta?.displayName ?? "gen",
      baseUrl: meta?.baseUrl ?? "https://example.com/",
      bundleJs,
      version: "gen",
    });
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  let shopUrl: unknown;
  try {
    ({ shopUrl } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof shopUrl !== "string" || !shopUrl.trim()) {
    return NextResponse.json({ error: "shopUrl required" }, { status: 400 });
  }

  // Reject non-HTTP(S) schemes before fetching or interpolating into prompts.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(shopUrl.trim());
  } catch {
    return NextResponse.json({ error: "shopUrl must be a valid URL" }, { status: 400 });
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json({ error: "shopUrl must use http or https" }, { status: 400 });
  }

  // Fail clearly if the AI key is missing rather than letting the SDK throw an
  // opaque "Could not resolve authentication method" that surfaces as a 500.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set — add it to .env.local to generate scrapers." },
      { status: 503 },
    );
  }

  // Shared Claude-API kill switch — stop before spending any tokens.
  if (await isClaudeHalted()) {
    return NextResponse.json(
      { error: CLAUDE_HALTED_MESSAGE, claudeHalted: true },
      { status: 503 },
    );
  }

  // 1. Fetch the shop page HTML. Try plain HTTP first, then fall back to the stealth
  // headless browser on a 401/403 so bot-protected shops (Cloudflare/Akamai) can still
  // be added — the browser path is transparent and only spins up Chromium on a block.
  let rawHtml: string;
  try {
    rawHtml = await escalatingFetcher(primaryFetch, browserFetcher())(parsedUrl.href);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not fetch shop URL: ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 },
    );
  }

  // A bot-management denial (Akamai/Cloudflare) often comes back as HTTP 200 with a tiny
  // "Access Denied" body, so the escalating fetcher's 401/403 escalation never fires and the
  // browser fallback returns the same wall. Detect it by content and park the shop with an
  // honest reason instead of burning a model call generating a scraper for an error page.
  const wall = detectBotWall(rawHtml);
  if (wall.blocked) {
    return NextResponse.json(
      { error: botWallMessage(parsedUrl.host, wall.vendor), blocked: true },
      { status: 422 },
    );
  }

  // Strip scripts, styles, and HTML comments before sending to reduce token count
  // and remove common prompt-injection vectors in page content.
  const html = stripScriptsAndStyles(rawHtml);

  // 2 + 3. Generator and judge calls. Any AI failure (auth, rate limit, oversized
  // page exceeding the context window, network) is returned as JSON so the client
  // shows a real message instead of choking on an empty 500 body.
  let bundleJs: string;
  let judgeMessage: Anthropic.Message;
  // Every generation attempt's model + token usage, logged after we have a result so the
  // admin dashboard reflects true spend even when a Sonnet draft is retried on Opus.
  const genUsage: Array<{ model: string; usage: Anthropic.Usage }> = [];
  try {
    // Attempt 1 on Sonnet; on a truncated draft, one retry on Opus. Truncation is caught
    // regardless of stop_reason — a half-written scrape() from an early "end_turn" fails
    // the compile gate just as a "max_tokens" cut-off does.
    const models = [GENERATOR_MODEL, GENERATOR_RETRY_MODEL];
    let complete = false;
    bundleJs = "";
    for (const model of models) {
      const genMessage = await anthropic.messages.stream({
        model,
        // A complete scraper bundle (JSON paths + ld+json + DOM fallback + on-sale
        // handling) routinely runs past 4k output tokens; too tight a cap truncates the
        // scrape() mid-function and the judge rejects it as "incomplete" (as happened
        // for Tesco). Configurable via GENERATOR_MAX_TOKENS env var; default 16 000.
        max_tokens: GENERATOR_MAX_TOKENS,
        system: GENERATOR_SYSTEM_PROMPT,
        messages: [{ role: "user", content: GENERATOR_USER_TEMPLATE(shopUrl, html) }],
      }).finalMessage();
      genUsage.push({ model, usage: genMessage.usage });

      bundleJs = genMessage.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      // A bundle is usable only if it neither hit the token ceiling nor stopped early with a
      // half-written scrape(). If truncated, loop to the more capable retry model.
      if (genMessage.stop_reason !== "max_tokens" && isBundleComplete(bundleJs)) {
        complete = true;
        break;
      }
    }

    if (!complete) {
      // Log the attempts we did make before bailing, then fail loudly rather than shipping a
      // half-written scraper to the judge/install step.
      await Promise.all(
        genUsage.map((g) =>
          recordAiUsage(db, {
            route: "scrapers/generate",
            operation: "generate",
            model: g.model,
            inputTokens: g.usage.input_tokens,
            outputTokens: g.usage.output_tokens,
          }),
        ),
      ).catch(() => undefined);
      return NextResponse.json(
        {
          error:
            `Scraper generation produced an incomplete bundle after 2 attempts (GENERATOR_MAX_TOKENS=${GENERATOR_MAX_TOKENS}) — the shop page may be unusually complex. Please try again.`,
        },
        { status: 502 },
      );
    }

    judgeMessage = await anthropic.messages.stream({
      model: GENERATOR_MODEL,
      max_tokens: 1024,
      system: JUDGE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: JUDGE_USER_TEMPLATE(shopUrl, bundleJs) }],
    }).finalMessage();

    // Log token usage/cost for the admin dashboard — awaited so all rows land before the
    // response returns (fire-and-forget races request teardown), but never fail generation.
    await Promise.all([
      ...genUsage.map((g) =>
        recordAiUsage(db, {
          route: "scrapers/generate",
          operation: "generate",
          model: g.model,
          inputTokens: g.usage.input_tokens,
          outputTokens: g.usage.output_tokens,
        }),
      ),
      recordAiUsage(db, {
        route: "scrapers/generate",
        operation: "judge",
        model: GENERATOR_MODEL,
        inputTokens: judgeMessage.usage.input_tokens,
        outputTokens: judgeMessage.usage.output_tokens,
      }),
    ]).catch(() => undefined);
  } catch (err) {
    return NextResponse.json(
      { error: `Scraper generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  let verdict: JudgeVerdict = {
    score: 0,
    recommendation: "reject",
    findings: [{ severity: "error", message: "Judge did not return parseable JSON" }],
  };
  try {
    const judgeText = judgeMessage.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const jsonMatch = judgeText.match(/\{[\s\S]*\}/);
    if (jsonMatch) verdict = JSON.parse(jsonMatch[0]) as JudgeVerdict;
  } catch {
    // verdict stays as the error default above
  }

  // 4. Extract metadata from the METADATA comment
  const metadata = extractMetadata(bundleJs);

  return NextResponse.json({
    slug: metadata?.slug ?? "",
    displayName: metadata?.displayName ?? "",
    baseUrl: metadata?.baseUrl ?? "",
    bundleJs,
    verdict,
  });
}
