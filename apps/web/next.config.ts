import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*"], // allow all origins in dev
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  // Compile the workspace packages from source (no pre-build step needed).
  transpilePackages: [
    "@pricecheck/core",
    "@pricecheck/db",
    "@pricecheck/queue",
    "@pricecheck/observability",
    "@pricecheck/scrapers",
  ],
  // Keep Playwright + the stealth plugin OUT of the webpack bundle so they load via
  // native require at runtime. Bundling puppeteer-extra breaks with
  // "utils.typeOf is not a function"; these are used only in the install smoke-test.
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "playwright-extra",
    "puppeteer-extra-plugin-stealth",
  ],
  // Self-contained server bundle for the container image.
  output: "standalone",
};

export default nextConfig;
