import * as assert from 'assert';

suite('Only Files extension smoke tests', () => {
  test('extension is installed and activates', async () => {
    const extension = vscode.extensions.getExtension('maxoiduss.only-files');
    assert.ok(extension);

    await extension.activate();
    assert.strictEqual(extension.isActive, true);
  });
});
