import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from '@vscode/test-cli';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(
  {
    label: 'integration-desktop',
    files: 'dist/tests/**/*.test.js',
    extensionDevelopmentPath: __dirname,
    mocha: {
      ui: 'bdd',
      timeout: 20000,
      color: true
    },
    launchArgs: [
      '--disable-extensions'
      ]
  },
  {
    label: 'integration-web',
    platform: 'web',
    files: 'dist/tests/**/*.test.js',
    extensionDevelopmentPath: __dirname,
    mocha: {
      ui: 'bdd',
      timeout: 20000,
      color: true
    }
  }
);