import { defineConfig } from "vitest/config";

/**
 * The only thing this file exists for: `tsconfig.json` sets `jsx: "preserve"`
 * because Next.js does the JSX transform itself, which leaves vitest compiling
 * components against the classic runtime and failing on a missing `React`
 * binding. Pointing esbuild at the automatic runtime lets a component be
 * rendered in a test without every file importing React for the compiler's
 * benefit.
 *
 * Path aliases are declared here too, so a test can import `@/...` the way the
 * app does.
 */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": new URL("./src/", import.meta.url).pathname,
      "@server": new URL("./server/", import.meta.url).pathname,
    },
  },
});
