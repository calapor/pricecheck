import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSupervalu } from "./supervalu";

const SEARCH_URL = "https://shop.supervalu.ie/sm/delivery/rsid/5550/results?q=test";

function fixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
}

describe("parseSupervalu", () => {
  it("parses price and stock from a normal (not on sale) search result", () => {
    const result = parseSupervalu(fixture("supervalu-search-normal.html"), SEARCH_URL);
    expect(result.price).toEqual({ amountMinor: 459, currency: "EUR" });
    expect(result.inStock).toBe(true);
    expect(result.title).toBe("Schar Gluten Free Wholesome Seeded Loaf (300 g)");
    expect(result.retailerOriginalPriceMinor).toBeUndefined();
    expect(result.parserVersion).toBe("supervalu@1");
  });

  it("sets retailerOriginalPriceMinor when wasPrice differs from price", () => {
    const result = parseSupervalu(fixture("supervalu-search-on-sale.html"), SEARCH_URL);
    expect(result.price).toEqual({ amountMinor: 175, currency: "EUR" });
    expect(result.retailerOriginalPriceMinor).toBe(219);
    expect(result.inStock).toBe(true);
  });

  it("produces a stable sourceHash for identical input", () => {
    const a = parseSupervalu(fixture("supervalu-search-normal.html"), SEARCH_URL);
    const b = parseSupervalu(fixture("supervalu-search-normal.html"), SEARCH_URL);
    expect(a.sourceHash).toBe(b.sourceHash);
  });

  it("throws when no products are found", () => {
    expect(() =>
      parseSupervalu(fixture("supervalu-search-no-results.html"), SEARCH_URL),
    ).toThrow("no products found");
  });

  it("throws when __PRELOADED_STATE__ is missing", () => {
    expect(() => parseSupervalu("<html><body>no state</body></html>", SEARCH_URL)).toThrow(
      "__PRELOADED_STATE__",
    );
  });
});
