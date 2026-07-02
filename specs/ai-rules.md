<p align="center">
  <img src="../docs/assets/pricecheck-logo.png" alt="PriceCheck — Smart Price Comparison App" width="480">
</p>

# AI & Engineering Rules

Conventions the codebase follows — the guardrails an AI agent (or human) must respect when
extending PriceCheck.

## Code conventions

- **TypeScript, strict.** Types are shared from `packages/*`; no `any` at boundaries.
- **Zod at every scraper boundary.** Parse/validate scraped data before it enters the
  domain — a broken parser fails validation instead of writing garbage.
- **Money as integer minor units + ISO-4217 currency, never floats.** Parse at the edge
  (`packages/core/src/money.ts`), format only in the UI. See
  [ADR-0003](../docs/adr/0003-money-as-integer-minor-units.md).
- **Idempotent writes.** Upserts key on offer + `sourceHash`; identical re-scrapes are
  no-ops so at-least-once queue retries are safe.
- **Lazy infra connections.** DB/queue clients connect on first use, so builds and cold
  imports never require live Postgres/Redis.
- **Fixtures over mocks.** Adapter parsers are tested against saved HTML fixtures
  (`packages/scrapers/src/adapters/__fixtures__`) — real regressions caught without live
  sites. No lorem-ipsum / fake data in place of real behavior.

## Scraping ethics

- Prefer official APIs / affiliate feeds; honor `robots.txt` and crawl-delay; identify the
  bot; cache aggressively. Each retailer's ToS posture is tracked on its `retailers.policy`.
- Per-retailer concurrency caps so scaling the worker fleet never breaches a site's rate
  limit.

## AI-generated scrapers (generate → judge → sandbox)

PriceCheck lets Claude author scrapers at runtime. The rules that make this safe:

- **Two-model loop.** A generator produces the scraper bundle; a separate **judge** scores
  it (`install` / `warn` / `reject`) with findings. A `reject` blocks install. See
  [`apps/web/src/app/api/scrapers/generate/route.ts`](../apps/web/src/app/api/scrapers/generate/route.ts)
  and [`packages/scrapers/src/evals/`](../packages/scrapers/src/evals/).
- **Sandboxed execution.** Plugins run in a `node:vm` context that deliberately omits
  `require`, `process`, `fetch`, and `globalThis`, so a malicious or broken bundle cannot
  read credentials or make unsandboxed network calls. Bundles may reference only injected
  `ctx.*` helpers + `input.*`
  ([`plugin-loader.ts`](../packages/scrapers/src/plugin-loader.ts)).
- **Versioned & reviewable.** Bundles are stored in `scraper_plugins` with a `version`
  that invalidates the worker cache; a human can edit the bundle before installing.
- **Keys from env only.** `ANTHROPIC_API_KEY` is read from the environment and never
  committed; the generate endpoint returns a clear 503 if it's missing.

See [ADR-0007](../docs/adr/0007-ai-generated-scraper-plugins.md) for the full rationale.
