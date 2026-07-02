<p align="center">
  <img src="../../docs/assets/pricecheck-logo.png" alt="PriceCheck — Smart Price Comparison App" width="480">
</p>

# 0008 — Headless browser fallback for bot-blocked retailers

**Status:** Accepted

## Context

Some high-value retailers (e.g. Dunnes Stores, Tesco IE) return `403 Forbidden` to plain
HTTP requests, regardless of polite-bot headers. The circuit breaker (ADR-0004) handles
*persistent* failures gracefully, but a bot-wall is not an outage — the data is available
to any request that looks like a real browser, so the circuit should not trip.

## Decision

Add `browserFetcher` (`packages/scrapers/src/browser.ts`) as an optional second-tier
fetcher powered by **Playwright + `puppeteer-extra-plugin-stealth`**. Compose it with
`httpFetcher` via `escalatingFetcher` (`packages/scrapers/src/fetcher.ts`):

- On **success** — return the HTTP response; the browser is never touched.
- On **bot-block** error (`401`, `403`, `"forbidden"`, `"access denied"`) — retry the
  same URL via headless Chromium with stealth fingerprinting.
- On **any other error** (`404`, `5xx`, timeout) — rethrow immediately; the browser
  cannot fix these, so we never pay the Chromium startup cost for them.

Implementation details:

- **Lazy singleton** — Chromium only launches on the first bot-block; zero overhead for
  retailers that serve HTTP normally.
- **Per-origin context reuse** — each hostname gets one persistent browser context so
  cookies and JS-challenge tokens survive across multiple scrape jobs.
- **Kubernetes / Pi-cluster aware** — `--disable-dev-shm-usage` routes shared memory to
  `/tmp`, preventing OOM crashes in pods with a 64 MiB `/dev/shm` (default for k3s).
- **Metrics** — `browserFallbacks{host}` counter (Prometheus) tracks escalation rate per
  retailer so we can detect when stealth evasion starts failing.

The worker wires the composed fetcher at startup
(`apps/worker/src/process-scrape.ts: escalatingFetcher(httpFetcher(), browserFetcher())`).
The `install` smoke-test in the web app uses the same fetcher, so it accurately represents
what the worker will see.

## Consequences

- **Positive:** bot-blocked retailers are recovered automatically without human
  intervention; no unnecessary circuit-breaker trips.
- **Positive:** scrapers are fully transparent — they call `ctx.fetchHtml(url)` and never
  learn whether HTTP or the browser served the page.
- **Negative:** Chromium adds approximately 200 MB RAM per worker pod. Mitigated by lazy
  init (no Chromium if no bot-walls encountered) and the Pi-cluster `/dev/shm` workaround.
- **Negative:** stealth evasion is an arms race; sophisticated fingerprinting defences
  (Cloudflare Enterprise, PerimeterX) may still block headless browsers. When that
  happens the `browserFallbacks` counter spikes and the circuit breaker eventually opens,
  surfacing the failure cleanly.
