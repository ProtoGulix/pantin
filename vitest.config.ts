import { defineConfig } from "vitest/config";

// Vitest only discovers its configuration through a default export.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
