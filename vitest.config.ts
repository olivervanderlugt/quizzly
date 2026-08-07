import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests: pure functions, no database, no network. `npm test`.
 *
 * The `*.e2e.test.ts` files need a running Postgres and are excluded here —
 * they run via `npm run test:e2e` (vitest.e2e.config.ts), which CI gives a
 * database service. Keeping the split explicit means `npm test` works on a
 * machine with nothing installed but node_modules.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/.next/**", "**/*.e2e.test.ts"],
  },
});
