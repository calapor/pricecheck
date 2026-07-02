# Product Overview

PriceCheck is a **general, multi-retailer price & on-sale tracker**. It periodically
scrapes shops, normalises their prices, and serves the latest price + price history and
current deals for every tracked product. It is **region- and currency-agnostic** — the
grocery skin in `PriceWatch.pdf` is one example, not a constraint.

Its differentiator is **AI-onboarded shops**: instead of an engineer hand-writing an
adapter per retailer, a user pastes a shop URL and **Claude inspects the page, generates a
scraper, and an AI judge validates it** before it's installed as a sandboxed plugin. New
shops are "learnt and added" at runtime.

## Core capabilities

- **AI scraper onboarding** — point at any shop → Claude generates a scraper → judge
  scores it (install / warn / reject) → install as a versioned, sandboxed plugin. The
  worker loads plugins lazily and runs them alongside built-in adapters.
- **On-sale tracking** — surfaces currently-discounted items with current price, a
  reference/normal price, and a computed reduction %.
- **Price history** — an append-only time series per offer, for trends and sparklines.
- **Resilient scraping** — retries, per-retailer circuit breakers, idempotent upserts,
  and graceful degradation (UI serves the last-known price + a staleness badge, never
  blocking on a live scrape).
- **On-demand refresh** — a priority lane to re-scrape a hot item now, on top of the
  daily scheduled sweep.
- **Price-drop alerts** — a per-offer target-price subscription (single-household).

## How it's built

Scraping is an unreliable, adversarial I/O workload, so the architecture **decouples the
fragile scrape path from the fast read path**: a **stateless worker fleet on Kubernetes**
consumes scrape jobs from a durable Redis/BullMQ queue, while the web/read path stays fast
and self-serves cached current state. Everything self-hosts on a k8s cluster — no managed
services required. Full detail in [`architecture.md`](architecture.md) and the
[architecture diagram](../docs/diagrams/architecture.png).

## Primary users

- **Deal-seeking shoppers** — browse "On Sale Now", sort by reduction %, set price-drop
  alerts.
- **The operator (single household / small team)** — configures shops and products, and
  uses the AI wizard to onboard new shops.

## Tech stack

Next.js (App Router) + React + Tailwind · PostgreSQL + Drizzle · Redis + BullMQ ·
HTTP + Playwright scrapers · Zod validation · Anthropic Claude (scraper generation +
judging) · Prometheus + structured logs · Docker + Helm + Kubernetes · GitHub Actions
**or** self-hosted Jenkins. Table in the [root README](../README.md#-tech-stack).

## Out of scope

- Multi-tenant accounts / auth (the app is single-household).
- Guaranteeing scrapes of sites that actively forbid it — legal/ethical guardrails
  (robots.txt, crawl-delay, official APIs preferred) come first; see
  [`architecture.md`](architecture.md#legal--ethical-guardrails).
- Payments, checkout, or affiliate transaction handling.
- A general-purpose crawler — PriceCheck tracks a curated set of shops/products, not the
  open web.
