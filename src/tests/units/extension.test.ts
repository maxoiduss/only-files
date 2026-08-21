import { assert } from 'chai';
import { suite, test } from 'mocha';

suite('Only Files extension smoke tests', () => {
  test('extension is installed and activates', async () => {
    const extension = vscode.extensions.getExtension('maxoiduss.only-files');
    assert.isDefined(extension, "extension not exists");

    await extension.activate();
    assert.strictEqual(extension.isActive, true, "extension.isActive is false");
  });
});
