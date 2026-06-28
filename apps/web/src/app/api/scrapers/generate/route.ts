import Anthropic from "@anthropic-ai/sdk";
import {
  GENERATOR_SYSTEM_PROMPT,
  GENERATOR_USER_TEMPLATE,
  JUDGE_SYSTEM_PROMPT,
  type JudgeVerdict,
} from "@pricecheck/scrapers";
import { NextResponse } from "next/server";

// Anthropic SDK throws at call time if the key is missing/invalid.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-IE,en;q=0.9",
};

function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

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

  // Fail clearly if the AI key is missing rather than letting the SDK throw an
  // opaque "Could not resolve authentication method" that surfaces as a 500.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set — add it to .env.local to generate scrapers." },
      { status: 503 },
    );
  }

  // 1. Fetch the shop page HTML
  let rawHtml: string;
  try {
    const res = await fetch(shopUrl.trim(), { headers: BROWSER_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rawHtml = await res.text();
  } catch (err) {
    return NextResponse.json(
      { error: `Could not fetch shop URL: ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 },
    );
  }

  // Strip scripts/styles before sending to reduce token count; keep data attributes.
  const html = stripScriptsAndStyles(rawHtml);

  // 2 + 3. Generator and judge calls. Any AI failure (auth, rate limit, oversized
  // page exceeding the context window, network) is returned as JSON so the client
  // shows a real message instead of choking on an empty 500 body.
  let bundleJs: string;
  let judgeMessage: Awaited<ReturnType<typeof anthropic.messages.create>>;
  try {
    const genMessage = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: GENERATOR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: GENERATOR_USER_TEMPLATE(shopUrl, html) }],
    });

    bundleJs = genMessage.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    judgeMessage = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: JUDGE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Shop URL: ${shopUrl}\n\nGenerated bundle:\n\`\`\`js\n${bundleJs.slice(0, 8000)}\n\`\`\``,
        },
      ],
    });
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
