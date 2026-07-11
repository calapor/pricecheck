import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["default", "junit"],
    outputFile: { junit: "../../test-results/core-junit.xml" },
    env: { ANTHROPIC_API_KEY: "" },
  },
});
