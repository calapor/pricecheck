# Prompts

This folder collects the AI prompts that shaped PriceCheck — both the **SDLC prompts**
used to design, build, test, and deploy the project, and the **runtime prompts** the app
itself sends to Claude.

## Runtime prompts (in code)

The prompts the running app uses to generate and judge scrapers are versioned with the
code they belong to:

- **Scraper generator + judge:** [`packages/scrapers/src/prompts`](../packages/scrapers/src/prompts)
  (`GENERATOR_SYSTEM_PROMPT`, `GENERATOR_USER_TEMPLATE`, `JUDGE_SYSTEM_PROMPT`), invoked
  from [`apps/web/src/app/api/scrapers/generate/route.ts`](../apps/web/src/app/api/scrapers/generate/route.ts).
  See [ADR-0007](../docs/adr/0007-ai-generated-scraper-plugins.md).

## SDLC prompts

A curated selection of the prompts used to drive each SDLC stage (design → build → test →
deploy) will be collected here. The engineering decisions those prompts produced are
recorded as ADRs in [`docs/adr/`](../docs/adr/).
