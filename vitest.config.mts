import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      "@": path("./src"),
      // Route handlers are tested directly; outside Next's react-server build this marker would throw.
      "server-only": path("./node_modules/server-only/empty.js"),
    },
  },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 20000 },
});
