<p align="center">
  <img src="../docs/assets/pricecheck-logo.png" alt="PriceCheck — Smart Price Comparison App" width="480">
</p>

# Design System

Brand and UI conventions. Wireframes: `PriceWatch.pdf` (repo root).

## Brand

- **Name:** PriceCheck — *"Smart Price Comparison App"* (see the logo in
  [`docs/assets/pricecheck-logo.png`](../docs/assets/pricecheck-logo.png)).
- **Palette:** blue → orange gradient mark on a light ground; neutral **zinc** UI with
  full **dark-mode** support.
- **Semantic colours:** green = good / `install`, amber = warning / `warn`, red = error /
  `reject` (used for the AI judge verdict and destructive actions).

## Foundations

- **Stack:** Next.js App Router + React + **Tailwind CSS 4**; utility-first, no bespoke CSS
  framework.
- **Typography & spacing:** system/Inter-style sans; compact, dense tables; small text
  scales (`text-xs`/`text-sm`) for controls.
- **Components** live under [`apps/web/src/app/components`](../apps/web/src/app/components)
  and per-route folders (e.g. `configure/`).

## Key surfaces

- **On Sale table** ([`deals-table.tsx`](../apps/web/src/app/components/deals-table.tsx)) —
  sortable columns: Product · Shop · Current Price · Normal Price · Reduction %, with an
  inline [sparkline](../apps/web/src/app/components/sparkline.tsx). Stale rows show a
  staleness badge.
- **Header** ([`app-header.tsx`](../apps/web/src/app/components/app-header.tsx)) — nav +
  Refresh / Configure entry points.
- **Configure forms** (`configure/*`) — inline edit rows, Save/Cancel, and a **"Saved"
  toast** ([`save-toast.tsx`](../apps/web/src/app/configure/save-toast.tsx)).
- **Generate-scraper wizard** ([`shops-panel.tsx`](../apps/web/src/app/configure/shops-panel.tsx))
  — URL input → generating state → judge verdict badge (score + findings) → editable
  bundle → Install / Regenerate / Cancel.

## Principles

- **Read path never blocks** — always render last-known data with a freshness cue rather
  than a spinner tied to a live scrape.
- **Currency- and region-agnostic** — format prices from stored minor units + currency
  code; never hard-code a locale.
- **Reuse before adding** — prefer existing components/utilities; match the surrounding
  Tailwind idiom.
