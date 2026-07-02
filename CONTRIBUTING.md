# Contributing

PriceCheck is a pnpm monorepo. Thanks for taking a look — here's how to get set up and the
conventions the project follows.

## Setup

```bash
pnpm install
cp .env.example .env          # local dev defaults (non-secret placeholders)
pnpm db:migrate && pnpm db:seed
pnpm dev                      # web at http://localhost:3000
pnpm worker                   # process scrape jobs
pnpm scheduler                # enqueue a scrape sweep
```

You need local **Postgres** and **Redis** (or point `DATABASE_URL` / `REDIS_URL` at your
own). Scraper generation needs `ANTHROPIC_API_KEY` in `.env.local` — never commit it.

## Quality gates

All must be green before a PR (they run in CI):

```bash
pnpm -r lint        # eslint
pnpm -r typecheck   # tsc --noEmit
pnpm -r test        # vitest (fixtures + contract + unit)
pnpm -r build       # next build (standalone)
```

## Conventions

- **Spec-first.** Behavior is described in [`specs/`](specs/) before it's built; keep specs
  in sync with code. Follow the engineering rules in [`specs/ai-rules.md`](specs/ai-rules.md)
  (Zod at boundaries, money as integer minor units, idempotent writes, fixtures over mocks).
- **Decisions → ADRs.** Significant architectural choices are recorded in
  [`docs/adr/`](docs/adr/) using the Nygard format. Add a new numbered ADR rather than
  editing an accepted one.
- **Diagrams from `.puml`.** Architecture/flow diagrams are rendered from PlantUML sources
  in [`docs/diagrams/`](docs/diagrams/) — edit the `.puml` and re-render the `.png`; never
  hand-edit a PNG or add ASCII diagrams. See
  [`docs/diagrams/README.md`](docs/diagrams/README.md).
- **No secrets in the repo.** See [`SECURITY.md`](SECURITY.md).

## Pull requests

Keep PRs focused, describe the change, and make sure the quality gates pass. Match the
style of the surrounding code.
