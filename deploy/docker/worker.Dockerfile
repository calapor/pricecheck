# Shared image for the worker, scheduler, and migration jobs. Runs TS via tsx
# (internal packages are consumed from source — no per-package build step).
#
# NOTE: when the "browser" scrape strategy is enabled, switch the base to
# mcr.microsoft.com/playwright:v1.49.0-jammy so Chromium + deps are present.
FROM node:22-slim
ENV CI=true
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production
RUN corepack enable
WORKDIR /app

# Install all workspace deps (dev deps included for tsx).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile --config.confirmModulesPurge=false

EXPOSE 9091
# Default to the worker; override `command` in the k8s manifests for the
# scheduler (`pnpm scheduler`) and migrations (`pnpm db:migrate`).
CMD ["pnpm", "worker"]
