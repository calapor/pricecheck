# Security

## Reporting a vulnerability

This is a portfolio project. If you spot a security issue, please open a GitHub issue (omit
sensitive details) or contact the maintainer, rather than filing a public exploit.

## How secrets are handled

- **Nothing secret is committed.** All credentials and API keys are read from the
  environment (`process.env`) or from Kubernetes Secrets at runtime — never hard-coded.
- **`.env.local`** (real keys such as `ANTHROPIC_API_KEY`) is git-ignored; only
  [`.env.example`](.env.example) is tracked, and it contains **non-secret local-dev
  placeholders** (e.g. `postgres://pricecheck:pricecheck@localhost`) for a throwaway local
  database — not usable anywhere real.
- **Helm** templates credentials from values (`deploy/helm/pricecheck`). The in-chart
  Postgres password is a **staging-only default**; production disables in-cluster Postgres
  and supplies `secrets.databaseUrl` / `secrets.existingSecret` (see
  [`specs/deployment.md`](specs/deployment.md)).
- **CI/CD** uses provider-managed secrets: GitHub Actions `secrets.*` (e.g.
  `GITHUB_TOKEN`, `KUBE_CONFIG`) and Jenkins credential IDs — reference-only, never the
  secret values.

## AI-generated code

Scrapers authored by Claude run in a locked-down `node:vm` sandbox (no `require`,
`process`, `fetch`, or `globalThis`) and are gated by an AI judge plus human review before
install. See [ADR-0007](docs/adr/0007-ai-generated-scraper-plugins.md) and
[`specs/ai-rules.md`](specs/ai-rules.md).
