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

| File | Status | Route | What to show | Referenced in |
|------|--------|-------|--------------|---------------|
| `on-sale-now.png` | ✅ captured | `/` | On Sale Now deals table — Product · Shop · Current · Normal · Reduction %, per-row sparklines, Refresh-all | `README.md`, `specs/user-flows.md` |
| `configure.png` | ✅ captured | `/configure` | Products + Shops panels | `specs/user-flows.md` |
| `generating.png` | ✅ captured | `/configure` → **✦ Generate scraper** | Paste-URL dialog in the "Generating…" state | `specs/user-flows.md` |
| `add-shop-ai.png` | ✅ captured | `/configure` → **✦ Generate scraper** | Generated bundle + the AI judge verdict (`install` / `warn` / `reject`) + findings | `README.md`, `specs/user-flows.md`, `docs/portfolio/README.md` |
| `admin-ai-usage.png` | ⬜ pending | `/admin` | AI-usage dashboard — token/cost trend charts with per-route/model breakdown | `specs/user-flows.md`, `docs/portfolio/README.md` |
| `observability.png` | ⬜ pending | Grafana **or** `kubectl` | Scrape success-rate / duration panel, or `kubectl get pods -n pricecheck` showing web/worker/scheduler pods | `specs/architecture.md` |

> The `/admin` dashboard is password-gated (`ADMIN_PASSWORD` / `secrets.adminPassword`).
> To exercise the AI generate flow locally, set `ANTHROPIC_API_KEY` in `.env`.
