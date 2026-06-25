/**
 * Money is stored as an integer number of minor units (e.g. cents) plus an
 * ISO-4217 currency code. Never use floats for prices — parse to minor units at
 * the edge (scrapers) and format only at the UI.
 */
export interface Money {
  /** Integer amount in the currency's minor unit (cents for USD/EUR/GBP). */
  amountMinor: number;
  /** ISO-4217 currency code, uppercased (e.g. "USD"). */
  currency: string;
}

/** Currencies whose minor unit is not 1/100 of the major unit. */
const MINOR_UNIT_EXPONENT: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  CLP: 0,
  ISK: 0,
  HUF: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
};

export function minorUnitExponent(currency: string): number {
  return MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2;
}

/**
 * Parse a human price string (e.g. "$1,299.00", "1.299,00 €", "USD 19.99") into
 * a {@link Money}. Returns null when no parseable number is found.
 *
 * Handles both `1,234.56` (US) and `1.234,56` (EU) grouping by treating the last
 * separator as the decimal point.
 */
export function parsePriceToMinor(input: string, currency: string): Money | null {
  if (typeof input !== "string") return null;
  // Keep digits and separators only.
  const cleaned = input.replace(/[^0-9.,]/g, "");
  if (cleaned === "") return null;

  const exponent = minorUnitExponent(currency);

  // Zero-decimal currencies (JPY, KRW, ...) never have a fractional part, so any
  // "." / "," is necessarily a thousands grouping separator.
  if (exponent === 0) {
    const digits = cleaned.replace(/[.,]/g, "");
    if (digits === "") return null;
    const intValue = Number.parseInt(digits, 10);
    return Number.isFinite(intValue)
      ? { amountMinor: intValue, currency: currency.toUpperCase() }
      : null;
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = cleaned;
  } else if (lastComma > -1 && lastDot > -1) {
    // Both separator types present: the later one is the decimal point, the other
    // is grouping.
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else {
    // Only one separator type. It's a thousands grouping when it repeats, or when a
    // single occurrence is followed by exactly 3 digits (e.g. "1,980"); otherwise
    // it's the decimal point (e.g. "19.99").
    const sep = lastComma > -1 ? "," : ".";
    const parts = cleaned.split(sep);
    const trailing = (parts.at(-1) ?? "").length;
    normalized =
      parts.length > 2 || trailing === 3
        ? parts.join("")
        : `${parts[0] ?? ""}.${parts[1] ?? ""}`;
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return null;

  const amountMinor = Math.round(value * 10 ** exponent);
  return { amountMinor, currency: currency.toUpperCase() };
}

/** Format Money for display, e.g. { amountMinor: 129900, currency: "USD" } -> "$1,299.00". */
export function formatMoney(money: Money, locale = "en-US"): string {
  const exponent = minorUnitExponent(money.currency);
  const major = money.amountMinor / 10 ** exponent;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
  }).format(major);
}
