import tsParser from '@typescript-eslint/parser';
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      'node_modules',
      "out/",
      "dist/",
      "**/*.d.ts"
    ],
  },
  {
    files: [
      "**/*.ts",
      "**/*.tsx"
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 6,
        sourceType: "module"
      }
    },
    // register plugin module; require the plugin package so ESLint can resolve it
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "@typescript-eslint/naming-convention": "warn",
      "@typescript-eslint/semi": "warn",
      "curly": "warn",
      "eqeqeq": "warn",
      "no-throw-literal": "warn",
      "semi": "warn",
      "no-unused-vars": "warn"
    }
  }
];
