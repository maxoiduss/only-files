import { assert } from 'chai';
import { suite, test } from 'mocha';

const name = "maxoiduss.only-files";

const outputObject = (obj: {}) => {
  for (const [key, value] of Object.entries(obj)) {
    const show = typeof value === 'object' ?
      JSON.stringify(value, null, 2)
    : value;
    if (Array.isArray(obj)) {
      obj.forEach((item) => outputObject(item)); }
    else {
      console.log(`Field: ${key}: ${show}`); }
  }
}

const getExtension = async (): Promise<vscode.Extension<any>> => {
  const ext = vscode?.extensions?.getExtension(name);
  assert.isDefined(ext, "extension not exists");

  return ext;
}

suite('Only Files extension smoke tests', () => {
  test('extension is installed and activates', async () => {
    const ext = await getExtension();
    await ext.activate();
    assert.strictEqual(ext.isActive, true, "extension.isActive is false");
  });
  test('extension is resolved by ExtensionBrandResolver', async () => {
    const ext = await getExtension();
    const api = await ext.activate();
    const resolver = api?.ExtensionBrandResolver;
    assert.isDefined(resolver, "resolver is not defined");
    assert.isString( resolver.command         ,"command          isn't string");
    assert.isString( resolver.webview         ,"webview          isn't string");
    assert.isString( resolver.treeview1       ,"treeview1        isn't string");
    assert.isString( resolver.treeview2       ,"treeview2        isn't string");
    assert.isString( resolver.configuration   ,"configuration    isn't string");
    assert.isString( resolver.stringProperty  ,"stringProperty   isn't string");
    assert.isString( resolver.number1Property ,"number1Property  isn't string");
    assert.isString( resolver.number2Property ,"number2Property  isn't string");
    assert.isString( resolver.number3Property ,"number3Property  isn't string");
    assert.isString( resolver.number4Property ,"number4Property  isn't string");
    assert.isString( resolver.boolean1Property,"boolean1Property isn't string");
    assert.isString( resolver.boolean2Property,"boolean2Property isn't string");
    assert.isString( resolver.boolean3Property,"boolean3Property isn't string");
    assert.isString( resolver.boolean4Property,"boolean4Property isn't string");
    assert.isString( resolver.boolean5Property,"boolean5Property isn't string");
    assert.isBoolean(resolver.boolean3DefaultValue,
      "boolean3DefaultValue isn't boolean");

    const instance = new resolver as { resolve: () => void, tag: string };
    assert.isDefined(instance, "resolver instance is not defined");
    
    instance.resolve();
    assert.isDefined(instance, "resolver is not defined after 2nd resolve");

    const resolvedTag = "already resolved";
    assert.strictEqual(instance.tag?.toLowerCase(), resolvedTag);
    assert.isDefined(resolver.dispose, "resolver doesn't have dispose()");

    resolver.dispose();
  })
});
