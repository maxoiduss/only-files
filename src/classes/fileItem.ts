import * as vscode from "vscode";
import * as fpath from 'path';
import { ExtensionBrandResolver
} from "./extensionBrandResolver";

export const file = "file" as const;
export const folder = "folder" as const;
export const emptyRoot = "vac" as const;
export const placeholder = "dummy" as const;
export const emptyItem = "empty" as const;
export const rootFile = "rooting" as const;
export const root = "root" as const;

const empty = '' as const;
const timegap = 2500 as const;

const name = () => ExtensionBrandResolver.command;

export const command = {
    get tryOpen() { return `${name()}.tryOpen`; }
};

export const asRelative = (uri: vscode.Uri | string | undefined) =>
  uri ? vscode.workspace.asRelativePath(uri).replace(/\\/g, '/') : empty;

export class FileItem extends vscode.TreeItem {
  public static clickTolerance: number;
  public static renameTolerance: number;

  public isFile: boolean;
  public lastClickTime: number;
  public relativePath!: string;

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
    this.lastClickTime = Date.now() - timegap;
    this.command = {
      command: command.tryOpen,
      title: "Try Open",
      arguments: [this]
    };
    this.setUri(resourceUri, label);
  }

  setUri(resourceUri: vscode.Uri | undefined, fromLabel?: string) {
    this.resourceUri = resourceUri ?? vscode.Uri.file(fromLabel ?? empty);
    this.relativePath = asRelative(this.resourceUri);
    this.contextValue = this.getContextType();
    this.id = this.relativePath;

    if (!fromLabel) { this.setLabel(); }
  }

  private setLabel() {
    const label = this.label?.toString();
    this.label = label ?
      label.includes('/') ?
        this.relativePath : fpath.basename(this.relativePath)
    : label;
  }

  private getContextType() : string {
    const isInRoot = !/[\/\\]/.test(
      typeof this.label === "string" ? this.label : this.relativePath
    );
    return this.isFile ?
      isInRoot ? rootFile : file
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
      : vscode.Uri.file(fpath.parse(process.cwd()).root)
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
      super(`${fpath.basename(another.resourceUri?.fsPath ?? ' ')} `,
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
      vscode.TreeItemCollapsibleState.None ? emptyItem : root;
    this.iconPath = new vscode.ThemeIcon("folder");
    this.command = undefined;
  }
}

export class PlaceholderItem extends vscode.TreeItem {
  constructor() {
      super(empty);
      this.contextValue = placeholder;
  }
}
