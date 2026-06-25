import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBooksToScrape } from "./books-toscrape";

const fixture = readFileSync(
  new URL("./__fixtures__/books-toscrape-product.html", import.meta.url),
  "utf8",
);
const URL_UNDER_TEST = "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html";

describe("parseBooksToScrape", () => {
  it("extracts price, stock, and title from saved HTML", () => {
    const result = parseBooksToScrape(fixture, URL_UNDER_TEST);
    expect(result.price).toEqual({ amountMinor: 5177, currency: "GBP" });
    expect(result.inStock).toBe(true);
    expect(result.title).toBe("A Light in the Attic");
    expect(result.parserVersion).toBe("books-toscrape@1");
  });

  it("produces a stable sourceHash for identical input (idempotency)", () => {
    const a = parseBooksToScrape(fixture, URL_UNDER_TEST);
    const b = parseBooksToScrape(fixture, URL_UNDER_TEST);
    expect(a.sourceHash).toBe(b.sourceHash);
  });

  it("throws when the price cannot be parsed (caught as a parse failure)", () => {
    expect(() => parseBooksToScrape("<html><body>no price</body></html>", URL_UNDER_TEST)).toThrow();
  });
});
