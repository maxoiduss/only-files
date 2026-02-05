import * as vscode from "vscode";
import { command, FileItem } from "./fileItem";
import {
  FoldersReferenceProvider,
  getPositionSafelyFrom
} from "./foldersReferenceProvider";
import {
  getPathASsequence,
  getSequenceASpath,
  same
} from "./utilManager";
import fpath = require("path");
import {
  brand as brand,
  ExtensionBrandResolver
} from "./extensionBrandResolver";

const name = () => ExtensionBrandResolver.brand;
const configuration = () => ExtensionBrandResolver.configuration;
const number1Property = () => ExtensionBrandResolver.number1Property;
const number2Property = () => ExtensionBrandResolver.number2Property;

const empty = '';

const commands = {
  get renameFile() { return `${name()}.rename`; },
  get deleteFile() { return `${name()}.delete`; },
  get copy() { return `${name()}.copy`; },
  get cut() { return `${name()}.cut`; },
  get paste() { return `${name()}.paste`; },
  get copyFilePath() { return `${name()}.copyFilePath`; },
  get copyRelative() { return `${name()}.copyRelativeFilePath`; },
  get reveal() { return `${name()}.revealFileInOS`; },
  get find() { return `${name()}.findRef`; },
  get newFolder() { return `${name()}.newFolder`; },
  get newFile() { return `${name()}.newFile`; },
      referenceBuiltin: "editor.action.showReferences",
      revealBuiltin: "revealFileInOS"
} as const;

export class CommandRegistrator {
  private readonly referenceProvider: FoldersReferenceProvider = 
    new FoldersReferenceProvider();

  private wasCutted: boolean = false;
  private selected: Object | undefined;
  private internals: Set<vscode.Uri> = new Set();
  
  constructor(
    private readonly context?: vscode.ExtensionContext,
    private readonly refreshStateAction?: Function
  ) {
    this.updateTolerances();
  }

  static getCommands(): string[] {
    return Object.values(commands).sort();
  }

  updateTolerances() {
    const config = vscode.workspace.getConfiguration(configuration());
    FileItem.clickTolerance = config.get(number1Property(), 500);
    FileItem.renameTolerance = config.get(number2Property(), 1500);
  }

  async getAnySelectedIfBad(fileItem?: Object): Promise<FileItem> {
    if (!fileItem) {
      await vscode.commands.executeCommand(brand.getSelected);

      const item = Array.isArray(this.selected) ?
        (this.selected as FileItem[])[0] as FileItem
      : this.selected as FileItem;
      return item;
    }
    return fileItem as FileItem;
  }

  private async getAllSelectedIfBad(fileItem?: Object): Promise<FileItem[]> {
    await this.getAnySelectedIfBad(fileItem);

    const items = fileItem ?? this.selected;
    return Array.isArray(items) ? items as FileItem[] : [items as FileItem];
  }

  private async createNewExplorerItem(pathTo: string, isFile: boolean) {
    const newName = await vscode.window.showInputBox({
      prompt: `Enter new ${isFile ? 'file' : 'folder'} name`,
      value: empty
    });
    if (!newName) { return; }
    
    const newUri = vscode.Uri.file(fpath.join(pathTo, newName));
    try {
      if(isFile) {
        await vscode.workspace.fs.writeFile(newUri, new Uint8Array());
      } else {
        await vscode.workspace.fs.createDirectory(newUri);
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `Failed to create ${isFile ? 'file' : 'folder'}: ${err.message}`);
    }
    finally { await this.refreshViewsState(); }
  }

  private async refreshViewsState() {
    this.refreshStateAction?.();
  }

  private async deleteItem(
    fileItem: FileItem | vscode.Uri | undefined,
    useTrash: boolean = true
  ) {
    if (fileItem instanceof vscode.Uri) {
      await vscode.workspace.fs.delete(fileItem,
        { recursive: true, useTrash: useTrash}
      );
    } else
    {
      if (!fileItem?.resourceUri) { return ;}

      try {
        await vscode.workspace.fs.delete(fileItem.resourceUri,
          { recursive: true, useTrash: useTrash}
        );
      } catch(e) { }
    }
    await this.refreshViewsState();
  }
  
  private uncutAllItems() {
    this.internals.clear();
    this.wasCutted = false;
  }

  private async copyItem(fileItem: FileItem | undefined) {
    if (!fileItem?.resourceUri) { return ;}

    this.internals.add(fileItem.resourceUri);

    if (fileItem.isFile) {
      const array = await vscode.workspace.fs.readFile(fileItem.resourceUri);
      const content = Buffer.from(array).toString('utf8');
      await vscode.env.clipboard.writeText(content);
    }
  }

  async copyItems(items: Object) {
    this.internals.clear();
    const fileItems = await this.getAllSelectedIfBad(items);
    await Promise.all(fileItems.map(i => this.copyItem(i)));
  }

  async cutItems(items: FileItem[]) {
    this.internals.clear();
    await Promise.all(items.map(i => this.copyItem(i)));
    this.wasCutted = true;
  }

