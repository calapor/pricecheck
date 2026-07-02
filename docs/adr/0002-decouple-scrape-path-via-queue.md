# 0002 — Decouple the scrape path via a queue + worker fleet

**Status:** Accepted

## Context

Scraping is unreliable, adversarial, and slow: sites change markup, rate-limit, or block;
a page fetch can take seconds. Running scrapes inside the web request would make the read
path as fragile and slow as the worst site. At this scale the queue is not needed for
throughput — but it is needed for **resilience** and an **on-demand priority lane**.

## Decision

Decouple the **fragile scrape (write) path** from the **fast read path**. Web/API actions
enqueue jobs onto a durable **Redis + BullMQ** queue; a fleet of **stateless worker pods**
consumes them. A Kubernetes CronJob enqueues the daily sweep; on-demand refresh uses a
priority lane. The read path serves denormalized current state
([ADR-0005](0005-denormalized-offers-for-o1-reads.md)) and never waits on a scrape.

## Consequences

- **Positive:** retries + backoff, a DLQ window for persistent failures, and graceful
  degradation (last-known price + staleness badge). Workers scale horizontally on queue
  depth (KEDA-ready).
- **Positive:** on-demand refresh feels instant to the user while the actual scrape runs
  asynchronously.
- **Negative:** at-least-once delivery means work can run more than once — handled by
  idempotent upserts keyed on `sourceHash`.
- **Negative:** one more stateful dependency (Redis) to run in-cluster.
