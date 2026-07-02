# 0001 — Self-host on Kubernetes (vs serverless)

**Status:** Accepted

## Context

PriceCheck runs a small workload: fewer than ~10 retailers, <50k SKUs, on a mostly
**daily** cadence with occasional on-demand refresh. The candidate deployment models were
managed serverless (SQS/Fargate/QStash-style) versus running on an owned Kubernetes
cluster. A serverless build would spread the system across several managed services and
their vendor APIs; the scale does not require that throughput.

## Decision

Self-host everything on an **owned Kubernetes cluster** using native primitives:
Deployments (web, workers), a CronJob (scheduler), a pre-deploy Job (migrations), and
in-cluster or operator-managed Postgres/Redis. No external managed services are required
to run the system.

## Consequences

- **Positive:** no managed-service lock-in or per-service billing; the whole system is
  expressible as k8s objects and a Helm chart; runs on modest hardware (incl. an arm64 Pi
  cluster — see [ADR-0006](0006-dual-cicd-github-actions-or-jenkins.md)).
- **Negative:** we own cluster ops, secrets, and upgrades; scale-out is our responsibility
  (mitigated by stateless workers + KEDA-readiness, see
  [ADR-0002](0002-decouple-scrape-path-via-queue.md)).
- Managed Postgres (e.g. Neon) remains a drop-in alternative via `secrets.databaseUrl`.
