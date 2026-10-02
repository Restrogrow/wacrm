import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next 16.3.8 promoted these React Compiler
    // readiness checks to errors. They flag the "fetch on mount,
    // setLoading synchronously" idiom used throughout this app's
    // effects (inbox, broadcasts, automations, flows, settings) —
    // a performance advisory for future React Compiler adoption,
    // not a correctness bug. Downgraded to warnings so the bump
    // to next@16.3.8 (security fix) doesn't block CI on a 20-file
    // rewrite that's out of scope here.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      // Respect the existing underscore-prefix convention for
      // intentionally-unused params (e.g. test stubs matching an
      // interface signature) instead of flagging every one of them.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored minified opus-recorder encoder worker (served statically).
    "public/opus/**",
  ]),
]);

export default eslintConfig;
