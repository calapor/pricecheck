# Architecture Decision Records

Each ADR captures one significant decision in [Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):
**Status · Context · Decision · Consequences**. They are immutable once accepted — a later
decision supersedes rather than edits an earlier one.

| ADR | Decision | Status |
|-----|----------|--------|
| [0001](0001-self-host-on-kubernetes.md) | Self-host on Kubernetes (vs serverless) | Accepted |
| [0002](0002-decouple-scrape-path-via-queue.md) | Decouple the scrape path via a Redis/BullMQ queue + worker fleet | Accepted |
| [0003](0003-money-as-integer-minor-units.md) | Store money as integer minor units + ISO-4217 | Accepted |
| [0004](0004-adapter-and-circuit-breaker-per-retailer.md) | Adapter + circuit breaker per retailer | Accepted |
| [0005](0005-denormalized-offers-for-o1-reads.md) | Denormalized `offers` current-state for O(1) reads | Accepted |
| [0006](0006-dual-cicd-github-actions-or-jenkins.md) | Dual CI/CD: GitHub Actions or self-hosted Jenkins | Accepted |
| [0007](0007-ai-generated-scraper-plugins.md) | AI-generated scraper plugins (generate → judge → sandbox) | Accepted |
