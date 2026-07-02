<p align="center">
  <img src="../../docs/assets/pricecheck-logo.png" alt="PriceCheck — Smart Price Comparison App" width="480">
</p>

# 0007 — AI-generated scraper plugins (generate → judge → sandbox)

**Status:** Accepted

## Context

The costliest, most fragile part of a price tracker is writing and maintaining a bespoke
adapter for every shop. Onboarding a new retailer shouldn't require an engineer. Modern
LLMs can read a page's markup and produce extraction code — but running model-authored
code is a security and quality risk.

## Decision

Let **Claude author scrapers at runtime**, gated by a two-model loop and a sandbox:

1. **Generate** — fetch the shop page, strip scripts/styles, and prompt a generator model
   to emit a CommonJS bundle exporting `scrape()` with an embedded `// METADATA` comment
   ([`api/scrapers/generate`](../../apps/web/src/app/api/scrapers/generate/route.ts)).
2. **Judge** — a separate model scores the bundle (`install` / `warn` / `reject`) with
   findings; `reject` blocks installation
   ([`packages/scrapers/src/evals/`](../../packages/scrapers/src/evals/)).
3. **Review & install** — a human may edit the bundle, then it's upserted into
   `scraper_plugins` with a `version`.
4. **Sandbox** — the worker compiles the bundle in a `node:vm` context that omits
   `require`, `process`, `fetch`, and `globalThis`; bundles reference only injected
   `ctx.*` helpers + `input.*`
   ([`plugin-loader.ts`](../../packages/scrapers/src/plugin-loader.ts)).

## Consequences

- **Positive:** new shops are "learnt and added" in minutes, region-agnostic, without
  hand-written adapters; plugins run through the same contract as built-ins
  ([ADR-0004](0004-adapter-and-circuit-breaker-per-retailer.md)).
- **Positive:** generated code can't exfiltrate credentials or make unsandboxed network
  calls; the judge + human review gate quality before install.
- **Negative:** generation/judging cost Claude tokens and add latency; oversized pages can
  exceed the context window (handled with clear errors).
- **Negative:** the sandbox constrains what a plugin can do (only injected helpers) — a
  deliberate trade-off of capability for safety. `version` invalidates the worker's
  compiled-plugin cache on re-install.
