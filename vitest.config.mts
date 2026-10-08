import { defineConfig } from "vitest/config";
import path from "node:path";

// Mirrors tsconfig.json's "@/*" -> "./src/*" path alias. Needed the
// moment a test imports a file that itself imports via "@/" (like an
// API route) — nothing before this test suite did, so this gap was
// latent rather than fixed.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    // sdk/ is its own standalone package (see sdk/package.json) with its
    // own plain-node test runner (`npm test` inside sdk/) — it is not a
    // vitest suite and would otherwise show up here as a false failure
    // ("No test suite found").
    exclude: ["**/node_modules/**", "sdk/**"],
  },
});
