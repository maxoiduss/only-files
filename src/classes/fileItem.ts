import * as vscode from "vscode";
import * as vzcode from "../interfaces/vzcode";
import { ExtensionBrandResolver } from "./extensionBrandResolver";
import { asRelative, basename, getPathDepth, getTopRootOf, getUri, resolveUri
} from "./utilManager";

export const file = "file" as const;
export const folder = "folder" as const;
export const emptyRoot = "vac" as const;
export const placeholder = "dummy" as const;
export const emptyItem = "empty" as const;
export const rootFile = "rooting" as const;
export const root = "root" as const;

const empty = '' as const;
const separator = '/';
const timegap = 2500 as const;

const name = () => ExtensionBrandResolver.command;
const workspaceFolders = () => vscode.workspace.workspaceFolders ?? [];

export const command = {
  get tryOpen() { return `${name()}.tryOpen`; }
};

export type FileItemLike = { /// Serializable
  id: string;
  label: string;
  state: vscode.TreeItemCollapsibleState;
  file: boolean;
} & vzcode.Serializable;

export class FileItem extends vscode.TreeItem {
  public isFile: boolean;
  public lastClickTime: number;
  public relativePath!: string;
  public override id!: string;

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
      super(asRelative(getUri(label)), collapsibleState);
      this.resourceUri = getUri(label);
    }
    this.isFile = isFile;
    this.lastClickTime = Date.now() - timegap;
    this.command = {
      command: command.tryOpen,
      title: "Try Open",
      arguments: [this]
    };
    this.setUri(resourceUri, true);
  }
  
  private getContextType() : string {
    const pathDepth = getPathDepth(this.relativePath);
    const isMultiRoot = workspaceFolders().length > 1;
    const isInRoot = isMultiRoot ? pathDepth === 1 : pathDepth === 0;
    const isRoot = isMultiRoot && pathDepth === 0;

    return this.isFile ?
      isInRoot ? rootFile : file
    : isRoot ? rootFile : folder;
  }

  protected shiftId() { this.id = separator + this.id; }

  public setUri(resourceUri: vscode.Uri | undefined, ctor?: boolean) {
    this.resourceUri = ctor ? this.resourceUri : resourceUri;
    this.relativePath = asRelative(this.resourceUri);
    this.contextValue = this.getContextType();
    this.id = (this.resourceUri ?? getUri(this.getLabel())).toString();

    if (!ctor) { this.setLabel(); } /// switch relative to basename and back
  }

  public async getUri(): Promise<vscode.Uri> {
    return this.resourceUri ?? await resolveUri(this.getLabel());
  }

  public setLabel(plain? : boolean, options?: { readonly sorted: boolean}) {
    const label = this.label?.toString();
    this.label = label ?
      options ?
        options.sorted ?
          basename(this.relativePath) : this.relativePath
      : label.includes(separator) || plain ?
          this.relativePath : basename(this.relativePath)
    : label;
  }

  public getLabel(): string {
    return this.label! as string;
  }

  public hasExpandedState(options?: {readonly changeTo: boolean}): boolean {
    if (options) {
      this.collapsibleState = options.changeTo === true &&
        this.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed ?
          vscode.TreeItemCollapsibleState.Expanded
        : options.changeTo === false &&
          this.collapsibleState === vscode.TreeItemCollapsibleState.Expanded ?
            vscode.TreeItemCollapsibleState.Collapsed
          : this.collapsibleState;
    }
    return this instanceof EmptyFolderItem && this.contextValue === emptyItem ?
      true
    : this.collapsibleState === vscode.TreeItemCollapsibleState.Expanded;
  }

  public like(anotherItem: vscode.TreeItem): boolean;
  public like(anotherItemPath: string): boolean;
  public like(anotherItemOrPath: vscode.TreeItem | string): boolean;
  public like(another: vscode.TreeItem | string): boolean {
    return typeof another === "string" ?
      another === this.resourceUri?.toString()
    : another instanceof vscode.TreeItem ?
        this.resourceUri?.toString() === another.resourceUri?.toString()
      : false;
  }

  public async isEmpty(): Promise<boolean> {
    if (!this.resourceUri || this.isFile) { return false; }
  
    const files = await vscode.workspace.fs.readDirectory(this.resourceUri);
    return files.length <= 0;
  }
}

export class RootFileItem extends FileItem {
  constructor(folder: number = 0) {
    super(' ',
      vscode.TreeItemCollapsibleState.None,
      false,
      workspaceFolders().length > folder ?
        workspaceFolders()[folder].uri
      : getUri(getTopRootOf(process.cwd()))
    );
    this.contextValue = root;
    this.label = ' ';
    this.iconPath = ' ';
    this.command = undefined;
    this.shiftId();
  }
}

export class EmptyFolderItem extends FileItem {
  constructor(another: vscode.Uri);   /// purified item
  constructor(another: vscode.TreeItem); /// plain item
  constructor(another: vscode.TreeItem | vscode.Uri) {
    if (another instanceof vscode.TreeItem) {
      super(another.label as string ?? asRelative(another.resourceUri),
        vscode.TreeItemCollapsibleState.None,
        false,
        another.resourceUri ?? getUri(another.label as string)
      );
      this.contextValue = emptyItem;
      this.shiftId(); this.shiftId();
    } else {
      super(`${basename(another)} `,
        vscode.TreeItemCollapsibleState.Collapsed,
        false,
        another
      );
      this.contextValue = folder;
      this.shiftId();
    }
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
