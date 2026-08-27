import * as vscode from "vscode";
import * as sinon from "sinon";
import { expect } from "chai";
import { extension } from "./helpers/name";
import { FileItem } from "../classes/fileItem";
import { FoldersViewProvider } from "../classes/foldersViewProvider";
import { ExtensionStaticService } from "../classes/extensionStaticService";

import * as utils from "./helpers/utils";

function initFileItem(path: string, isFile = false): FileItem {
  return new FileItem(
    path.split(/[/\\]/).pop() ?? path,
    isFile
      ? vscode.TreeItemCollapsibleState.None
      : vscode.TreeItemCollapsibleState.Collapsed,
    isFile,
    vscode.Uri.file(path)
  );
}

describe("FoldersViewProvider (integration)", function () {
  this.timeout(20000);

  let api;
  let sandbox: sinon.SinonSandbox;
  let revealStub: sinon.SinonStub;
  let provider: FoldersViewProvider;
  let context: vscode.ExtensionContext;

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
    revealStub = sinon.stub();
    sandbox = sinon.createSandbox();
    (utils.isValidUri as sinon.SinonStub).resolves(true);
    provider = new FoldersViewProvider(context, revealStub);
    ExtensionStaticService.plainMode = false;
  });

  afterEach(() => {
    ExtensionStaticService.plainMode = false;
    provider.dispose();
    (utils.isValidUri as sinon.SinonStub).reset();
    sandbox.restore();
  });

  it("returns the same tree item supplied to getTreeItem", () => {
    const folder = initFileItem("/workspace/folder");

    expect(provider.getTreeItem(folder)).to.equal(folder);
  });

  it("starts with the root visible and can toggle root visibility", () => {
    expect(provider.rootIsShown()).to.equal(true);
    expect(provider.rootIsShown(false)).to.equal(false);
    expect(provider.rootIsShown()).to.equal(false);
    expect(provider.rootIsShown(true)).to.equal(true);
  });

  it("sets and clears ignored item rules", () => {
    expect(provider.resettedIgnoredItems()).to.equal(false);

    provider.setIgnoredItems([
      [true, /\.map$/],
      [false, /node_modules/]
    ]);

    expect(provider.resettedIgnoredItems()).to.equal(true);
    expect(provider.resettedIgnoredItems()).to.equal(false);
  });

  it("allows item creation outside plain-mode collapsing entries", () => {
    const folderUri = vscode.Uri.file("/workspace/folder");

    expect(provider.canBeCreated(folderUri)).to.equal(true);
  });

  it("blocks creation for a folder uncollapsed in plain mode", () => {
    const folder = initFileItem("/workspace/folder") as {
      resourceUri: vscode.Uri
    };
    provider.plainMode = true;
    const folders = provider as unknown as {
      collapsingItems: Map<string, { isPlain: boolean }>;
    };
    folders.collapsingItems.set(folder.resourceUri.toString(), {
      isPlain: true }
    );
    expect(provider.canBeCreated(folder.resourceUri)).to.equal(false);
  });

  it("removes a classic collapsing entry when the item is collapsed", () => {
    const folder = initFileItem("/workspace/folder");
    provider.addCollapsingElement(folder);
    expect(folder.hasExpandedState()).to.equal(true);

    provider.removeCollapsingElement(folder);
  
    expect(folder.hasExpandedState()).to.equal(false);
    provider.plainMode = true;
    expect(provider.canBeCreated(folder.resourceUri)).to.equal(true);
  });

  it("reveals collapsed item when un- or collapsing in classic mode", async () =>
  {
    const folder = initFileItem("/workspace/folder");

    await provider.collapseOrUncollapseItem(folder);

    expect(revealStub.calledOnceWithExactly(folder, true)).to.equal(true);
  });

  it("fires a tree change event when refreshed", async () => {
    const events: (FileItem | undefined)[] = [];
    const subscription = provider.onDidChangeTreeData((e) => events.push(e));

    provider.refresh();
    subscription.dispose();

    expect(events).to.deep.equal([undefined]);
  });

  it("persists plain-mode state when refreshed", async () => {
    const update = sinon.stub(context.workspaceState, "update").resolves();
    provider.plainMode = true;
    provider.refresh();
    await utils.sleep(200);

    expect(update.calledWith("plainModeOn", true)).to.equal(true);
    update.restore();
  });

  it("marks the provider is disposed", () => {
    provider.dispose();

    expect(provider.isDisposed).to.equal(true);
  });
});
