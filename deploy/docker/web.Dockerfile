# Build the Next.js web app (standalone output) from the monorepo.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV CI=true
ENV PNPM_CONFIG_CONFIRM_MODULES_PURGE=false
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
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

# @vercel/nft (used by Next.js `output: 'standalone'`) can't statically trace the
# merge-deep → clone-deep → shallow-clone → … lazy-cache micro-package web that
# puppeteer-extra-plugin-stealth pulls in: every dep is loaded through lazy-cache's
# string-argument require() — e.g. require('is-plain-object', 'isObject') — so the
# whole sub-tree is silently omitted from the standalone bundle and the server dies
# at runtime with "Cannot find module 'is-plain-object'". Copy that dependency
# closure into the standalone store, preserving pnpm's symlink layout (cp -a) so
# nested resolution (e.g. is-plain-object → isobject) keeps working. The stealth
# plugin declaring is-plain-object (pnpm-workspace.yaml packageExtensions) is a
# prerequisite for this — it makes the module installable — but not sufficient on
# its own, because nft still can't see the dynamic require.
RUN set -eu; \
    dest=apps/web/.next/standalone/node_modules/.pnpm; \
    for pkg in merge-deep clone-deep shallow-clone mixin-object is-plain-object \
               is-extendable isobject kind-of is-buffer for-own for-in arr-union \
               lazy-cache; do \
      cp -a node_modules/.pnpm/$pkg@* "$dest"/; \
    done

FROM base AS runner
ENV NODE_ENV=production
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
