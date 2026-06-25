# Self-Hosted Jenkins CI/CD (arm64 Raspberry Pi cluster)

A fully self-hosted alternative to the GitHub Actions pipeline: Jenkins runs **on the
cluster**, builds images with **Kaniko**, pushes to an **in-cluster registry**, and
deploys with `helm upgrade` — no external cloud or registry. Everything runs natively on
**aarch64 / Raspberry Pi**.

```
git push → Jenkins (on cluster) → node: lint/typecheck/test/build
                                → kaniko: build web+worker (arm64) → in-cluster registry
                                → helm: upgrade --install → pods pull from registry
```

See the diagram: [`docs/diagrams/jenkins-pipeline.png`](../docs/diagrams/jenkins-pipeline.png).

## arm64 notes (why each image is safe on Pi)

| Component | Image | arm64 |
|-----------|-------|-------|
| Jenkins controller | `jenkins/jenkins:lts` | multi-arch ✓ |
| Build/test agent | `node:22-bookworm` | multi-arch ✓ |
| Image builder | `gcr.io/kaniko-project/executor:*-debug` | multi-arch ✓ |
| Deploy | `alpine/helm:3.16.3` | multi-arch ✓ |
| Registry | `registry:2.8.3` | multi-arch ✓ |
| App images | built **on** the cluster → natively arm64 | ✓ |

The app `Dockerfile`s use `node:22-slim` (multi-arch), so no cross-compilation is needed —
images are built on arm64 nodes and run on arm64 nodes. `next build` heap is capped
(`NODE_OPTIONS=--max-old-space-size=2048` in `web.Dockerfile`) to avoid OOM on low-RAM Pis.

## Prerequisites

- A working kubeconfig on your Mac that reaches the cluster (`kubectl get nodes`).
- Helm v3 locally.
- A default StorageClass (k3s ships `local-path`; the manifests default to it).

## 1. In-cluster registry

```bash
kubectl apply -f deploy/jenkins/registry.yaml
```

Then tell **containerd** on every node to treat `registry.pricecheck:5000` as an insecure
mirror reachable on the registry's NodePort. On **k3s**, create `/etc/rancher/k3s/registries.yaml`
on each node:

```yaml
mirrors:
  "registry.pricecheck:5000":
    endpoint:
      - "http://127.0.0.1:30500"
configs:
  "registry.pricecheck:5000":
    tls:
      insecure_skip_verify: true
```

Restart k3s on each node (`sudo systemctl restart k3s` / `k3s-agent`). This is the key
trick: Kaniko **pushes** to `registry.pricecheck:5000` via cluster DNS, and containerd
**pulls** the same name through the mirror endpoint — so the image ref resolves on both
sides without public DNS.

## 2. Deployer RBAC

```bash
kubectl create namespace jenkins
kubectl apply -f deploy/jenkins/rbac.yaml
```

## 3. Jenkins (Helm chart)

```bash
helm repo add jenkins https://charts.jenkins.io && helm repo update
helm upgrade --install jenkins jenkins/jenkins \
  -n jenkins --create-namespace \
  -f deploy/jenkins/values.yaml
```

Get the admin password and open the UI (NodePort 32010):

```bash
kubectl -n jenkins exec deploy/jenkins -c jenkins -- \
  cat /run/secrets/additional/chart-admin-password
# UI: http://<any-node-ip>:32010   (user: admin)
```

The chart's **Configuration-as-Code** seeds a `pricecheck` pipeline job straight from this
repo's `Jenkinsfile` (no manual job setup), and wires up the Kubernetes agent cloud.

### 3b. Repo access (private repo)

`calapor/pricecheck` is private, so Jenkins needs a credential to clone it (GitHub no
longer allows anonymous/password HTTPS). Either **make the repo public**, or add a token:

1. Create a GitHub **fine-grained PAT** scoped to `calapor/pricecheck` with
   **Contents: Read-only** (or a classic token with `repo`).
2. Jenkins → **Manage Jenkins → Credentials → System → Global → Add Credentials**:
   *Username with password* — username `calapor`, password = the token, **ID `github-pat`**.
3. The seeded job already references `credentials('github-pat')` (see `values.yaml`). If you
   changed the ID or added the token after first install, re-apply the config so the job
   picks it up:
   ```bash
   helm upgrade jenkins jenkins/jenkins -n jenkins -f deploy/jenkins/values.yaml
   ```
   (The config-reload sidecar re-seeds the job.) If the repo is **public**, delete the
   `credentials('github-pat')` line from `values.yaml` instead and re-apply.

## 4. Run it

- **Manually:** open the `pricecheck` job → **Build Now**.
- **On push:** add a GitHub webhook → `http://<node-ip>:32010/github-webhook/` (or enable
  SCM polling in the job). On `main`, the pipeline builds images and deploys.

The pipeline (`Jenkinsfile`) stages: **Setup → Install → Verify** (lint/typecheck/test/build,
runs on every branch) → **Build & push images** → **Deploy** (`main` only).

## 5. Verify the deploy

```bash
kubectl -n pricecheck get pods -w
kubectl -n pricecheck port-forward svc/pricecheck-web 3000:80   # open http://localhost:3000
```

## Troubleshooting

- **Kaniko can't reach the registry** — confirm `kubectl -n pricecheck get svc registry`
  and that the agent pod resolves `registry.pricecheck:5000` (cross-namespace DNS).
- **ImagePullBackOff** — the node's `registries.yaml` mirror is missing/incorrect, or k3s
  wasn't restarted after editing it.
- **`next build` OOM on a node** — lower `NODE_OPTIONS` / raise kaniko memory limits, or
  pin builds to a beefier node with a `nodeSelector` in the Jenkinsfile pod template.
- **Kaniko arm64 issues** — swap the `kaniko` container for `quay.io/buildah/stable`
  (also arm64) and `buildah bud … && buildah push`.

## GitHub Actions vs Jenkins here

Both pipelines run the same commands and produce the same images/chart. GitHub Actions
(`.github/workflows/`) is cloud-hosted and zero-maintenance; Jenkins is fully self-hosted
on your cluster (no external dependency, stronger infra-skills showcase). Keep either, or
both.
