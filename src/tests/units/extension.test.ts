import { assert } from 'chai';
import { suite, test } from 'mocha';
import { extension } from "../helpers/name";

suite('Only Files extension smoke tests', () => {
  test('extension is installed and activates', async () => {
    const ext = vscode.extensions.getExtension(extension);
    assert.isDefined(ext, "extension not exists");

    await ext.activate();
    assert.strictEqual(ext.isActive, true, "extension.isActive is false");
  });
});
