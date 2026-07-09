<p align="center">
  <img src="../assets/pricecheck-logo.png" alt="PriceCheck — Smart Price Comparison App" width="480">
</p>

# Screenshots

This folder holds the UI screenshots referenced across the README and specs. The docs
carry **markers** (a `> 📸 **Screenshot:** …` caption plus a commented-out `<!-- ![...] -->`
image tag) so that dropping a PNG in here and uncommenting the tag is all that's needed —
nothing renders as a broken image in the meantime.

## How to capture

```bash
# 1. Bring up Postgres + Redis, then seed the SuperValu showcase data
pnpm db:migrate && pnpm db:seed
pnpm dev            # web at http://localhost:3000
pnpm worker         # in another shell — populates prices/history for the deals table
pnpm scheduler      # (optional) enqueue an initial scrape sweep
```

Capture at a **1440×900** viewport (retina/2× is fine), light theme, with the seeded
demo data so the deals table and charts are populated. Save each file with the exact name
below, then uncomment the matching `<!-- ![...] -->` line in the referencing doc.

## Shot list

| File | Route | What to show | Referenced in |
|------|-------|--------------|---------------|
| `on-sale-now.png` | `/` | On Sale Now deals table — Product · Shop · Current · Normal · Reduction %, per-row sparklines, Refresh-all | `README.md`, `specs/user-flows.md` |
| `configure.png` | `/configure` | Shops + Products panels, with the "Saved" toast visible | `specs/user-flows.md` |
| `add-shop-ai.png` | `/configure` → **✦ Generate scraper** | Paste-URL dialog with the generated bundle and the AI judge verdict (`install` / `warn` / `reject`) + findings | `README.md`, `specs/user-flows.md`, `docs/portfolio/README.md` |
| `admin-ai-usage.png` | `/admin` | AI-usage dashboard — token/cost trend charts with per-route/model breakdown | `specs/user-flows.md`, `docs/portfolio/README.md` |
| `observability.png` | Grafana **or** `kubectl` | Scrape success-rate / duration panel, or `kubectl get pods -n pricecheck` showing web/worker/scheduler pods | `specs/architecture.md` |

> The `/admin` dashboard is password-gated (`ADMIN_PASSWORD` / `secrets.adminPassword`).
> To exercise the AI generate flow locally, set `ANTHROPIC_API_KEY` in `.env`.
