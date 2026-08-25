import * as vscode from "vscode";
import * as sinon from "sinon";
import { expect } from "chai";
import { extension } from "./helpers/name";
import { FileItem, PlaceholderItem } from "../classes/fileItem";
import { OnlyFilesViewProvider } from "../classes/onlyFilesViewProvider";

import * as utils from "./helpers/utils";
import * as manager from "./helpers/manager";

function initFileItem(path: string, isFile = false): FileItem {
  const uri = vscode.Uri.file(path);
  const label = path.split(/[/\\]/).pop() ?? path;
  const state = isFile
    ? vscode.TreeItemCollapsibleState.None
    : vscode.TreeItemCollapsibleState.Collapsed;
  const item = new FileItem(label, state, isFile, uri);
  item.relativePath = path.replace(/\\/g, "/");
  item.id = item.relativePath;
  return item;
}

describe("OnlyFilesViewProvider (integration)", function () {
  this.timeout(20000);

  let api;
  let sandbox: sinon.SinonSandbox;
  let provider: OnlyFilesViewProvider;
  let context: vscode.ExtensionContext;
  let revealStub: sinon.SinonStub;

  before(async () => {
    const ext = vscode.extensions.getExtension(extension);
    if (ext) {
      api = await ext.activate();
      context = api?.ExtensionStaticService.context;
    }
    if (!context) {
      console.warn("context is still undefined");
    }
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    revealStub = sandbox.stub();
    try {
      const isValidUri = utils.isValidUri as sinon.SinonStub;
      isValidUri.resolves(true);
    } catch (error) {
      console.warn("Could not stub isValidUri - continuing without stub");
    }

    try {
      manager.getChildrenNames.callsFake(
        async (itemOr: any) => {
          const path = String(itemOr?.toString?.() ?? itemOr ?? "");
          const known = [
            "/workspace/a/b",
            "/workspace/x/y",
            "/workspace/p/c1",
            "/workspace/p/c2",
            "/workspace/f/v",
            "/workspace/f/h",
          ];
          return known.filter((c) => c.startsWith(path + "/"));
        });
    } catch (e) {
      console.warn("Could not stub getChildrenNames - continuing without stub");
    }

    provider = new OnlyFilesViewProvider(context, revealStub as any);
    provider.clean();
  });

  afterEach(() => {
    if (provider) {
      provider.clean();
      provider.dispose();
    }
    sandbox.restore();
  });

  it("add child then parent → no duplicate child", async () => {
    const parentPath = "/workspace/a";
    const childPath = "/workspace/a/b";

    const childItem = initFileItem(childPath, false);
    await provider.addFileItem(childItem);

    const parentItem = initFileItem(parentPath, false);
    await provider.addFileItem(parentItem);

    const roots = provider.roots.map((r) => r?.id);
    expect(roots).to.include(parentItem.id);

    const children = await provider.getChildren(parentItem);
    const childIds = children.map((c) => (c as FileItem).id);
    expect(childIds.filter((id) => id === childItem.id)).to.have.lengthOf(1);
  });

  it("add parent then child → child appears under parent", async () => {
    const parentItem = initFileItem("/workspace/x", false);
    const childItem = initFileItem("/workspace/x/y", false);

    await provider.addFileItem(parentItem);
    await provider.addFileItem(childItem);

    const children = await provider.getChildren(parentItem);
    expect(children.map((c) => (c as FileItem).id)).to.include(childItem.id);
  });

  it("remove parent → parent not root; children removed also", async () => {
    const parentItem = initFileItem("/workspace/p", false);
    const c1 = initFileItem("/workspace/p/c1", false);
    const c2 = initFileItem("/workspace/p/c2", false);
    await provider.addFileItem(parentItem);
    await provider.addFileItem(c1);
    await provider.addFileItem(c2);

    let children = await provider.getChildren();
    expect(children.length).to.be.greaterThan(0, "No children shown.");

    children = await provider.getChildren(parentItem);
    expect(children.length).to.be.equal(2, "Parent doesn't have both children");
    
    provider.removeFileItem(parentItem, false);

    const roots = provider.roots.map((r) => r?.id);
    expect(roots).to.not.include(parentItem.id, "Parent hasn't been removed.");

    const inRoots = roots.includes(c1.id) || roots.includes(c2.id);
    expect(inRoots).to.equal(false);
  });

  it("remove child → appears in hidden; remove parent", async () => {
    const parentItem = initFileItem("/workspace/p", false);
    const c1 = initFileItem("/workspace/p/c1", false);
    await provider.addFileItem(parentItem);
    await provider.addFileItem(c1);

    let children = await provider.getChildren();
    expect(children.length).to.be.greaterThan(0, "No children shown.");

    children = await provider.getChildren(parentItem);
    expect(children.length).to.be.equal(1, "Child hasn't been added.");

    provider.removeFileItem(c1);

    children = await provider.getChildren(parentItem);
    expect(children.length).to.be.equal(0, "Child hasn't been removed.");

    const hidden = provider.hidden;
    expect(hidden.size).to.be.equal(1, "Child isn't hidden");
    expect(hidden.has(c1.id)).to.be.equal(true);

    provider.removeFileItem(parentItem, false);

    children = await provider.getChildren();
    children = children.filter((child) => !(child instanceof PlaceholderItem));
    expect(children.length).to.be.equal(0, "Child hasn't been removed.");

    const roots = provider.roots.map((r) => r?.id);
    expect(roots.length).to.be.equal(0, "Elements haven't been removed.");
    expect(hidden.size).to.be.equal(0, "Hidden is not empty after removal.");
  });

  it("refresh fires onDidChangeTreeData", async () => {
    const parentItem = initFileItem("/workspace/a", false);
    await provider.addFileItem(parentItem);

    const fired: (FileItem | PlaceholderItem | undefined | null)[] = [];
    const sub = provider.onDidChangeTreeData((e) => fired.push(e as any));

    await provider.refreshOn(parentItem);
    await utils.sleep(250);
    sub.dispose();

    expect(fired.length).to.be.greaterThan(0);
  });

  it("getChildren filters hidden children", async () => {
    const parentItem = initFileItem("/workspace/f", false);
    const visible = initFileItem("/workspace/f/v", false);
    const hiddenItem = initFileItem("/workspace/f/h", false);

    await provider.addFileItem(parentItem);
    await provider.addFileItem(visible);
    await provider.addFileItem(hiddenItem);

    provider.removeFileItem(hiddenItem);

    const children = await provider.getChildren(parentItem);
    const ids = children.map((c) => (c as FileItem).id);

    expect(ids).to.include(visible.id);
    expect(ids).to.not.include(hiddenItem.id);
  });
});