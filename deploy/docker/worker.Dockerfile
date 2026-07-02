# Shared image for the worker, scheduler, and migration jobs. Runs TS via tsx
# (internal packages are consumed from source — no per-package build step).
#
# The worker's 403 → headless-browser fallback needs Chromium. We stay on node:22-slim
# (the repo requires Node >=22; the mcr.microsoft.com/playwright images ship Node 20)
# and install Chromium + its OS libs via `playwright install --with-deps` below, which
# pulls the arm64 build automatically for the RPi cluster.
FROM node:22-slim
ENV CI=true
ENV PNPM_CONFIG_CONFIRM_MODULES_PURGE=false
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production
# Stable, well-known location for the downloaded Chromium (survives Kaniko snapshotting).
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Install pnpm as a real global binary. node:22-slim ships a dangling `pnpm`
# corepack stub at /usr/local/bin/pnpm (resolves on PATH but fails at runtime with
# "not found", and makes a plain `npm i -g` error with EEXIST). --force overwrites it
# with a real, self-contained pnpm binary that works offline at runtime.
RUN npm install -g pnpm@11.1.1 --force
WORKDIR /app

# Install all workspace deps (dev deps included for tsx).
# `.npmrc` sets node-linker=hoisted (flat, real-directory node_modules instead of pnpm's
# symlinked store) — Kaniko drops those symlinks when snapshotting, which left pino and
# its transitive deps dangling at runtime. Copying `.npmrc` also carries
# verify-deps-before-run=false so `pnpm worker` never re-installs (isolated) at boot.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json .npmrc ./
COPY apps ./apps
COPY packages ./packages
# Skip Playwright's per-package postinstall browser download; we do one explicit,
# deps-included install into PLAYWRIGHT_BROWSERS_PATH on the next layer instead.
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install --frozen-lockfile --config.confirmModulesPurge=false

# Chromium + the system libraries it needs (apt) for the headless-browser fallback.
RUN pnpm --filter @pricecheck/scrapers exec playwright install --with-deps chromium

EXPOSE 9091
# Default to the worker; override `command` in the k8s manifests for the
# scheduler (`pnpm scheduler`) and migrations (`pnpm db:migrate`).
CMD ["pnpm", "worker"]
