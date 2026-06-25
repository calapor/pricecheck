# Deployment

PriceCheck deploys to a Kubernetes cluster via the Helm chart in
`deploy/helm/pricecheck/`. Defaults are a **self-contained staging** install
(in-cluster Postgres + Redis, chart-managed Secret, nginx Ingress); production swaps in
a managed/HA database and an existing Secret.

## What the chart deploys

| Resource | Role |
|----------|------|
| `web` Deployment + Service + Ingress | Next.js UI + read API + `/api/refresh`, `/api/healthz`, `/api/metrics` |
| `worker` Deployment | BullMQ consumer; scrape pipeline; Prometheus metrics on `:9091` |
| `scheduler` CronJob | daily enqueue sweep (`pnpm scheduler`) |
| `migrate` Job (post-install/upgrade hook) | `pnpm db:migrate`, waits for Postgres first |
| `postgres` StatefulSet *(staging)* | in-cluster Postgres; disable for prod |
| `redis` StatefulSet | BullMQ broker + latest-price cache |
| `…-env` Secret | `DATABASE_URL` + `REDIS_URL` (or reference an existing Secret) |

The **worker image** runs worker, scheduler, and migrations — the manifests just
override the container command.

## Images

Built and pushed by `.github/workflows/images.yml` to
`ghcr.io/<owner>/pricecheck/web` and `…/worker`. Set the tag you want to run:

```yaml
image:
  registry: ghcr.io
  repository: <owner>/pricecheck
  tag: sha-<commit>   # or v0.1.0
```

## Quick start (staging)

```bash
helm upgrade --install pricecheck deploy/helm/pricecheck \
  --namespace pricecheck --create-namespace \
  --set image.repository=<owner>/pricecheck \
  --set image.tag=sha-<commit> \
  --set ingress.host=pricecheck.<your-domain>

kubectl -n pricecheck get pods -w
```

The post-install hook runs migrations once Postgres is ready. To load sample data, run
`pnpm db:seed` from the worker image (see the chart's NOTES output for a one-liner).

No Ingress controller yet? Set `--set ingress.enabled=false` and port-forward:

```bash
kubectl -n pricecheck port-forward svc/pricecheck-web 3000:80
```

## Production overrides

```yaml
# values.prod.yaml
postgres:
  enabled: false            # use CloudNativePG or managed Postgres
redis:
  enabled: true             # or false + secrets.redisUrl for managed Redis
secrets:
  create: false
  existingSecret: pricecheck-env   # holds DATABASE_URL + REDIS_URL
ingress:
  className: nginx
  host: pricecheck.example.com
  tls:
    - secretName: pricecheck-tls
      hosts: [pricecheck.example.com]
imagePullSecrets:
  - name: ghcr-pull
```

```bash
helm upgrade --install pricecheck deploy/helm/pricecheck \
  -n pricecheck --create-namespace -f values.prod.yaml \
  --set image.tag=v0.1.0 --atomic --wait
```

For production Postgres, install the **CloudNativePG** operator and create a `Cluster`
(HA + PITR backups), then point `secrets.existingSecret` at its connection Secret.

## Configuration reference

| Key | Default | Notes |
|-----|---------|-------|
| `image.repository` / `image.tag` | `calapor/pricecheck` / `latest` | GHCR repo; tag per release |
| `web.replicas` | `1` | stateless; scale freely |
| `worker.replicas` / `worker.concurrency` | `1` / `4` | KEDA-on-queue-depth is a later phase |
| `scheduler.schedule` | `0 6 * * *` | daily sweep (cron) |
| `ingress.enabled` / `className` / `host` | `true` / `nginx` / `pricecheck.local` | |
| `postgres.enabled` | `true` | staging only — disable for prod |
| `redis.enabled` | `true` | disable + `secrets.redisUrl` for managed Redis |
| `secrets.create` / `existingSecret` | `true` / `""` | prod: `false` + existing Secret |
| `migrations.enabled` | `true` | post-install/upgrade migrate Job |

## Validation

The chart is verified with `helm lint`, `helm template` (staging + external-DB paths +
the `required` guards), and `kubectl apply --dry-run=client` on the rendered manifests.
