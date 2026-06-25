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
  ],
  // Self-contained server bundle for the container image.
  output: "standalone",
};

export default nextConfig;
