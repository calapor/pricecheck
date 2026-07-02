<p align="center">
  <img src="../../docs/assets/pricecheck-logo.png" alt="PriceCheck — Smart Price Comparison App" width="480">
</p>

# 0003 — Store money as integer minor units + ISO-4217

**Status:** Accepted

## Context

Prices come off pages as locale-formatted strings and must be stored, compared, and
aggregated (reductions, history). Floating-point currency is a classic source of rounding
bugs, and PriceCheck is explicitly **multi-currency / region-agnostic**, so we cannot
assume two decimal places — some ISO-4217 currencies have zero or three.

## Decision

Store every price as an **integer count of minor units** alongside an **ISO-4217
`currency` code**. Parse at the scraper edge (`packages/core/src/money.ts`), keep it
integer through the domain and DB, and format to a locale string only in the UI.

## Consequences

- **Positive:** exact arithmetic; correct handling of zero-decimal and three-decimal
  currencies; trivial comparison for reduction % and anomaly checks.
- **Positive:** a real **zero-decimal-currency parsing bug** was caught by tests thanks to
  this model.
- **Negative:** every boundary must convert deliberately (string ↔ minor units); enforced
  by Zod parsing and shared helpers.
