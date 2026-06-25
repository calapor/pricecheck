# Build the Next.js web app (standalone output) from the monorepo.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV CI=true
ENV PNPM_CONFIG_CONFIRM_MODULES_PURGE=false
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enabled
RUN corepack prepare pnpm@11.1.1 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
COPY packages/observability/package.json packages/observability/
RUN pnpm install --frozen-lockfile --config.confirmModulesPurge=false

FROM deps AS build
COPY . .
# Cap the heap so `next build` doesn't OOM on memory-constrained (e.g. Raspberry Pi)
# build nodes. Raise if your build agents have more RAM.
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN pnpm --filter @pricecheck/web build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
