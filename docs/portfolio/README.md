<p align="center">
  <img src="../../docs/assets/pricecheck-logo.png" alt="PriceCheck — Smart Price Comparison App" width="480">
</p>

# Portfolio Documentation

PriceCheck was designed and built with an AI agent (Claude) driving each SDLC stage,
with a senior engineer steering and reviewing. This folder collects the evidence of that
process: the prompts, the decisions, and the evaluation framework for AI-generated code.

## AI-leveraged SDLC

| Stage | How AI was used | Human-in-the-loop |
|-------|-----------------|-------------------|
| **Design** | Generated the architecture from requirements, surfaced trade-offs (build-vs-buy scraping, serverless vs k8s) as explicit decisions | Chose scale, infra (own k8s), self-host scraping |
| **Build** | Scaffolded the monorepo, data model, scraper adapters, queue + worker | Reviewed contracts and conventions |
| **Test** | Wrote fixture/contract/unit tests; caught a real **zero-decimal currency** parsing bug | Confirmed coverage targets |
| **Harden** | Resolved dependency skew, lazy DB/queue init, green CI across 8 packages | Verified pipeline goes green |
| **Deploy** | Authored Dockerfiles, Helm chart, GitHub Actions (CI + image build + deploy) | Owns cluster secrets/cutover |

## Prompt engineering

Runtime prompts (scraper generator and AI judge) live with the code they belong to:

- **Generator + judge system prompts:** [`packages/scrapers/src/prompts`](../../packages/scrapers/src/prompts)
- **On-demand generate endpoint:** [`apps/web/src/app/api/scrapers/generate/route.ts`](../../apps/web/src/app/api/scrapers/generate/route.ts)

SDLC prompts used to drive design, build, test, and deploy are collected in [`prompts/`](../../prompts/).

## Evaluation framework

The AI-generated scraper pipeline uses a **generate → judge → sandbox** loop:

1. Claude generates a scraper plugin from the retailer's page HTML.
2. A second Claude call (the "judge") validates the output against a test fixture — checking selectors, price parsing, and currency handling.
3. Only a judge-approved plugin is installed into the sandboxed VM registry.

This pattern is described in full in [ADR-0007](../adr/0007-ai-generated-scraper-plugins.md) and [`specs/ai-rules.md`](../../specs/ai-rules.md).

## Engineering decision log

Key architectural decisions are captured as [Architecture Decision Records](../adr/):

| ADR | Decision |
|-----|----------|
| [0001](../adr/0001-self-host-on-kubernetes.md) | Self-host on Kubernetes (vs serverless) |
| [0002](../adr/0002-decouple-scrape-path-via-queue.md) | Decouple the scrape path via a Redis/BullMQ queue + worker fleet |
| [0003](../adr/0003-money-as-integer-minor-units.md) | Store money as integer minor units + ISO-4217 |
| [0004](../adr/0004-adapter-and-circuit-breaker-per-retailer.md) | Adapter + circuit breaker per retailer |
| [0005](../adr/0005-denormalized-offers-for-o1-reads.md) | Denormalized `offers` current-state for O(1) reads |
| [0006](../adr/0006-dual-cicd-github-actions-or-jenkins.md) | Dual CI/CD: GitHub Actions or self-hosted Jenkins |
| [0007](../adr/0007-ai-generated-scraper-plugins.md) | AI-generated scraper plugins (generate → judge → sandbox) |
