import * as vscode from "vscode";
import { brand } from "./commandRegistrator";
import path = require("path");

export const folder: string = "folder";
export const root: string = "root";
export const placeholder: string = "empty";
export const empty: string = placeholder;

export const asRelative = (uri: vscode.Uri | string) =>
  vscode.workspace.asRelativePath(uri).replace(/\\/g, '/');

export class FileItem extends vscode.TreeItem {
  public static clickTolerance: number;
  public static renameTolerance: number;

  public isFile: boolean;
  public lastClickTime: number;
  public relativePath: string;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    isFile: boolean
  );
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    isFile: boolean,
    resourceUri: vscode.Uri
  );

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    isFile: boolean = false,
    resourceUri?: vscode.Uri
  ) {
    if (resourceUri) {
      super(resourceUri, collapsibleState);
      this.label = label;
    } else {
      super(asRelative(label), collapsibleState);
    }
    this.isFile = isFile;
    this.lastClickTime = Date.now();
    this.resourceUri = resourceUri ?? vscode.Uri.file(label);
    this.relativePath = asRelative(this.resourceUri);
    this.contextValue = this.getContextType();
    this.command = {
      command: `${brand}.tryOpen`,
      title: "Open Custom",
      arguments: [this]
    };
  }

  private getContextType() : string {
    const isInRoot = !/[\/\\]/.test(
      typeof this.label === "string" ? this.label : this.relativePath
    );
    return this.isFile ?
      isInRoot ? "fileRoot" : "file"
    : folder;
  }

  hasExpandedState(options?: {readonly changeTo: boolean}): boolean {
    if (options) {
      this.collapsibleState = options.changeTo === true &&
        this.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed ?
          vscode.TreeItemCollapsibleState.Expanded
        : options.changeTo === false &&
          this.collapsibleState === vscode.TreeItemCollapsibleState.Expanded ?
            vscode.TreeItemCollapsibleState.Collapsed
          : this.collapsibleState;
    }
    return this instanceof EmptyFolderItem && this.contextValue === folder ?
      true
    : this.collapsibleState === vscode.TreeItemCollapsibleState.Expanded;
  }

  like(anotherItem: vscode.TreeItem): boolean;
  like(anotherItemPath: string): boolean;
  like(anotherItemOrPath: vscode.TreeItem | string): boolean;
  like(another: vscode.TreeItem | string): boolean {
    return typeof another === "string" ?
      another === this.resourceUri?.fsPath
    : another instanceof vscode.TreeItem ?
        this.resourceUri?.fsPath === another.resourceUri?.fsPath
      : false;
  }

  async isEmpty(): Promise<boolean> {
    if (!this.resourceUri || this.isFile) { return false; }
  
    const files = await vscode.workspace.fs.readDirectory(this.resourceUri);
    return files.length <= 0;
  }
}

export class RootFileItem extends FileItem {
  constructor() {
    super(' ',
      vscode.TreeItemCollapsibleState.None,
      false,
      vscode.workspace.workspaceFolders ?
        vscode.workspace.workspaceFolders[0].uri
      : vscode.Uri.file(path.parse(process.cwd()).root)
    );
    this.contextValue = root;
    this.label = ' ';
    this.iconPath = ' ';
    this.command = undefined;
  }
}

export class EmptyFolderItem extends FileItem {
  constructor(anotherItem: vscode.Uri, expandable?: boolean);
  constructor(anotherItem: vscode.TreeItem, expandable?: boolean);
  constructor(another: vscode.TreeItem | vscode.Uri, expandable?: boolean);
  constructor(another: vscode.TreeItem | vscode.Uri, expandable?: boolean) {
    if (another instanceof vscode.TreeItem) {
      super(`${path.basename(another.resourceUri?.fsPath ?? ' ')} `,
        expandable ?
          vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
        false);
    } else {
      super(`${another.fsPath}`,
        expandable ?
          vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
        false);
    }
    this.contextValue = this.collapsibleState ===
      vscode.TreeItemCollapsibleState.None ? folder : root;
    this.iconPath = new vscode.ThemeIcon("folder");
    this.command = undefined;
  }
}

export class PlaceholderItem extends vscode.TreeItem {
  constructor() {
      super('');
      this.contextValue = placeholder;
  }
}
