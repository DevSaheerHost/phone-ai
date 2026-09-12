// Shared flat ESLint config for the plain-TS workspaces (packages/*, apps/voice-service).
// apps/web has its own eslint.config.mjs bridging Next's rules via FlatCompat.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.next/**", "**/coverage/**", "apps/web/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  eslintConfigPrettier,
);
