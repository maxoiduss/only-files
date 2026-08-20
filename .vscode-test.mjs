import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'dist/tests/**/*.test.js',
  extensionDevelopmentPath: import.meta.dirname,
  mocha: {
    ui: 'bdd',
    timeout: 20000
  }
});