import * as vscode from "vscode";
import { FileItem, PlaceholderItem } from "./fileItem";
import { FileItemManager } from "./fileItemManager";
import { brand } from "./commandRegistrator";

const displayed: string = "displayed";
const hidden: string = "hidden";
const subDisplayed: string = "subDisplayed";
const subHidden: string = "subHidden";

export class JustFilesViewProvider
  implements vscode.TreeDataProvider<FileItem | PlaceholderItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<FileItem | PlaceholderItem | undefined> =
    new vscode.EventEmitter<FileItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<FileItem | PlaceholderItem | undefined> =
    this._onDidChangeTreeData.event;

  public onSearch: boolean = true;
  public sortedMode: boolean = false;

  private displayedFileItems: FileItem[] = [];
  private hiddenFileItems: FileItem[] = [];
  private subDisplayedFileItems: FileItem[] = [];
  private subHiddenFileItems: FileItem[] = [];
  private fileItemManager = new FileItemManager();
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    const asFileItems = (record: [string, unknown][]) =>
      record.map(([path, _]) => this.fileItemManager.createFileItem(path));

    this.context = context;
    
    this.displayedFileItems = asFileItems(
      this.fileItemManager.getConfigurationFor(this.context, displayed));
    this.hiddenFileItems = asFileItems(
      this.fileItemManager.getConfigurationFor(this.context, hidden));
    this.subDisplayedFileItems = asFileItems(
      this.fileItemManager.getConfigurationFor(this.context, subDisplayed));
    this.subHiddenFileItems = asFileItems(
      this.fileItemManager.getConfigurationFor(this.context, subHidden));
  }

  private addDisplayFileItem(fileItem: FileItem): void {
    if (
      !this.fileItemManager.isFileItemInArray(fileItem, this.displayedFileItems)
    ) {
      this.displayedFileItems.push(fileItem);
    }
  }

  private addMainNode(fileItem: FileItem): void {
    if (
      this.fileItemManager.isParentOfArray(fileItem, this.displayedFileItems)
    ) {
      const childreItems = this.displayedFileItems.filter((item) =>
        this.fileItemManager.isChildOf(item, fileItem)
      );

      childreItems.map((item) => {
        this.removeFileItem(item);
        this.addSubDisplayedItem(item);
      });
    }

    this.removeHideFileItem(fileItem);
    this.removeSubFileItem(fileItem);
    this.cleanFileItemChildren(fileItem);
    this.addDisplayFileItem(fileItem);
  }

  private removeNotFiles() {
    const hiddenFileItems = [...this.hiddenFileItems];
    hiddenFileItems.map((item) => {
      if (!this.fileItemManager.isValidUri(item.resourceUri?.fsPath)) {
        this.removeHideFileItem(item);
      }
    });

    const displayedFileItems = [...this.displayedFileItems];
    displayedFileItems.map((item) => {
      if (!this.fileItemManager.isValidUri(item.resourceUri?.fsPath)) {
        this.removeFileItem(item);
      }
    });

    const subHiddenFileItems = [...this.subHiddenFileItems];
    subHiddenFileItems.map((item) => {
      if (!this.fileItemManager.isValidUri(item.resourceUri?.fsPath)) {
        this.removeSubHiddenFileItem(item);
      }
    });

    const subDisplayedFileItems = [...this.subDisplayedFileItems];
    subDisplayedFileItems.map((item) => {
      if (!this.fileItemManager.isValidUri(item.resourceUri?.fsPath)) {
        this.removeSubFileItem(item);
      }
    });
  }

  switchSortedModeTag() {
    vscode.commands.executeCommand(
      'setContext', 
      `${brand}:isSorted`,
      this.sortedMode
    );
  }

  addFileItem(fileItem: FileItem): void {
    const isChildFile = this.fileItemManager.isChildOfArray(
      fileItem,
      this.displayedFileItems
    );
    if (!isChildFile) {
      this.addMainNode(fileItem);
      return;
    }

    this.addSubNode(fileItem);
  }

  private addSubNode(fileItem: FileItem): void {
    if (this.isSubItemAlreadyDisplayed(fileItem)) {
      this.cleanFileItemChildren(fileItem);

      return;
    }

    this.addSubDisplayedItem(fileItem);
    this.removeHideFileItem(fileItem);
    this.removeSubHiddenFileItem(fileItem);
    this.cleanFileItemChildren(fileItem);

    const parent = this.fileItemManager.getParentInArray(
      fileItem,
      this.displayedFileItems
    );
    if (parent) {
      const route = this.fileItemManager.getDirectoriesUntilParent(
        fileItem.resourceUri?.fsPath || "",
        parent.resourceUri?.fsPath || ""
      );
      route.map((path) => {
        const parentItem = this.fileItemManager.createFileItem(path);
        let siblings: FileItem[] = this.fileItemManager.getSiblings(parentItem);

        siblings = siblings.filter(
          (item) =>
            !this.fileItemManager.isFileItemInArray(
              item,
              this.subDisplayedFileItems
            ) &&
            !this.fileItemManager.isParentOfArray(
              item,
              this.subDisplayedFileItems
            )
        );

        siblings.map((item) => {
          const isDisplayed = this.isSubItemAlreadyDisplayed(item);
          if (!isDisplayed) {
            this.addSubHiddenFileItem(item);
          }
        });

        if (
          this.fileItemManager.isFileItemInArray(
            parentItem,
            this.hiddenFileItems
          )
        ) {
          this.removeHideFileItem(parentItem);
        }
        this.addSubDisplayedItem(parentItem);
      });
    }
  }

  addHideFileItem(fileItem: FileItem): void {
    if (
      this.fileItemManager.isFileItemInArray(fileItem, this.displayedFileItems)
    ) {
      this.removeFileItem(fileItem);
      this.cleanFileItemChildren(fileItem);

      return;
    }

    if (
      !this.fileItemManager.isFileItemInArray(fileItem, this.hiddenFileItems) &&
      !this.fileItemManager.isFileItemInArray(fileItem, this.subHiddenFileItems)
    ) {
      this.hiddenFileItems.push(fileItem);
      this.cleanFileItemChildren(fileItem);
    }
  }

  private addSubDisplayedItem(fileItem: FileItem): void {
    this.removeSubHiddenFileItem(fileItem);
    if (
      !this.fileItemManager.isFileItemInArray(
        fileItem,
        this.subDisplayedFileItems
      )
    ) {
      this.subDisplayedFileItems.push(fileItem);
    }
  }

  private addSubHiddenFileItem(fileItem: FileItem): void {
    if (
      this.fileItemManager.isFileItemInArray(
        fileItem,
        this.subDisplayedFileItems
      )
    ) {
      this.removeSubFileItem(fileItem);
      this.cleanFileItemChildren(fileItem);

      return;
    }

    if (
      !this.fileItemManager.isFileItemInArray(
        fileItem,
        this.subHiddenFileItems
      ) &&
      !this.fileItemManager.isFileItemInArray(fileItem, this.hiddenFileItems)
    ) {
      this.subHiddenFileItems.push(fileItem);
    }
  }

  private cleanFileItemChildren(fileItem: FileItem): void {
    const hiddenFileItems = [...this.hiddenFileItems];
    hiddenFileItems.map((hiddenItem) => {
      if (this.fileItemManager.isChildOf(hiddenItem, fileItem)) {
        this.removeHideFileItem(hiddenItem);
      }
    });
    const subHiddenFileItems = [...this.subHiddenFileItems];
    subHiddenFileItems.map((subHiddenItem) => {
      if (this.fileItemManager.isChildOf(subHiddenItem, fileItem)) {
        this.removeSubHiddenFileItem(subHiddenItem);
      }
    });
    const subDisplayedFileItems = [...this.subDisplayedFileItems];
    subDisplayedFileItems.map((subItem) => {
      if (this.fileItemManager.isChildOf(subItem, fileItem)) {
        this.removeSubFileItem(subItem);
      }
    });
  }

  private isSubItemAlreadyDisplayed(fileItem: FileItem): boolean {
    const isInHiddenItems: boolean = this.fileItemManager.isFileItemInArray(
      fileItem,
      this.hiddenFileItems
    );

    const isInSubHiddenItems: boolean = this.fileItemManager.isFileItemInArray(
      fileItem,
      this.subHiddenFileItems
    );

    const isChildOfHiddenItems: boolean = this.fileItemManager.isChildOfArray(
      fileItem,
      this.hiddenFileItems
    );

    const isChildOfSubHiddenItems: boolean =
      this.fileItemManager.isChildOfArray(fileItem, this.subHiddenFileItems);

    return !(
      isInHiddenItems ||
      isInSubHiddenItems ||
      isChildOfHiddenItems ||
      isChildOfSubHiddenItems
    );
  }

  private removeHideFileItem(fileItem: FileItem): void {
    const index = this.hiddenFileItems.findIndex(
      (item) => item.resourceUri?.fsPath === fileItem.resourceUri?.fsPath
    );

    if (index > -1) {
      this.hiddenFileItems.splice(index, 1);
    }
  }

  private removeSubHiddenFileItem(fileItem: FileItem): void {
    const index = this.subHiddenFileItems.findIndex(
      (item) => item.resourceUri?.fsPath === fileItem.resourceUri?.fsPath
    );

    if (index > -1) {
      this.subHiddenFileItems.splice(index, 1);
    }
  }

  private removeSubFileItem(fileItem: FileItem): void {
    const index = this.subDisplayedFileItems.findIndex(
      (item) => item.resourceUri?.path === fileItem.resourceUri?.path
    );

    if (index > -1) {
      this.subDisplayedFileItems.splice(index, 1);
    }
  }

  private removeFileItem(fileItem: FileItem): void {
    const index = this.displayedFileItems.findIndex(
      (item) => item.resourceUri?.path === fileItem.resourceUri?.path
    );

    if (index > -1) {
      this.displayedFileItems.splice(index, 1);
    }
  }

  refresh(element?: FileItem): void {
    const asPaths = (items: FileItem[]) => items.map(i => i.resourceUri?.fsPath);
    if (element) {
      this.addFileItem(element);
    }
    this.removeNotFiles();

    this._onDidChangeTreeData.fire(element);

    this.context.workspaceState.update(displayed, 
      asPaths(this.displayedFileItems));
    this.context.workspaceState.update(hidden,
      asPaths(this.hiddenFileItems));
    this.context.workspaceState.update(subDisplayed,
      asPaths(this.subDisplayedFileItems));
    this.context.workspaceState.update(subHidden, 
      asPaths(this.subHiddenFileItems));
  }

  clean(): void {
    this.displayedFileItems = [];
    this.hiddenFileItems = [];
    this.subDisplayedFileItems = [];
    this.subHiddenFileItems = [];
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
      const item = this.fileItemManager.createFileItem(itemPath);

      if (
        !this.fileItemManager.isFileItemInArray(item, this.hiddenFileItems) &&
        !this.fileItemManager.isFileItemInArray(item, this.subHiddenFileItems)
      ) {
        items.push(item);
      }
    }

    return Promise.resolve(this.fileItemManager.sortItems(items, this.sortedMode));
  }

  removeItemFromJustFiles(item: FileItem) {
    this.removeFileItem(item);
    this.removeHideFileItem(item);
    this.removeSubFileItem(item);
    this.removeSubHiddenFileItem(item);
  }
}
