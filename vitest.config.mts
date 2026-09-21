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
});
