<p align="center">
  <img src="../docs/assets/pricecheck-logo.png" alt="PriceCheck — Smart Price Comparison App" width="480">
</p>

# User Flows

Two screens (per `PriceWatch.pdf`): **On Sale Now** (home) and **Configure Shops &
Products**. Background scraping runs on the [worker fleet](architecture.md) — the UI never
blocks on a live scrape.

## On Sale Now (home)

Route: [`apps/web/src/app/page.tsx`](../apps/web/src/app/page.tsx) →
[`deals-table.tsx`](../apps/web/src/app/components/deals-table.tsx).

1. The page reads current state from `offers` (denormalized `latest*` + deal columns) and
   renders a **sortable table**: Product · Shop · Current Price · Normal Price ·
   Reduction %, with a per-offer [sparkline](../apps/web/src/app/components/sparkline.tsx)
   from `price_history`.
2. **Refresh all** ([`refresh-all-button.tsx`](../apps/web/src/app/components/refresh-all-button.tsx)
   → `POST /api/refresh-all`) enqueues a sweep; **per-row refresh**
   (`POST /api/refresh`) enqueues a single hot item on the priority lane.
3. **Set an alert** ([`alert-toggle.tsx`](../apps/web/src/app/components/alert-toggle.tsx)
   → `/api/alerts`) subscribes to a price-drop target for that offer.
4. Prices are always the **last known** value; if stale, the row shows a staleness badge
   rather than waiting on a scrape (graceful degradation).

> 📸 **Screenshot:** _On Sale Now — sortable deals table with per-row 30-day sparklines,
> Refresh-all, and per-row alert/refresh controls._
<!-- ![On Sale Now — deals table](../docs/screenshots/on-sale-now.png) -->

## Configure Shops & Products

Route: [`apps/web/src/app/configure/page.tsx`](../apps/web/src/app/configure/page.tsx)
→ [`configure-client.tsx`](../apps/web/src/app/configure/configure-client.tsx).

- **Shops panel** ([`shops-panel.tsx`](../apps/web/src/app/configure/shops-panel.tsx)) —
  add an existing scraper (built-in or installed plugin), edit a shop's name/URL, or
  delete it. Backed by `/api/retailers` and `/api/scrapers` (which lists built-ins +
  plugins).
- **Products panel** ([`products-panel.tsx`](../apps/web/src/app/configure/products-panel.tsx))
  — CRUD tracked products, backed by `/api/products`.
- Saving shows a **"Saved" toast**
  ([`save-toast.tsx`](../apps/web/src/app/configure/save-toast.tsx)).

> 📸 **Screenshot:** _Configure — Shops and Products panels side by side, with the "Saved"
> toast._
<!-- ![Configure Shops & Products](../docs/screenshots/configure.png) -->

## Add a new shop via AI

The headline flow. From the Shops panel, **✦ Generate scraper**:

1. **Paste a shop URL.** `POST /api/scrapers/generate`
   ([route](../apps/web/src/app/api/scrapers/generate/route.ts)) fetches the page and
   strips scripts/styles to cut tokens.
2. **Claude generates a scraper.** The generator prompt turns the HTML into a CommonJS
   bundle that exports `scrape()` and embeds a `// METADATA` comment (slug, display name,
   base URL).
3. **An AI judge validates it.** A second Claude call scores the bundle and returns a
   verdict — `install` / `warn` / `reject` — with findings. A `reject` disables the
   Install button.
4. **Review & install.** The user can edit the bundle inline, then `POST
   /api/scrapers/install` upserts it into `scraper_plugins` (bumping `version`).
5. **It becomes a shop.** The plugin appears in the "Add shop" dropdown; the worker loads
   it lazily in a **VM sandbox** ([`plugin-loader.ts`](../packages/scrapers/src/plugin-loader.ts))
   and runs it like any built-in adapter. See
   [ADR-0007](../docs/adr/0007-ai-generated-scraper-plugins.md).

> 📸 **Screenshot:** _Generate scraper — the paste-URL dialog with the generated bundle
> and the AI judge's verdict (`install` / `warn` / `reject`) and findings._
<!-- ![Add a shop via AI — generate + judge](../docs/screenshots/add-shop-ai.png) -->

## Admin / AI-usage dashboard

Route: [`apps/web/src/app/admin/page.tsx`](../apps/web/src/app/admin/page.tsx) →
[`usage-chart.tsx`](../apps/web/src/app/admin/usage-chart.tsx), gated by
[`admin-login.tsx`](../apps/web/src/app/admin/admin-login.tsx) (`POST /api/admin/login`).

Because every scraper **generate** and **judge** call is metered, the admin view turns AI
spend into an operational signal rather than a surprise on the bill:

1. Each Claude call records `route`, `operation` (generator/judge), `model`, input/output
   tokens and `costMicros` in the **`ai_usage`** table (see
   [`data-models.md`](data-models.md)).
2. The dashboard charts token usage and **cost over time**, broken down by
   route/operation/model, plus cumulative totals.
3. In **demo mode** (`demo.mode`), the same screen exposes a **Reseed** button
   (`POST /api/admin/reseed`) to reset the seeded SuperValu showcase data — see the
   `pricecheck-demo` release in [`deployment.md`](deployment.md) / the `Jenkinsfile`.

> 📸 **Screenshot:** _Admin — AI-usage dashboard: token/cost trend charts with the
> per-route/model breakdown._
<!-- ![Admin — AI-usage dashboard](../docs/screenshots/admin-ai-usage.png) -->

## Background: scheduled + on-demand scrape

Neither UI action scrapes inline — work always lands on the worker fleet via the queue:

1. A Kubernetes **CronJob** runs the scheduler (`pnpm scheduler`), which enqueues offers
   due for refresh (by `freshnessTargetMinutes`). On-demand refresh enqueues on a priority
   lane.
2. **Worker pods** consume jobs: circuit-breaker check → adapter/plugin fetch+parse →
   Zod-validated result → idempotent `recordScrape` (updates `offers`, appends
   `price_history`, recomputes deal columns) → anomaly check → `scrape_runs` audit row.
3. The next page load reflects the new current state. Full lifecycle:
   [`architecture.md`](architecture.md#how-a-scrape-flows-appsworkersrcprocess-scrapets)
   and the [scrape-flow diagram](../docs/diagrams/scrape-flow.png).
