<p align="center">
  <img src="../../docs/assets/pricecheck-logo.png" alt="PriceCheck — Smart Price Comparison App" width="480">
</p>

# 0006 — Dual CI/CD: GitHub Actions or self-hosted Jenkins

**Status:** Accepted

## Context

The project is a public GitHub portfolio repo, but the target runtime is a **self-hosted
arm64 Raspberry Pi Kubernetes cluster** on a private network. Cloud CI is convenient and
visible on GitHub; an in-cluster pipeline better matches an air-gapped/self-hosted story
and avoids pushing images to a public registry.

## Decision

Support **both** paths against the same Helm chart:

- **GitHub Actions → GHCR → `helm upgrade`** — `ci.yml` (lint/typecheck/test/build),
  `images.yml` (build/push), `deploy.yml` (deploy via `secrets.KUBE_CONFIG`).
- **Self-hosted Jenkins → in-cluster registry** — `Jenkinsfile` + `deploy/jenkins/*`,
  building arm64 images and pushing to a cluster-local registry.

Details in [`specs/ci-cd-pipeline.md`](../../specs/ci-cd-pipeline.md) and
[`specs/jenkins-setup.md`](../../specs/jenkins-setup.md).

## Consequences

- **Positive:** GitHub gets a green-CI portfolio signal; the cluster gets a fully
  self-hosted deploy with no cloud dependency.
- **Positive:** both target one Helm chart, so deploy behavior stays consistent.
- **Negative:** two pipelines to maintain; secrets managed in two places (GitHub
  Environments vs Jenkins credentials) — both reference-only, never committed.
