import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // contracts/ is a separate Node/Solidity toolchain (its own
    // package.json), not part of the Next.js app — plain CommonJS
    // scripts there are normal, not a lint violation.
    "contracts/**",
  ]),
]);

export default eslintConfig;
