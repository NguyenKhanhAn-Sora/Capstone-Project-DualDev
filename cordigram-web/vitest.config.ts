import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    include: ["lib/**/*.test.ts", "__tests__/call-feature.test.tsx"],
    exclude: [
      "node_modules/**",
      "tests/**",
      "**/*.spec.ts",
      "__tests__/safety-tab-map.test.ts",
      "__tests__/use-call-sound.test.ts",
      "__tests__/call-sound-integration.test.tsx",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(dir, "."),
    },
  },
});
