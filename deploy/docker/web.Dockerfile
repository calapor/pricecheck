# Build the Next.js web app (standalone output) from the monorepo.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV CI=true
ENV PNPM_CONFIG_CONFIRM_MODULES_PURGE=false
ENV PATH="$PNPM_HOME:$PATH"
# Install pnpm as a real global binary. node:22-slim ships a dangling `pnpm`
# corepack stub that tries to fetch from registry.npmjs.org at activation time —
# unreachable from the buildah build context on the Pi cluster. --force overwrites
# it with a self-contained binary that works fully offline.
RUN npm install -g pnpm@11.1.1 --force
WORKDIR /app

FROM base AS deps
# `.npmrc` carries node-linker=hoisted, package-import-method=copy and the
# extended network-timeout for large tarballs (next/swc, sharp) on slow CI links.
# Without it, `pnpm install` below uses pnpm's default fetch timeout and aborts
# on the arm64 @next/swc tarball ("The operation was aborted due to timeout").
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
COPY packages/observability/package.json packages/observability/
COPY packages/scrapers/package.json packages/scrapers/
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install --frozen-lockfile --config.confirmModulesPurge=false

FROM deps AS build
COPY . .
# Cap the heap so `next build` doesn't OOM on memory-constrained (e.g. Raspberry Pi)
# build nodes. Raise if your build agents have more RAM.
ENV NODE_OPTIONS=--max-old-space-size=2048
# Download the chromium binary used by the web routes' browser-fallback scraping.
# PLAYWRIGHT_BROWSERS_PATH matches the worker image so both containers store the
# binary in the same well-known location (easy to reference in comments/docs).
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN pnpm --filter @pricecheck/scrapers exec playwright install --with-deps chromium
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
#
# playwright / playwright-core are the same story: playwright-extra loads them via a
# dynamic `require('playwright-core')`, so nft never traces them. Copying the package
# dirs (in the loop) is necessary but NOT sufficient — Next also drops the `playwright`
# and `playwright-core` entries from pnpm's store-wide fallback dir (.pnpm/node_modules/),
# and that fallback is the path resolution takes from inside playwright-extra. Without it
# the require walks up, misses, and dies at runtime with "Playwright is missing". So after
# the loop we restore those two fallback symlinks from source (cp -a keeps their relative
# targets, which point at the package dirs the loop just copied — version-agnostic).
#
# The stealth plugin's EVASIONS are the exact same trap, one level deeper. nft traces the
# stealth index (statically imported by @pricecheck/scrapers) but NOT its 16 evasions, which
# playwright-extra loads through a dynamic `require('puppeteer-extra-plugin-stealth/evasions/
# <name>')` built from the plugin's `dependencies` getter. Missing them, the browser-fallback
# launch dies at runtime with "Plugin dependency not found" (e.g. add-shop for Dunnes / any shop
# that 403s and escalates to the stealth browser).
#
# The resolution is a THREE-part fix, all of which nft misses:
#  1. package DIRS — the stealth dir carries evasions/**; the three puppeteer-extra-plugin* deps
#     are what the `user-agent-override` evasion pulls in, and those in turn need a further
#     micro-package closure (deepmerge for user-preferences; fs-extra -> graceful-fs/jsonfile/
#     universalify + rimraf for user-data-dir). The is-plain-object closure is handled above.
#  2. store-wide fallback symlinks (.pnpm/node_modules/) — playwright-extra's dependency loader
#     requires user-preferences/user-data-dir FROM ITS OWN location, so it resolves them via the
#     store-wide fallback, which nft drops for these two (it keeps stealth + puppeteer-extra-plugin,
#     which is why the failure is "Plugin dependency not found", not "Cannot find module").
# WARNING: require.resolve() is NOT sufficient to verify this — it only checks the entry module
# resolves, not that its require() chain loads. The ONLY reliable check is to boot the standalone
# server and hit /api/scrapers/generate with a 403-ing shop. Verified end-to-end that way: the
# stealth chromium launches and the browser fallback fetches (then returns the shop's own page /
# bot-wall), instead of throwing "Plugin dependency not found".
RUN set -eu; \
    dest=apps/web/.next/standalone/node_modules/.pnpm; \
    for pkg in merge-deep clone-deep shallow-clone mixin-object is-plain-object \
               is-extendable isobject kind-of is-buffer for-own for-in arr-union \
               lazy-cache playwright playwright-core \
               puppeteer-extra-plugin-stealth puppeteer-extra-plugin \
               puppeteer-extra-plugin-user-preferences puppeteer-extra-plugin-user-data-dir \
               deepmerge fs-extra graceful-fs jsonfile universalify rimraf; do \
      cp -a node_modules/.pnpm/$pkg@* "$dest"/; \
    done; \
    cp -a node_modules/.pnpm/node_modules/playwright \
          node_modules/.pnpm/node_modules/playwright-core \
          node_modules/.pnpm/node_modules/puppeteer-extra-plugin-user-preferences \
          node_modules/.pnpm/node_modules/puppeteer-extra-plugin-user-data-dir "$dest"/node_modules/

FROM base AS runner
ENV NODE_ENV=production
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
# Chromium binary (downloaded in the build stage via `playwright install`).
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=build /ms-playwright /ms-playwright
# Runtime system libraries that Chromium needs. The build stage runs
# `playwright install --with-deps` which installs these into that layer;
# the runner is a fresh FROM so they must be re-added here.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 \
    libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3 \
    libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 \
    libxfixes3 libxkbcommon0 libxrandr2 libxshmfence1 && \
    rm -rf /var/lib/apt/lists/*
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
