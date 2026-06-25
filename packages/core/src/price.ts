import type { Money } from "./money";

/**
 * Sanity-check a freshly scraped price against the previous known value.
 * A large swing usually means the parser broke (site layout changed) rather than
 * a genuine price change, so we flag it for review instead of trusting it blindly.
 */
export interface PriceAnomaly {
  kind: "non_positive" | "currency_changed" | "spike";
  message: string;
  /** Fractional change vs previous, e.g. 0.8 = +80%. Present for "spike". */
  changeRatio?: number;
}

export interface AnomalyOptions {
  /** Absolute fractional change beyond which we flag a spike. Default 0.5 (±50%). */
  spikeThreshold?: number;
}

export function detectPriceAnomaly(
  next: Money,
  previous: Money | null,
  options: AnomalyOptions = {},
): PriceAnomaly | null {
  if (next.amountMinor <= 0) {
    return { kind: "non_positive", message: `Non-positive price: ${next.amountMinor}` };
  }
  if (!previous) return null;
  if (previous.currency !== next.currency) {
    return {
      kind: "currency_changed",
      message: `Currency changed ${previous.currency} -> ${next.currency}`,
    };
  }
  if (previous.amountMinor <= 0) return null;

  const threshold = options.spikeThreshold ?? 0.5;
  const changeRatio = (next.amountMinor - previous.amountMinor) / previous.amountMinor;
  if (Math.abs(changeRatio) > threshold) {
    return {
      kind: "spike",
      changeRatio,
      message: `Price moved ${(changeRatio * 100).toFixed(1)}% (> ±${(threshold * 100).toFixed(0)}%)`,
    };
  }
  return null;
}
