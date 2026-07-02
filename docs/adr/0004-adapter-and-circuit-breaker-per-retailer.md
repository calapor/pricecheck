<p align="center">
  <img src="../../docs/assets/pricecheck-logo.png" alt="PriceCheck — Smart Price Comparison App" width="480">
</p>

# 0004 — Adapter + circuit breaker per retailer

**Status:** Accepted

## Context

Each shop has its own markup, quirks, and failure modes, and any one can go down or start
blocking us at any time. Without isolation, one broken or hostile site could spend all
worker capacity retrying and drag down scraping for every other shop.

## Decision

Model each retailer behind an **adapter** (a `Scraper` implementing fetch+parse) selected
from a registry, and guard each retailer with its own **circuit breaker**
(`packages/scrapers/src/circuit-breaker.ts`): after N consecutive failures the breaker
opens, jobs fail fast and back off, then a probe re-closes it. Per-retailer concurrency
and crawl-delay come from the `retailers` row. AI-generated scrapers plug in through the
same adapter contract ([ADR-0007](0007-ai-generated-scraper-plugins.md)).

## Consequences

- **Positive:** fault isolation — a failing site can't starve the others; we stop
  hammering sites that are down or rate-limiting us.
- **Positive:** uniform contract makes built-in adapters and AI-generated plugins
  interchangeable.
- **Negative:** per-retailer breaker/limit state to track and tune.
