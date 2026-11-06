import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // A leading underscore names a value taken out on purpose — a field
    // stripped by destructuring, a prop that must not reach the DOM.
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_",
      }],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "data/**",
    ".work/**",
    ".impeccable/**",
    ".superpowers/**",
    ".rea-edge-profile/**",
  ]),
]);
