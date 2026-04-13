import * as vscode from "vscode";
import { FileItem, PlaceholderItem } from "./fileItem";
import { FileItemManager } from "./fileItemManager";
import { getConfigurationsFor, isValidUri } from "./utilManager";
import { brand } from "./extensionBrandResolver";

const empty = '' as const;
const displayed = "displayed" as const;
const hidden = "hidden" as const;
const subDisplayed = "subDisplayed" as const;
const subHidden = "subHidden" as const;

type JustFilesItemOr = FileItem | PlaceholderItem | undefined;

export class JustFilesViewProvider
  implements vscode.TreeDataProvider<FileItem | PlaceholderItem>,
  vscode.Searchable,
  vscode.Disposable
{
  private _onDidChangeTreeData: vscode.EventEmitter<JustFilesItemOr> =
    new vscode.EventEmitter<FileItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<JustFilesItemOr> =
    this._onDidChangeTreeData.event;

  public onSearch: boolean = false;
  public sortedMode: boolean = false;

  private displayedFileItems: FileItem[] = [];
  private hiddenFileItems: FileItem[] = [];
  private subDisplayedFileItems: FileItem[] = [];
  private subHiddenFileItems: FileItem[] = [];
  private fileItemManager = new FileItemManager();

  constructor(private readonly context: vscode.ExtensionContext) {
    const setItems = async (key: string, setter: (items: FileItem[]) => void) =>
      setter(await this.fileItemManager.createFileItems(
        getConfigurationsFor(this.context, key).map(([path, ]) => path))
      );
    Promise.all([
      setItems(displayed, (value) => this.displayedFileItems = value),
      setItems(hidden, (value) => this.hiddenFileItems = value),
      setItems(subDisplayed, (value) => this.subDisplayedFileItems = value),
      setItems(subHidden, (value) => this.subHiddenFileItems = value)
    ]).finally(() => this.refresh());
  }

  private isFileItemInArray(fileItem: FileItem, array: FileItem[]): boolean {
    return array.some(item => item.like(fileItem));
  }

  private isParentOfArray(
    parentFileItem: FileItem, childrenFileItems: FileItem[]
  ): boolean {
    return childrenFileItems.some((item) =>
      this.fileItemManager.isChildOf(item, parentFileItem)
    );
  }

  private isChildOfArray(
    childFileItem: FileItem,
    parentFileItems: FileItem[]
  ): boolean {
    return parentFileItems.some(
      (item) => this.fileItemManager.isChildOf(childFileItem, item)
    );
  }
  
  private addDisplayFileItem(item: FileItem) {
    if (!this.isFileItemInArray(item, this.displayedFileItems)) {
      this.displayedFileItems.push(item);
    }
  }

  private async addSubNode(fileItem: FileItem): Promise<void> {
    if (this.isSubItemAlreadyDisplayed(fileItem)) {
      this.cleanFileItemChildren(fileItem);

      return;
    }
    this.addSubDisplayedItem(fileItem);
    this.removeHideFileItem(fileItem);
    this.removeSubHiddenFileItem(fileItem);
    this.cleanFileItemChildren(fileItem);

    const parent = this.fileItemManager.getParentInArray(
      fileItem, this.displayedFileItems
    );
    if (parent) {
      const routes = this.fileItemManager.getDirectoriesUntilParent(
        fileItem.resourceUri?.fsPath || empty,
        parent.resourceUri?.fsPath || empty
      );
      for (const path of routes) {
        const parentItem = await this.fileItemManager.createFileItem(path);
        const siblingsAll = await this.fileItemManager.getSiblings(parentItem);
        const siblings = siblingsAll.filter((item) => 
             !this.isFileItemInArray(item, this.subDisplayedFileItems)
          && !this.isParentOfArray(item, this.subDisplayedFileItems)
        );
        siblings.forEach((item) => {
          if (!this.isSubItemAlreadyDisplayed(item)) {
            this.addSubHiddenFileItem(item);
          }
        });

        if (this.isFileItemInArray(parentItem, this.hiddenFileItems)) {
          this.removeHideFileItem(parentItem);
        }
        this.addSubDisplayedItem(parentItem);
      }
    }
  }

  private addSubDisplayedItem(item: FileItem) {
    this.removeSubHiddenFileItem(item);
    if (!this.isFileItemInArray(item, this.subDisplayedFileItems)) {
      this.subDisplayedFileItems.push(item);
    }
  }

  private addSubHiddenFileItem(item: FileItem) {
    if (this.isFileItemInArray(item, this.subDisplayedFileItems)) {
      this.removeSubFileItem(item);
      this.cleanFileItemChildren(item);

      return;
    }

    if  (!this.isFileItemInArray(item, this.subHiddenFileItems) 
      && !this.isFileItemInArray(item, this.hiddenFileItems)) {
      this.subHiddenFileItems.push(item);
    }
  }
  
  private addMainNode(item: FileItem) {
    if (this.isParentOfArray(item, this.displayedFileItems))
    {
      const childrenItems = this.displayedFileItems.filter((it) =>
        this.fileItemManager.isChildOf(it, item)
      );
      childrenItems.forEach((it) => {
        this.removeFileItem(it);
        this.addSubDisplayedItem(it);
      });
    }
    this.removeHideFileItem(item);
    this.removeSubFileItem(item);
    this.cleanFileItemChildren(item);
    this.addDisplayFileItem(item);
  }

  private async removeNotFiles() : Promise<void> {
    await Promise.all([...this.hiddenFileItems].map(async (item) => {
      if (! await isValidUri(item.resourceUri?.fsPath)) {
        this.removeHideFileItem(item);
      }
    }));
    await Promise.all([...this.displayedFileItems].map(async (item) => {
      if (! await isValidUri(item.resourceUri?.fsPath)) {
        this.removeFileItem(item);
      }
    }));
    await Promise.all([...this.subHiddenFileItems].map(async (item) => {
      if (! await isValidUri(item.resourceUri?.fsPath)) {
        this.removeSubHiddenFileItem(item);
      }
    }));
    await Promise.all([...this.subDisplayedFileItems].map(async (item) => {
      if (! await isValidUri(item.resourceUri?.fsPath)) {
        this.removeSubFileItem(item);
      }
    }));
  }

  private cleanFileItemChildren(item: FileItem) {
    const hiddenFileItems = [...this.hiddenFileItems];
    hiddenFileItems.map((hiddenItem) => {
      if (this.fileItemManager.isChildOf(hiddenItem, item)) {
        this.removeHideFileItem(hiddenItem);
      }
    });
    const subHiddenFileItems = [...this.subHiddenFileItems];
    subHiddenFileItems.map((subHiddenItem) => {
      if (this.fileItemManager.isChildOf(subHiddenItem, item)) {
        this.removeSubHiddenFileItem(subHiddenItem);
      }
    });
    const subDisplayedFileItems = [...this.subDisplayedFileItems];
    subDisplayedFileItems.map((subItem) => {
      if (this.fileItemManager.isChildOf(subItem, item)) {
        this.removeSubFileItem(subItem);
      }
    });
  }

  private isSubItemAlreadyDisplayed(item: FileItem): boolean {
    const isInHiddenItems = this.isFileItemInArray(item, 
      this.hiddenFileItems
    );
    const isInSubHiddenItems = this.isFileItemInArray(item, 
      this.subHiddenFileItems
    );
    const isChildOfHiddenItems = this.isChildOfArray(item,
      this.hiddenFileItems
    );
    const isChildOfSubHiddenItems = this.isChildOfArray(item,
      this.subHiddenFileItems
    );

    return !(
      isInHiddenItems ||
      isInSubHiddenItems ||
      isChildOfHiddenItems ||
      isChildOfSubHiddenItems
    );
  }

  private removeHideFileItem(item: FileItem | vscode.Uri) {
    const uri = item instanceof FileItem ? item.resourceUri : item;
    const index = this.hiddenFileItems.findIndex(
      (it) => uri && it.like(uri.fsPath)
    );
    if (index > -1) {
      this.hiddenFileItems.splice(index, 1);
    }
  }

  private removeSubHiddenFileItem(item: FileItem | vscode.Uri) {
    const uri = item instanceof FileItem ? item.resourceUri : item;
    const index = this.subHiddenFileItems.findIndex(
      (it) => uri && it.like(uri.fsPath)
    );
    if (index > -1) {
      this.subHiddenFileItems.splice(index, 1);
    }
  }

  private removeSubFileItem(item: FileItem | vscode.Uri) {
    const uri = item instanceof FileItem ? item.resourceUri : item;
    const index = this.subDisplayedFileItems.findIndex(
      (it) => uri && it.like(uri.fsPath)
    );
    if (index > -1) {
      this.subDisplayedFileItems.splice(index, 1);
    }
  }

  private removeFileItem(item: FileItem | vscode.Uri) {
    const uri = item instanceof FileItem ? item.resourceUri : item;
    const index = this.displayedFileItems.findIndex(
      (it) => uri && it.like(uri.fsPath)
    );
    if (index > -1) {
      this.displayedFileItems.splice(index, 1);
    }
  }

  dispose() { this._onDidChangeTreeData.dispose(); }

  switchSortedModeTag() {
    vscode.commands.executeCommand(
      brand.setContext, brand.isSorted, this.sortedMode
    );
  }

  clean() {
    this.displayedFileItems = [];
    this.hiddenFileItems = [];
    this.subDisplayedFileItems = [];
    this.subHiddenFileItems = [];
  }
  
  refresh(element?: FileItem) {
    const asPaths = (items: FileItem[]) => items.map(i => i.resourceUri?.fsPath);
    this.removeNotFiles().then(() =>

      this._onDidChangeTreeData.fire(element)

    ).finally(() => {
      this.context.workspaceState.update(displayed, 
        asPaths(this.displayedFileItems));
      this.context.workspaceState.update(hidden,
        asPaths(this.hiddenFileItems));
      this.context.workspaceState.update(subDisplayed,
        asPaths(this.subDisplayedFileItems));
      this.context.workspaceState.update(subHidden, 
        asPaths(this.subHiddenFileItems));
    });
  }

  async refreshIfExistsFileItemByUri(uri: vscode.Uri): Promise<void> {
    const found = this.displayedFileItems.find((it) => it.like(uri.fsPath));
    if (await isValidUri(uri) || !found) {
      this.refresh(found);
    }
  }
  
  async addFileItem(fileItem: FileItem): Promise<void> {
    const isChildFile = this.isChildOfArray(fileItem, this.displayedFileItems);
    if (!isChildFile) {
      this.addMainNode(fileItem);
      return;
    }
    await this.addSubNode(fileItem);
  }

  addHideFileItem(item: FileItem) {
    if (this.isFileItemInArray(item, this.displayedFileItems)) {
      this.removeFileItem(item);
      this.cleanFileItemChildren(item);

      return;
    }

    if  (!this.isFileItemInArray(item, this.hiddenFileItems)
      && !this.isFileItemInArray(item, this.subHiddenFileItems)) {
      this.hiddenFileItems.push(item);
      this.cleanFileItemChildren(item);
    }
  }
  
  changeFileItem(item: FileItem, oldUri: vscode.Uri) {
    const toRefresh: FileItem[] = [];
    const allItems = [
      ...this.displayedFileItems,
      ...this.subDisplayedFileItems,
      ...this.hiddenFileItems,
      ...this.subHiddenFileItems
    ];
    allItems.forEach((it) => {
      if (this.fileItemManager.isChildOf(it, oldUri)) {
        this.fileItemManager.changeUri(it, item, oldUri);
        toRefresh.push(it);
      }
    });
    const found = allItems.find((it) => it.like(oldUri.fsPath));
    if (found) {
      this.fileItemManager.changeUri(found, item, oldUri);
      toRefresh.push(found);
    } else if (allItems.find((it) => it.like(item))) {
      toRefresh.push(item);
    } else {
      this.displayedFileItems.forEach((it) => {
        if (this.fileItemManager.isChildOf(oldUri, it)) {
          toRefresh.push(it);
        }
      });
    }
    if (toRefresh.length > 1) { this.refresh(); }
    else if (toRefresh.length === 1) { this.refresh(toRefresh[0]); }
  }

  removeItemFromJustFiles(item: FileItem) {
    this.removeFileItem(item);
    this.removeHideFileItem(item);
    this.removeSubFileItem(item);
    this.removeSubHiddenFileItem(item);
  }

  getTreeItem(element: FileItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
    if (element instanceof PlaceholderItem) {
      element.label = undefined; 
      element.command = undefined;
    }
    
    return element;
  }

  async getChildren(element?: FileItem): Promise<(FileItem | PlaceholderItem)[]> {
    if (!element) {
      if (this.displayedFileItems.length === 0) {
          return Promise.resolve([new PlaceholderItem()]);
      }
      
      return Promise.resolve(
        this.fileItemManager.sortItems(this.displayedFileItems, this.sortedMode)
      );
    }

    const files = await vscode.workspace.fs.readDirectory(element.resourceUri!);
    let items: FileItem[] = [];

    for (const [name] of files) {
      const itemPath = vscode.Uri.joinPath(element.resourceUri!, name);
      const item = await this.fileItemManager.createFileItem(itemPath);

      if  (!this.isFileItemInArray(item, this.hiddenFileItems)
        && !this.isFileItemInArray(item, this.subHiddenFileItems)) {
        items.push(item);
      }
    }

    return Promise.resolve(this.fileItemManager.sortItems(items, this.sortedMode));
  }
}
