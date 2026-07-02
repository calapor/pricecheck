<p align="center">
  <img src="../../docs/assets/pricecheck-logo.png" alt="PriceCheck — Smart Price Comparison App" width="480">
</p>

# 0005 — Denormalized `offers` current-state for O(1) reads

**Status:** Accepted

## Context

The UI shows the *current* price/stock for many offers at once and must feel instant.
Deriving "latest" by scanning the append-only `price_history` on every read would be slow
and would couple the read path to write volume.

## Decision

Keep denormalized **current-state columns on `offers`** — `latestPriceMinor`,
`latestInStock`, `lastScrapedAt`, plus the deal columns `referencePriceMinor`, `onSale`,
`reductionBps`. `recordScrape` updates these in the same idempotent write that appends to
`price_history`. Reads hit one indexed row per offer; a composite `(onSale, reductionBps)`
index powers the "On Sale Now" query.

## Consequences

- **Positive:** O(1) reads independent of history size; the read path never touches the
  scrape path ([ADR-0002](0002-decouple-scrape-path-via-queue.md)).
- **Positive:** deal computation happens once at write time, not per read.
- **Negative:** current state is duplicated between `offers` and `price_history` — kept
  consistent by writing both in the same `recordScrape` transaction.
- **Note:** `price_history` will be partitioned by month once it grows.
