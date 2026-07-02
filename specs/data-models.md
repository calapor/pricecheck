<p align="center">
  <img src="../docs/assets/pricecheck-logo.png" alt="PriceCheck — Smart Price Comparison App" width="480">
</p>

# Data Models

Source of truth: [`packages/db/src/schema.ts`](../packages/db/src/schema.ts) (Drizzle +
PostgreSQL). This is a reference summary — see [`architecture.md`](architecture.md#data-model-packagesdbsrcschemats)
for how the model supports decoupled reads/writes.

**Money rule:** prices are stored as integer **minor units** (e.g. cents) plus an
ISO-4217 `currency` code — **never floats**. Parsed at the scraper edge, formatted only in
the UI. See [`packages/core/src/money.ts`](../packages/core/src/money.ts) and
[ADR-0003](../docs/adr/0003-money-as-integer-minor-units.md).

## Entities

| Table | Purpose | Key fields |
|-------|---------|-----------|
| `retailers` | A shop we scrape (one adapter/plugin per retailer). | `slug` (unique), `name`, `baseUrl`, `strategy` (`http`/`browser`/`api`), `maxConcurrency`, `crawlDelayMs`, `policy` (ToS/robots notes), `enabled` |
| `products` | Canonical product, shared across retailers. | `gtin` (unique cross-retailer key), `title`, `brand`, `category`, `fuzzyKey` (fallback match when GTIN absent) |
| `offers` | A product **at a retailer** — the denormalized current-state row the UI reads O(1). | `productId`, `retailerId`, `retailerSku` (unique per retailer), `productUrl`, `currency`, `latestPriceMinor`, `latestInStock`, `lastScrapedAt`, `lastSourceHash`, `freshnessTargetMinutes` |
| `offers` — deal columns | Populated by `recordScrape` after each price write. | `referencePriceMinor` (normal price), `onSale`, `reductionBps` (basis points off) |
| `price_history` | Append-only price time series (partition by month once large). | `offerId`, `priceMinor`, `currency`, `inStock`, `scrapedAt`, `sourceHash`, `parserVersion` |
| `scrape_runs` | Audit/observability row per scrape attempt. | `offerId`, `retailerId`, `status` (`pending`/`success`/`failed`/`skipped`), `attempt`, `error`, `durationMs`, `parserVersion` |
| `alerts` | Per-offer price-drop subscription (single-household, no auth). | `offerId` (unique), `enabled`, `targetPriceMinor` |
| `scraper_plugins` | AI-generated or user-installed scrapers, loaded lazily by the worker. | `slug` (PK), `displayName`, `baseUrl`, `bundleJs`, `version` (bumped per upsert to invalidate the worker's cache), `enabled` |

## Notable relationships & indexes

- `offers` → `products` and `retailers` (both `ON DELETE CASCADE`); unique on
  `(retailerId, retailerSku)`. Indexes: `product`, stale-by-`lastScrapedAt`, and a
  composite `(onSale, reductionBps)` powering the "On Sale Now" query.
- `price_history` indexed by `(offerId, scrapedAt)` for fast per-offer trends.
- `scrape_runs` indexed by `(retailerId, startedAt)` for per-shop health.

## Why the shape

- **Denormalized `offers.latest*`** gives the read path O(1) current state so the UI never
  waits on a scrape ([ADR-0005](../docs/adr/0005-denormalized-offers-for-o1-reads.md)).
- **`lastSourceHash` + `price_history.sourceHash`** make re-scrapes **idempotent** —
  identical content is a no-op, so at-least-once queue retries are safe.
- **`scraper_plugins.version`** lets the worker cache compiled plugins and invalidate them
  when an AI-generated bundle is re-installed
  ([ADR-0007](../docs/adr/0007-ai-generated-scraper-plugins.md)).
