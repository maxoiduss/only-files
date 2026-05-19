import fpath from 'path';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from "@typescript-eslint/eslint-plugin";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = fpath.dirname(__filename);

export default [
  {
    ignores: [
      'node_modules',
      "out/",
      "dist/",
      "src/tests/**/*.test.ts"
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
        project: fpath.join(__dirname, 'tsconfig.json'),
        tsconfigRootDir: __dirname,
        ecmaVersion: 2024,
        sourceType: "module"
      }
    },
    // register plugin module; require the plugin package so ESLint can resolve it
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "curly": "warn",
      "eqeqeq": "warn",
      "no-throw-literal": "warn",
      "semi": [
        "warn",
        "always"
      ],
      "no-unused-vars": "off",
      "no-unused-private-class-members": "warn",
      "@typescript-eslint/naming-convention": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn", { 
          "vars": "all",
          "ignoreRestSiblings": false,
          "caughtErrors": "none",
          "varsIgnorePattern": "^_",
          "argsIgnorePattern": "^_"
        }
      ]
    }
  }
];
