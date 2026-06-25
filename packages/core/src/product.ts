/**
 * Product identity / matching helpers. Cross-retailer matching keys off the
 * GTIN (UPC/EAN) when available — the single most reliable join key.
 */

/**
 * Normalize a GTIN/UPC/EAN to a canonical 14-digit string (GTIN-14), or null if
 * it isn't a plausible barcode. Strips non-digits and validates the check digit.
 */
export function normalizeGtin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  // Valid GTIN lengths: UPC-A (12), EAN-13 (13), GTIN-14 (14), EAN-8 (8).
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  if (!hasValidGtinCheckDigit(digits)) return null;
  return digits.padStart(14, "0");
}

/** Mod-10 (GS1) check-digit validation, works for GTIN-8/12/13/14. */
function hasValidGtinCheckDigit(digits: string): boolean {
  const body = digits.slice(0, -1);
  const check = Number(digits.slice(-1));
  let sum = 0;
  // Weights alternate 3,1,... from the rightmost body digit.
  for (let i = body.length - 1, mult = 3; i >= 0; i--, mult = mult === 3 ? 1 : 3) {
    sum += Number(body[i]) * mult;
  }
  const computed = (10 - (sum % 10)) % 10;
  return computed === check;
}

/**
 * A coarse fallback match key for products lacking a GTIN: lowercased,
 * punctuation-stripped "brand title". Use only as a secondary signal.
 */
export function fuzzyMatchKey(brand: string | null, title: string): string {
  return [brand, title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
