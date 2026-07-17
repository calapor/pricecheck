import "server-only";
import type { JudgeVerdict } from "@pricecheck/scrapers";

// CommonJS bundle executed in the vm sandbox — must not use import/require/process.
// Catalogue keys are substrings of input.url (lowercased); ctx.contentHash is injected.
export const TESCO_DEMO_BUNDLE = `// METADATA: {"slug":"tesco-ireland","displayName":"Tesco Ireland","baseUrl":"https://www.tesco.ie/"}

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

export const TESCO_DEMO: {
  slug: string;
  displayName: string;
  baseUrl: string;
  bundleJs: string;
  verdict: JudgeVerdict;
} = {
  slug: "tesco-ireland",
  displayName: "Tesco Ireland",
  baseUrl: "https://www.tesco.ie/",
  bundleJs: TESCO_DEMO_BUNDLE,
  verdict: {
    score: 88,
    recommendation: "install",
    findings: [
      { severity: "info",    message: "Reads product data from the ld+json Product schema." },
      { severity: "info",    message: "searchUrl() builds a valid tesco.ie search query." },
      { severity: "warning", message: "Assumes EUR; add currency detection for multi-region shops." },
    ],
  },
};
