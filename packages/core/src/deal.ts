export function referenceFromHistory(prices: number[]): number {
  return Math.max(...prices);
}

export function computeDeal(
  latestMinor: number,
  referenceMinor: number,
  minReductionBps = 500,
): { onSale: boolean; reductionBps: number } {
  if (referenceMinor <= 0 || latestMinor <= 0) return { onSale: false, reductionBps: 0 };
  const reductionBps = Math.round(((referenceMinor - latestMinor) / referenceMinor) * 1e4);
  const onSale = latestMinor < referenceMinor * (1 - minReductionBps / 10000);
  return { onSale, reductionBps };
}
