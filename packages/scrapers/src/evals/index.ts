/**
 * Eval harness for the scraper generator prompt.
 *
 * Run with:  pnpm eval
 *
 * For each test case the harness:
 * 1. Calls POST /api/scrapers/generate (or the generator+judge directly) with the fixture HTML
 * 2. Compiles the returned bundle via compilePlugin
 * 3. Calls scrape() with a ctx whose fetchHtml returns the fixture HTML
 * 4. Checks the output against expected values
 * 5. Prints a score table
 *
 * This makes the generation system prompt a measurable artefact — change the prompt,
 * run evals, compare scores.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as cheerio from "cheerio";
import { parsePriceToMinor, contentHash } from "@pricecheck/core";
import { compilePlugin, makeScraperContext, type ScraperContext } from "../index";
import { GENERATOR_SYSTEM_PROMPT, GENERATOR_USER_TEMPLATE } from "../prompts/generator";
import { JUDGE_SYSTEM_PROMPT, type JudgeVerdict } from "../prompts/judge";
import { httpFetcher } from "../http";

interface EvalCase {
  name: string;
  shopUrl: string;
  fixtureFile: string;
  expected: {
    currency: string;
    minPriceMinor: number;
    maxPriceMinor: number;
    inStock: boolean;
    hasRetailerOriginalPrice?: boolean;
  };
}

const FIXTURES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../adapters/__fixtures__",
);

const TEST_CASES: EvalCase[] = [
  {
    name: "Supervalu — normal price",
    shopUrl: "https://shop.supervalu.ie/sm/delivery/rsid/5550/results?q=schar+bread",
    fixtureFile: "supervalu-search-normal.html",
    expected: { currency: "EUR", minPriceMinor: 400, maxPriceMinor: 600, inStock: true },
  },
  {
    name: "Supervalu — on sale",
    shopUrl: "https://shop.supervalu.ie/sm/delivery/rsid/5550/results?q=mccambridge",
    fixtureFile: "supervalu-search-on-sale.html",
    expected: {
      currency: "EUR",
      minPriceMinor: 100,
      maxPriceMinor: 250,
      inStock: true,
      hasRetailerOriginalPrice: true,
    },
  },
];

function makeFixtureContext(fixtureHtml: string): ScraperContext {
  const fetchHtml = async (_url: string) => fixtureHtml;
  return { fetchHtml, cheerio, parsePriceToMinor, contentHash };
}

interface EvalResult {
  caseName: string;
  judgeScore: number;
  judgeRecommendation: string;
  scrapePass: boolean;
  scrapeError?: string;
  details: string[];
}

async function runEval(ec: EvalCase, anthropic: Anthropic): Promise<EvalResult> {
  const fixtureHtml = readFileSync(path.join(FIXTURES_DIR, ec.fixtureFile), "utf8");
  const details: string[] = [];

  // 1. Generator call
  const genMsg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: GENERATOR_SYSTEM_PROMPT,
    messages: [{ role: "user", content: GENERATOR_USER_TEMPLATE(ec.shopUrl, fixtureHtml) }],
  });
  const bundleJs = genMsg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  // 2. Judge call
  const judgeMsg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: JUDGE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Shop URL: ${ec.shopUrl}\n\nBundle:\n\`\`\`js\n${bundleJs.slice(0, 8000)}\n\`\`\`` }],
  });
  let verdict: JudgeVerdict = { score: 0, recommendation: "reject", findings: [] };
  try {
    const judgeText = judgeMsg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const m = judgeText.match(/\{[\s\S]*\}/);
    if (m) verdict = JSON.parse(m[0]) as JudgeVerdict;
  } catch { /* verdict stays as default */ }

  // 3. Compile and run against fixture
  let scrapePass = false;
  let scrapeError: string | undefined;
  try {
    const scraper = compilePlugin({
      slug: "eval-scraper",
      displayName: "Eval",
      baseUrl: ec.shopUrl,
      bundleJs,
      version: "1",
    });
    const ctx = makeFixtureContext(fixtureHtml);
    const result = await scraper.scrape({ url: ec.shopUrl, retailerSku: "eval" }, ctx);

    if (result.price.currency !== ec.expected.currency) {
      details.push(`currency: expected ${ec.expected.currency}, got ${result.price.currency}`);
    } else if (
      result.price.amountMinor < ec.expected.minPriceMinor ||
      result.price.amountMinor > ec.expected.maxPriceMinor
    ) {
      details.push(`price ${result.price.amountMinor} outside expected range [${ec.expected.minPriceMinor}, ${ec.expected.maxPriceMinor}]`);
    } else if (result.inStock !== ec.expected.inStock) {
      details.push(`inStock: expected ${ec.expected.inStock}, got ${result.inStock}`);
    } else if (ec.expected.hasRetailerOriginalPrice && !result.retailerOriginalPriceMinor) {
      details.push("expected retailerOriginalPriceMinor to be set (on-sale item)");
    } else {
      scrapePass = true;
      details.push(`price=${result.price.amountMinor} ${result.price.currency}, inStock=${result.inStock}`);
    }
  } catch (err) {
    scrapeError = err instanceof Error ? err.message : String(err);
    details.push(`scrape threw: ${scrapeError}`);
  }

  return {
    caseName: ec.name,
    judgeScore: verdict.score,
    judgeRecommendation: verdict.recommendation,
    scrapePass,
    scrapeError,
    details,
  };
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set");
    process.exit(1);
  }
  const anthropic = new Anthropic({ apiKey });

  console.log("\n=== PriceCheck Scraper Generator Eval ===\n");

  const results: EvalResult[] = [];
  for (const tc of TEST_CASES) {
    process.stdout.write(`Running: ${tc.name} … `);
    const r = await runEval(tc, anthropic);
    results.push(r);
    console.log(r.scrapePass ? "PASS" : "FAIL");
  }

  console.log("\n┌─────────────────────────────────────────────────────────────┐");
  console.log("│ Case                              Judge  Scrape  Details     │");
  console.log("├─────────────────────────────────────────────────────────────┤");
  for (const r of results) {
    const name = r.caseName.padEnd(34).slice(0, 34);
    const judge = `${r.judgeScore}/100`.padEnd(7);
    const scrape = (r.scrapePass ? "PASS" : "FAIL").padEnd(7);
    const detail = (r.details[0] ?? "").slice(0, 14);
    console.log(`│ ${name} ${judge} ${scrape} ${detail.padEnd(12)} │`);
  }
  console.log("└─────────────────────────────────────────────────────────────┘");

  const passCount = results.filter((r) => r.scrapePass).length;
  const avgScore = Math.round(results.reduce((s, r) => s + r.judgeScore, 0) / results.length);
  console.log(`\nResult: ${passCount}/${results.length} scrape checks passed. Avg judge score: ${avgScore}/100\n`);

  if (passCount < results.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
