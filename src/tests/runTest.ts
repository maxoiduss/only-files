import * as path from 'path';
import { fileURLToPath } from 'url';
import { runTests } from '@vscode/test-electron';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(dirname, '..', '..');
    const extensionTestsPath = path.resolve(dirname, 'units', 'index.ts');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [path.resolve(dirname, '..', '..')]
    });
  } catch (error) {
    console.error('Failed to run extension tests.');
    console.error(error);
    process.exit(1);
  }
}

void main();
