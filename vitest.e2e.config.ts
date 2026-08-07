import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Integration tests — the ones that need a real Postgres.
 *
 * Local: `docker run -d --name quizzly-dev-pg -e POSTGRES_USER=quizzly \
 *   -e POSTGRES_PASSWORD=quizzly -e POSTGRES_DB=quizzly -p 5433:5432 \
 *   postgres:17-alpine`, apply migrations, then `npm run test:e2e`.
 * CI provides the database as a service container and overrides DATABASE_URL.
 *
 * Files run one at a time (`fileParallelism: false`) because they share one
 * database and the realtime test binds a port.
 */

process.env.DATABASE_URL ??=
  "postgresql://quizzly:quizzly@localhost:5433/quizzly?schema=public";
process.env.APP_ORIGIN ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "e2e-test-session-secret-not-for-production-use";
process.env.ENCRYPTION_KEY ??= "e2e-test-encryption-key-not-for-production-use";
// `process.env.NODE_ENV ??=` upsets TS (Next types it read-only); vitest sets
// it to "test" on its own, so nothing is lost by leaving it alone.

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["**/*.e2e.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
