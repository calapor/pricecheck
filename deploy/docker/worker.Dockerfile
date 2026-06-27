# Shared image for the worker, scheduler, and migration jobs. Runs TS via tsx
# (internal packages are consumed from source — no per-package build step).
#
# NOTE: when the "browser" scrape strategy is enabled, switch the base to
# mcr.microsoft.com/playwright:v1.49.0-jammy so Chromium + deps are present.
FROM node:22-slim
ENV CI=true
ENV PNPM_CONFIG_CONFIRM_MODULES_PURGE=false
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production
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
RUN pnpm install --frozen-lockfile --config.confirmModulesPurge=false

EXPOSE 9091
# Default to the worker; override `command` in the k8s manifests for the
# scheduler (`pnpm scheduler`) and migrations (`pnpm db:migrate`).
CMD ["pnpm", "worker"]