  async pasteItems(whereItem: Object | undefined) {
    const where = await this.getAnySelectedIfBad(whereItem);
    if (!where?.resourceUri) { return ;}

    const pathToASarray = getPathASsequence(where.resourceUri);
    if (where.isFile) {
      pathToASarray.pop();
    }
    const newUriTo = vscode.Uri.file(getSequenceASpath(pathToASarray));
    const internalsAScopy = new Set(this.internals);

    for (const source of internalsAScopy) {
      const placename = getPathASsequence(newUriTo).pop() ?? empty;
      const filename = getPathASsequence(source).pop() ?? empty;
      const target = vscode.Uri.joinPath(newUriTo, filename);
      const theSameNames = same(filename, placename);
      const theSameObjects = same(source, target);
      try {
        if ((this.wasCutted && theSameNames) || theSameObjects) {
          this.internals.delete(source);
          vscode.window.showInformationMessage(
            "Check what and where you're trying to cut/copy. " +
            "Overwrite is disabled.");
          continue;
        }
        if (theSameNames) {
          await vscode.workspace.fsh.copy(source, target,
            { useTrash: false });
        } else {
          await vscode.workspace.fs.copy(source, target,
            { overwrite: false });
        }
      } catch(ex) {
        this.internals.delete(source);
        continue;
      }
    }

    if (this.wasCutted) {
      for (const source of this.internals) {
        await this.deleteItem(source, false);
      }
      this.internals.clear();
      this.wasCutted = false;
    }
    await this.refreshViewsState();
  }

  registerEditor() {
    const did = vscode.workspace.onDidOpenTextDocument((e) => {
      const fspath = e.uri.fsPath;
      for (const uri of this.internals) {
        if (uri.fsPath === fspath) {
          this.uncutAllItems();
        }
      }
    });
    this.context?.subscriptions?.push(did);
  }

  registerCommands()
  {
    const _set = vscode.commands.registerCommand(
      brand.setSelected,
      (item: Object | undefined) => {
        this.selected = item;
    });
    const _click = vscode.commands.registerCommand(command.tryOpen,
    async (item: FileItem)=> {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem) { return; }

      const now = Date.now();
      if (now - fileItem.lastClickTime < FileItem.clickTolerance) {
        if (fileItem.isFile) {
          await vscode.commands.executeCommand(
            brand.vscode.open,
            fileItem.resourceUri
          );
        }
      } else
      if (now - fileItem.lastClickTime < FileItem.renameTolerance) {
        await vscode.commands.executeCommand(commands.renameFile, fileItem);
      }
      fileItem.lastClickTime = now;
    });
    const _rename = vscode.commands.registerCommand(commands.renameFile,
    async (item: FileItem)=> {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem?.resourceUri) { return ;}

      const oldUri = fileItem.resourceUri;
      const oldName = fpath.basename(oldUri.fsPath);
      const newName = await vscode.window.showInputBox({
        prompt: "Enter new name",
        value: oldName
      });
      if (!newName || newName === oldName) { return; }
      const newUri = vscode.Uri.joinPath(
        vscode.Uri.file(fpath.dirname(oldUri.fsPath)),
        newName
      );
      await vscode.workspace.fs.rename(oldUri, newUri, { overwrite: false });
      fileItem.resourceUri = newUri;

      await this.refreshViewsState();
    });
    const _delete = vscode.commands.registerCommand(commands.deleteFile,
    async (item: Object)=> {
      const items = await this.getAllSelectedIfBad(item);
      await Promise.all(items.map(i => this.deleteItem(i)));
    });
    const _copy = vscode.commands.registerCommand(commands.copy,
    async (item: Object) => {
      this.wasCutted = false;
      await this.copyItems(item);
    });
    const _cut = vscode.commands.registerCommand(commands.cut,
    async (item: Object) => {
      const items = await this.getAllSelectedIfBad(item);
      await this.cutItems(items);
    });
    const _paste = vscode.commands.registerCommand(commands.paste,
    async (item: Object) => {
      await this.pasteItems(item);
    });
    const _copyfp = vscode.commands.registerCommand(commands.copyFilePath,
    async (item: FileItem)=> {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem?.resourceUri) { return ;}

      await vscode.env.clipboard.writeText(fileItem.resourceUri.fsPath);
    });
    const _copyrfp = vscode.commands.registerCommand(commands.copyRelative, 
    async (item: FileItem)=> {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem?.resourceUri) { return ;}
      
      const relativePath = vscode.workspace.asRelativePath(fileItem.resourceUri);
      await vscode.env.clipboard.writeText(relativePath);
    });
    const _find = vscode.commands.registerCommand(commands.find,
    async (item: FileItem) => {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem?.resourceUri) { return ;}

      const cts = new vscode.CancellationTokenSource();
      const locations: vscode.Location[] =
        await this.referenceProvider.provideReferencesFor(fileItem, cts.token);
      const position = await getPositionSafelyFrom(fileItem.resourceUri);

      await vscode.commands.executeCommand(
        commands.referenceBuiltin,
        fileItem.resourceUri,
        position,
        locations
      );
    });
    const _reveal = vscode.commands.registerCommand(commands.reveal,
    async (item: FileItem) => {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem?.resourceUri) { return ;}
      
      await vscode.commands.executeCommand(
        commands.revealBuiltin,
        fileItem.resourceUri);
    });
    const _new = vscode.commands.registerCommand(commands.newFile,
    async (item: FileItem) => {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem?.resourceUri) { return ;}
      
      const folderPath = fileItem.isFile ?
        fpath.dirname(fileItem.resourceUri.fsPath)
      : fileItem.resourceUri.fsPath;
      this.createNewExplorerItem(folderPath, true);
    });
    const _newfld = vscode.commands.registerCommand(commands.newFolder, 
    async (item: FileItem) => {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem?.resourceUri) { return ;}

      const folderPath = fileItem.isFile ?
        fpath.dirname(fileItem.resourceUri.fsPath)
      : fileItem.resourceUri.fsPath;
      this.createNewExplorerItem(folderPath, false);
    });

    this.context?.subscriptions.push(
      _set, _click,
      _rename, _delete, _copy, _cut, _paste, 
      _copyfp, _copyrfp, _reveal,
      _new, _newfld, _find
    );
  }
}
