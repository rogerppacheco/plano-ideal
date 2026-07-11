import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/*.test.{js,jsx,ts,tsx}",
      "src/test/**",
      "**/uploads/**",
      "pap-worker/**",
      "backend/scripts/compare-user-tables.mjs",
      "backend/scripts/diagnose-delete-user.mjs",
      "backend/scripts/diagnose-prod-login.mjs",
      "backend/scripts/inspect-db-schemas.mjs",
      "backend/scripts/set-admin-password.mjs",
      "backend/scripts/simulate-login.mjs",
      "backend/scripts/test-prod-login-steps.mjs",
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  {
    files: [
      "src/**/*.{js,jsx}",
      "backend/{src,scripts}/**/*.{js,mjs}",
      "scripts/**/*.{js,mjs}",
      "*.{js,mjs}",
    ],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  prettier,
];
