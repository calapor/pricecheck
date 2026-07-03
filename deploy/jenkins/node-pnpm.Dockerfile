FROM node:22-bookworm
# Pre-install pnpm so CI agents don't need outbound internet access at build time.
# Keep the version in sync with packageManager in package.json and the Jenkinsfile.
RUN npm install -g pnpm@11.1.1
