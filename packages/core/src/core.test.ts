import { describe, expect, it } from "vitest";
import { referenceFromHistory, computeDeal } from "./deal";
import { parsePriceToMinor, formatMoney } from "./money";
import { normalizeGtin, fuzzyMatchKey } from "./product";
import { detectPriceAnomaly } from "./price";

describe("parsePriceToMinor", () => {
  it("parses US-formatted prices", () => {
    expect(parsePriceToMinor("$1,299.00", "USD")).toEqual({ amountMinor: 129900, currency: "USD" });
  });
  it("parses EU-formatted prices", () => {
    expect(parsePriceToMinor("1.299,50 €", "EUR")).toEqual({ amountMinor: 129950, currency: "EUR" });
  });
  it("respects zero-decimal currencies", () => {
    expect(parsePriceToMinor("¥1,980", "JPY")).toEqual({ amountMinor: 1980, currency: "JPY" });
  });
  it("returns null for unparseable input", () => {
    expect(parsePriceToMinor("Out of stock", "USD")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("round-trips a parsed price", () => {
    const money = parsePriceToMinor("$19.99", "USD")!;
    expect(formatMoney(money)).toBe("$19.99");
  });
});

describe("normalizeGtin", () => {
  it("accepts a valid UPC-A and pads to GTIN-14", () => {
    // 036000291452 is a canonical valid UPC-A example.
    expect(normalizeGtin("0 36000 29145 2")).toBe("00036000291452");
  });
  it("rejects an invalid check digit", () => {
    expect(normalizeGtin("036000291453")).toBeNull();
  });
  it("rejects non-barcode lengths", () => {
    expect(normalizeGtin("12345")).toBeNull();
  });
});

describe("fuzzyMatchKey", () => {
  it("normalizes brand + title", () => {
    expect(fuzzyMatchKey("Sony", "WH-1000XM5 Headphones!")).toBe("sony wh 1000xm5 headphones");
  });
});

describe("referenceFromHistory", () => {
  it("returns the max price", () => {
    expect(referenceFromHistory([500, 1000, 800])).toBe(1000);
  });
  it("handles a single price", () => {
    expect(referenceFromHistory([750])).toBe(750);
  });
});

describe("computeDeal", () => {
  it("flags on-sale when discount exceeds min threshold", () => {
    // 1000 -> 900 = 10% off = 1000 bps, threshold default 500 bps
    const result = computeDeal(900, 1000);
    expect(result.onSale).toBe(true);
    expect(result.reductionBps).toBe(1000);
  });
  it("does not flag on-sale when discount is below threshold", () => {
    // 1000 -> 960 = 4% off = 400 bps, below 500 bps threshold
    const result = computeDeal(960, 1000);
    expect(result.onSale).toBe(false);
    expect(result.reductionBps).toBe(400);
  });
  it("does not flag on-sale when price equals reference", () => {
    const result = computeDeal(1000, 1000);
    expect(result.onSale).toBe(false);
    expect(result.reductionBps).toBe(0);
  });
  it("handles exact threshold boundary (not on-sale)", () => {
    // exactly 5% off = 500 bps; condition is strictly less-than threshold
    const result = computeDeal(950, 1000);
    expect(result.onSale).toBe(false);
    expect(result.reductionBps).toBe(500);
  });
  it("returns no-sale for zero or negative inputs", () => {
    expect(computeDeal(0, 1000)).toEqual({ onSale: false, reductionBps: 0 });
    expect(computeDeal(500, 0)).toEqual({ onSale: false, reductionBps: 0 });
  });
  it("respects custom minReductionBps", () => {
    // 200 bps off, threshold lowered to 100 bps
    const result = computeDeal(980, 1000, 100);
    expect(result.onSale).toBe(true);
    expect(result.reductionBps).toBe(200);
  });
});

describe("detectPriceAnomaly", () => {
  const usd = (n: number) => ({ amountMinor: n, currency: "USD" });
  it("flags non-positive prices", () => {
    expect(detectPriceAnomaly(usd(0), usd(1000))?.kind).toBe("non_positive");
  });
  it("flags large spikes", () => {
    expect(detectPriceAnomaly(usd(2000), usd(1000))?.kind).toBe("spike");
  });
  it("allows normal movement", () => {
    expect(detectPriceAnomaly(usd(1100), usd(1000))).toBeNull();
  });
  it("flags currency changes", () => {
    expect(detectPriceAnomaly(usd(1000), { amountMinor: 1000, currency: "EUR" })?.kind).toBe(
      "currency_changed",
    );
  });
});
