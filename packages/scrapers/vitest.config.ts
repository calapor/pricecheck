import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    deps: {
      // Playwright, stealth plugin, and Anthropic SDK are native/binary-heavy
      // packages that Vite's esbuild optimizer cannot bundle without OOMing.
      // Keep them external so Vite loads them directly from node_modules.
      external: [/playwright/, /puppeteer/, /@anthropic-ai/],
    },
  },
  test: {
    reporters: ["default", "junit"],
    outputFile: { junit: "../../test-results/scrapers-junit.xml" },
    env: { ANTHROPIC_API_KEY: "" },
  },
});
