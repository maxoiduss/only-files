import * as vscode from "vscode";
import * as sinon from "sinon";
import * as utils from "../classes/utilManager"; // adjust path
import * as manager from "../classes/fileItemManager";
import { expect } from "chai";
import { FileItem, PlaceholderItem } from "../classes/fileItem";
import { ExtensionStaticService } from "../classes/extensionStaticService";
import { OnlyFilesViewProvider } from "../classes/onlyFilesViewProvider";
// import helper if you need to stub load/save

function makeFileItem(path: string, isFile = false): FileItem {
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
  let sandbox: sinon.SinonSandbox;
  let provider: OnlyFilesViewProvider;
  let context: vscode.ExtensionContext;

  before(async () => {
    // Prefer real activation if possible
    const ext = vscode.extensions.getExtension("maxoiduss.only-files");
    if (ext) {
      await ext.activate();
    }
    context = ExtensionStaticService.context;
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Only stub I/O-ish edges so its stay deterministic
    sandbox.stub(utils, "isValidUri").resolves(true);

    // Optional: control children without real FS
    sandbox
      .stub(manager, "getChildrenNames")
      .callsFake(async (itemOr: any) => {
        const path = String(itemOr?.toString?.() ?? itemOr ?? "");
        const known = [
          "/workspace/a/b",
          "/workspace/x/y",
          "/workspace/p/c1",
          "/workspace/p/c2",
          "/workspace/f/v",
          "/workspace/f/h"
        ];
        return known.filter((c) => c.startsWith(path + "/"));
      });

    // Optional: avoid real workspaceState persistence noise
    // sandbox.stub(helper, "loadWorkspaceContexts").callsFake((_, setHeads, setHidden, setMode) => {
    //   setHeads(new Map());
    //   setHidden(new Set());
    //   setMode(false);
    // });

    const reveal = sandbox.stub();
    provider = new OnlyFilesViewProvider(context, reveal as any);
  });

  afterEach(() => {
    provider.dispose();
    sandbox.restore();
  });

  it("add child then parent → no duplicate child", async () => {
    const parentPath = "/workspace/a";
    const childPath = "/workspace/a/b";

    const childItem = makeFileItem(childPath, false);
    await provider.addFileItem(childItem);

    const parentItem = makeFileItem(parentPath, false);
    await provider.addFileItem(parentItem);

    const roots = provider.roots.map((r) => r?.id);
    expect(roots).to.include(parentItem.id);

    const children = await provider.getChildren(parentItem);
    const childIds = children.map((c) => (c as FileItem).id);
    expect(childIds.filter((id) => id === childItem.id)).to.have.lengthOf(1);
  });

  it("add parent then child → child appears under parent", async () => {
    const parentItem = makeFileItem("/workspace/x", false);
    const childItem = makeFileItem("/workspace/x/y", false);

    await provider.addFileItem(parentItem);
    await provider.addFileItem(childItem);

    const children = await provider.getChildren(parentItem);
    expect(children.map((c) => (c as FileItem).id)).to.include(childItem.id);
  });

  it("remove parent → parent not root; children handled via hidden", async () => {
    const parentItem = makeFileItem("/workspace/p", false);
    const c1 = makeFileItem("/workspace/p/c1", false);
    const c2 = makeFileItem("/workspace/p/c2", false);

    await provider.addFileItem(parentItem);
    await provider.addFileItem(c1);
    await provider.addFileItem(c2);

    provider.removeFileItem(parentItem);

    const roots = provider.roots.map((r) => r?.id);
    expect(roots).to.not.include(parentItem.id);

    // Prefer concrete invariants over loose OR conditions
    const hidden = [...provider.hidden];
    expect(
      hidden.includes(parentItem.id) ||
        hidden.includes(c1.id) ||
        hidden.includes(c2.id)
    ).to.equal(true);
  });

  it("refresh fires onDidChangeTreeData", async () => {
    const parentItem = makeFileItem("/workspace/a", false);
    await provider.addFileItem(parentItem);

    const fired: (FileItem | undefined | null)[] = [];
    const sub = provider.onDidChangeTreeData(
      (e: FileItem | PlaceholderItem| undefined) => fired.push(e as any)
    );

    await provider.refreshOn(parentItem);
    sub.dispose();

    expect(fired.length).to.be.greaterThan(0);
  });

  it("getChildren filters hidden children", async () => {
    const parentItem = makeFileItem("/workspace/f", false);
    const visible = makeFileItem("/workspace/f/v", false);
    const hiddenItem = makeFileItem("/workspace/f/h", false);

    await provider.addFileItem(parentItem);
    await provider.addFileItem(visible);
    await provider.addFileItem(hiddenItem);

    provider.removeFileItem(hiddenItem); // moves to hidden setsuite

    const children = await provider.getChildren(parentItem);
    const ids = children.map((c) => (c as FileItem).id);

    expect(ids).to.include(visible.id);
    expect(ids).to.not.include(hiddenItem.id);
  });
});