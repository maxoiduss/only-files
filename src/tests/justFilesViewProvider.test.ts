// tests/justFilesViewProvider.test.ts
import { expect } from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { JustFilesViewProvider } from "../src/justFilesViewProvider";
import { FileItemManager } from "../fileItemManager";
import { FileItem } from "../src/fileItem";

function makeFakeFileItem(path: string, isFile = false): FileItem {
  // Minimal fake that matches the provider expectations
  const uri = vscode.Uri.file(path);
  const item = Object.create(FileItem.prototype) as FileItem;
  item.resourceUri = uri;
  item.relativePath = path.replace(/\\/g, "/");
  item.id = item.relativePath;
  item.isFile = isFile;
  item.collapsibleState = isFile ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed;
  item.label = path.split("/").pop();
  item.command = undefined;
  return item;
}

describe("JustFilesViewProvider unit tests", function () {
  let sandbox: sinon.SinonSandbox;
  let createFileItemStub: sinon.SinonStub;
  let getChildrenNamesStub: sinon.SinonStub;
  let provider: JustFilesViewProvider;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    // stub FileItemManager methods used by the provider
    createFileItemStub = sandbox.stub(FileItemManager.prototype, "createFileItem");
    getChildrenNamesStub = sandbox.stub(FileItemManager.prototype, "getChildrenNames");
    provider = new JustFilesViewProvider();
  });

  afterEach(function () {
    sandbox.restore();
  });

  it("add child then add parent no duplicates", async function () {
    // Arrange: child path and parent path
    const parent = "/workspace/a";
    const child = "/workspace/a/b";

    // createFileItem should return canonical items for both paths
    createFileItemStub.withArgs(vscode.Uri.file(child), sinon.match.any, sinon.match.any)
      .resolves(makeFakeFileItem(child, false));
    createFileItemStub.withArgs(vscode.Uri.file(parent), sinon.match.any, sinon.match.any)
      .resolves(makeFakeFileItem(parent, false));

    // getChildrenNames for parent returns child
    getChildrenNamesStub.withArgs(sinon.match.any).resolves([child]);

    // Act: add child first
    const childItem = await FileItemManager.prototype.createFileItem.call(new FileItemManager(), vscode.Uri.file(child), false, false);
    await provider.addFileItem(childItem);

    // Now add parent
    const parentItem = await FileItemManager.prototype.createFileItem.call(new FileItemManager(), vscode.Uri.file(parent), false, false);
    await provider.addFileItem(parentItem);

    // Assert: parent exists as a root and child is present under parent exactly once
    const roots = provider.roots.map(r => r?.id);
    expect(roots).to.include(parentItem.id);

    // get children of parent
    const children = await provider.getChildren(parentItem);
    const childIds = children.map(c => c.id);
    expect(childIds.filter(id => id === childItem.id)).to.have.lengthOf(1);
  });

  it("add parent then add child", async function () {
    const parent = "/workspace/x";
    const child = "/workspace/x/y";

    createFileItemStub.withArgs(vscode.Uri.file(parent), sinon.match.any, sinon.match.any)
      .resolves(makeFakeFileItem(parent, false));
    createFileItemStub.withArgs(vscode.Uri.file(child), sinon.match.any, sinon.match.any)
      .resolves(makeFakeFileItem(child, false));
    getChildrenNamesStub.withArgs(sinon.match.any).resolves([child]);

    const parentItem = await FileItemManager.prototype.createFileItem.call(new FileItemManager(), vscode.Uri.file(parent), false, false);
    await provider.addFileItem(parentItem);

    const childItem = await FileItemManager.prototype.createFileItem.call(new FileItemManager(), vscode.Uri.file(child), false, false);
    await provider.addFileItem(childItem);

    const children = await provider.getChildren(parentItem);
    expect(children.map(c => c.id)).to.include(childItem.id);
  });

  it("hide parent moves children", async function () {
    const parent = "/workspace/p";
    const child1 = "/workspace/p/c1";
    const child2 = "/workspace/p/c2";

    createFileItemStub.withArgs(vscode.Uri.file(parent), sinon.match.any, sinon.match.any)
      .resolves(makeFakeFileItem(parent, false));
    createFileItemStub.withArgs(vscode.Uri.file(child1), sinon.match.any, sinon.match.any)
      .resolves(makeFakeFileItem(child1, false));
    createFileItemStub.withArgs(vscode.Uri.file(child2), sinon.match.any, sinon.match.any)
      .resolves(makeFakeFileItem(child2, false));
    getChildrenNamesStub.withArgs(sinon.match.any).resolves([child1, child2]);

    const parentItem = await FileItemManager.prototype.createFileItem.call(new FileItemManager(), vscode.Uri.file(parent), false, false);
    await provider.addFileItem(parentItem);

    const childItem1 = await FileItemManager.prototype.createFileItem.call(new FileItemManager(), vscode.Uri.file(child1), false, false);
    const childItem2 = await FileItemManager.prototype.createFileItem.call(new FileItemManager(), vscode.Uri.file(child2), false, false);
    await provider.addFileItem(childItem1);
    await provider.addFileItem(childItem2);

    // Now remove/hide parent
    provider.removeFileItem(parentItem);

    // parent should not be a root
    const roots = provider.roots.map(r => r?.id);
    expect(roots).to.not.include(parentItem.id);

    // children should be either removed from leaves or present in hidden set
    const hidden = Array.from(provider.hidden);
    expect(hidden.some(h => h === child1 || h === child2 || h === parentItem.id)).to.be.true;
  });

  it("getChildren filters hidden", async function () {
    const parent = "/workspace/f";
    const childVisible = "/workspace/f/v";
    const childHidden = "/workspace/f/h";

    createFileItemStub.withArgs(vscode.Uri.file(parent), sinon.match.any, sinon.match.any)
      .resolves(makeFakeFileItem(parent, false));
    createFileItemStub.withArgs(vscode.Uri.file(childVisible), sinon.match.any, sinon.match.any)
      .resolves(makeFakeFileItem(childVisible, false));
    createFileItemStub.withArgs(vscode.Uri.file(childHidden), sinon.match.any, sinon.match.any)
      .resolves(makeFakeFileItem(childHidden, false));
    getChildrenNamesStub.withArgs(sinon.match.any).resolves([childVisible, childHidden]);

    const parentItem = await FileItemManager.prototype.createFileItem.call(new FileItemManager(), vscode.Uri.file(parent), false, false);
    await provider.addFileItem(parentItem);

    const visibleItem = await FileItemManager.prototype.createFileItem.call(new FileItemManager(), vscode.Uri.file(childVisible), false, false);
    const hiddenItem = await FileItemManager.prototype.createFileItem.call(new FileItemManager(), vscode.Uri.file(childHidden), false, false);
    await provider.addFileItem(visibleItem);
    await provider.addFileItem(hiddenItem);

    // hide one child explicitly
    provider.removeFileItem(hiddenItem);

    const children = await provider.getChildren(parentItem);
    const ids = children.map(c => c.id);
    expect(ids).to.include(visibleItem.id);
    expect(ids).to.not.include(hiddenItem.id);
  });
});