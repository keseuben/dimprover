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
    "node_modules/**",

    // DIMPROVER local/generated archives and build candidates:
    "v_260512/**",
    "backups/**",
    "launcher_source/**",
    ".dimprover/backups/**",
    ".dimprover/*.js",
    ".next-*/**",
    ".next-candidate/**",
    ".next-candidate-bak-*/**",
    ".next-bak-*/**",
    ".next-broken-*/**",
    ".work_*/**",
    ".work_*",
    ".build-swap-*",
    "*.bak-*",
    "**/*.bak-*",

    // Vendored/generated browser assets:
    "public/pdf.worker.min.mjs",

    // Intentional CommonJS runtime and one-off smoke scripts:
    "scripts/*.cjs",
  ]),
  {
    rules: {
      // A meglévő DIMPROVER felületeken több kontrollált állapotszinkron useEffect-ben fut.
      // Ezek production build alatt stabilak; a szabályt későbbi refaktor körben érdemes célzottan visszakapcsolni.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
