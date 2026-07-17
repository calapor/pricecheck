import { describe, expect, it } from "vitest";
import { compilePlugin, makeScraperContext } from "../index";
import { scrapeResultSchema } from "@pricecheck/core";

// Inline the bundle rather than importing from apps/web to keep packages independent.
const BUNDLE = `// METADATA: {"slug":"tesco-ireland","displayName":"Tesco Ireland","baseUrl":"https://www.tesco.ie/"}

var CATALOGUE = [
  { match: ["salmon"], title: "Tesco Complete & Balanced Nutrition Adult Cat with Salmon & Vegetables", amountMinor: 250, refMinor: 300 },
  { match: ["almond", "barista"], title: "Tesco Almond Barista Drink", amountMinor: 235, refMinor: null },
  { match: ["corn+flakes", "crunchy"], title: "Tesco Crunchy Nut Corn Flakes", amountMinor: 499, refMinor: 599 },
  { match: ["flora", "spread"], title: "Tesco Sunflower Spread Original", amountMinor: 399, refMinor: null },
  { match: ["loaf", "seeded"], title: "Tesco Gluten Free Seeded Loaf", amountMinor: 325, refMinor: 399 }
];

module.exports.searchUrl = function searchUrl(query) {
  return "https://www.tesco.ie/groceries/en-IE/search?query=" + encodeURIComponent(query);
};

module.exports.scrape = async function scrape(input, ctx) {
  var key = (input.url + " " + (input.retailerSku || "")).toLowerCase();
  var entry = null;
  for (var i = 0; i < CATALOGUE.length; i++) {
    var item = CATALOGUE[i];
    for (var j = 0; j < item.match.length; j++) {
      if (key.indexOf(item.match[j]) !== -1) { entry = item; break; }
    }
    if (entry) break;
  }
  if (!entry) entry = CATALOGUE[0];
  var amountMinor = entry.amountMinor;
  var result = {
    price: { amountMinor: amountMinor, currency: "EUR" },
    inStock: true,
    url: input.url,
    title: entry.title,
    sourceHash: ctx.contentHash([input.url, amountMinor, "EUR", true]),
    parserVersion: "tesco-ireland@1"
  };
  if (entry.refMinor) result.retailerOriginalPriceMinor = entry.refMinor;
  return result;
};
`;

describe("tesco-ireland demo bundle", () => {
  it("compiles without error", () => {
    expect(() =>
      compilePlugin({ slug: "tesco-ireland", displayName: "Tesco Ireland", baseUrl: "https://www.tesco.ie/", bundleJs: BUNDLE, version: "1" }),
    ).not.toThrow();
  });

  it("scrape() returns a schema-valid result with price 250 for salmon", async () => {
    const scraper = compilePlugin({ slug: "tesco-ireland", displayName: "Tesco Ireland", baseUrl: "https://www.tesco.ie/", bundleJs: BUNDLE, version: "1" });
    const ctx = makeScraperContext(async () => "");
    const url = scraper.searchUrl!("salmon");
    const result = await scraper.scrape({ url, retailerSku: "smoke" }, ctx);

    expect(() => scrapeResultSchema.parse(result)).not.toThrow();
    expect(result.price.amountMinor).toBe(250);
    expect(result.price.currency).toBe("EUR");
    expect(result.retailerOriginalPriceMinor).toBe(300);
  });

  it("searchUrl() builds a valid tesco.ie search URL", () => {
    const scraper = compilePlugin({ slug: "tesco-ireland", displayName: "Tesco Ireland", baseUrl: "https://www.tesco.ie/", bundleJs: BUNDLE, version: "1" });
    const url = scraper.searchUrl!("corn flakes");
    expect(url).toBe("https://www.tesco.ie/groceries/en-IE/search?query=corn%20flakes");
  });
});
