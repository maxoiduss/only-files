import * as vscode from "vscode";
import { FileItem } from "./fileItem";
import {
  FoldersReferenceProvider,
  getPositionSafelyFrom
} from "./foldersReferenceProvider";
import path = require("path");

export const brand: string = "just-files";

const COMMANDS = {
  renameFile: `${brand}.rename`,
  deleteFile: `${brand}.delete`,
  copy: `${brand}.copy`,
  cut: `${brand}.cut`,
  paste: `${brand}.paste`,
  copyFilePath: `${brand}.copyFilePath`,
  copyRelative: `${brand}.copyRelativeFilePath`,
  reveal: `${brand}.revealFileInOS`,
  find: `${brand}.findRef`,
  newFolder: `${brand}.newFolder`,
  newFile: `${brand}.newFile`,
  referenceBuiltin: "editor.action.showReferences",
  revealBuiltin: "revealFileInOS"
} as const;

export class CommandRegistrator {
  private readonly context: vscode.ExtensionContext | undefined;
  private readonly refreshStateAction: Function | undefined;
  private readonly referenceProvider: FoldersReferenceProvider = 
    new FoldersReferenceProvider();

  private wasCutted: boolean = false;
  private selected: Object | undefined;
  private internals: Set<vscode.Uri> = new Set();
  
  constructor(context?: vscode.ExtensionContext, refresh?: Function) {
    this.context = context;
    this.refreshStateAction = refresh;
    this.updateTolerances();
  }

  updateTolerances() {
    const config = vscode.workspace.getConfiguration(`${brand}`);
    FileItem.clickTolerance = config.get("clicktime", 500);
    FileItem.renameTolerance = config.get("renametime", 1500);
  }

  async getAnySelectedIfBad(fileItem?: Object): Promise<FileItem> {
    if (!fileItem) {
      await vscode.commands.executeCommand(`${brand}.getSelected`);

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
      value: ''
    });
    if (!newName) { return; }
    
    const newUri = vscode.Uri.file(path.join(pathTo, newName));
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

  private async deleteItem(fileItem: FileItem | vscode.Uri | undefined) {
    if (fileItem instanceof vscode.Uri) {
      await vscode.workspace.fs.delete(fileItem, { recursive: true, useTrash: true});
    } else
    {
      if (!fileItem?.resourceUri) { return ;}

      try {
        await vscode.workspace.fs.delete(fileItem.resourceUri,
          { recursive: true, useTrash: true}
        );
      } catch(e) { }
    }
    await this.refreshViewsState();
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
    function getLastSubPath(path: string): string[] {
      return path.split('/');
    }
    const where = await this.getAnySelectedIfBad(whereItem);
    if (!where?.resourceUri) { return ;}

    const pathToASarray = getLastSubPath(where.resourceUri.path);
    if (where.isFile) {
      pathToASarray.pop();
    }
    const newUriTo = vscode.Uri.parse(pathToASarray.join('/'));
    const internalsAScopy = new Set(this.internals);

    for (const source of internalsAScopy) {
      const file = getLastSubPath(source.path).pop();
      const target = vscode.Uri.joinPath(newUriTo, file ?? '');
      try {
        if (source.toString() === target.toString()) {
          this.internals.delete(source);
          vscode.window.showInformationMessage(
            "Check what you're trying to cut/copy. Overwrite is disabled.");
        }
        await vscode.workspace.fs.copy(source, target, { overwrite: false });
      } catch(ex) { continue; }
    }

    if (this.wasCutted) {
      for (const source of this.internals) {
        await this.deleteItem(source);
      }
      this.internals.clear();
      this.wasCutted = false;
    }
    await this.refreshViewsState();
  }

  registerCommands()
  {
    const _set = vscode.commands.registerCommand(
      `${brand}.setSelected`,
      (item: Object | undefined) => {
        this.selected = item;
    });
    const _click = vscode.commands.registerCommand(`${brand}.tryOpen`,
    async (item: FileItem)=> {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem) { return; }

      const now = Date.now();
      if (now - fileItem.lastClickTime < FileItem.clickTolerance) {
        await vscode.commands.executeCommand("vscode.open", fileItem.resourceUri);
      } else
      if (now - fileItem.lastClickTime < FileItem.renameTolerance) {
        await vscode.commands.executeCommand(COMMANDS.renameFile, fileItem);
      }
      fileItem.lastClickTime = now;
    });
    const _rename = vscode.commands.registerCommand(COMMANDS.renameFile,
    async (item: FileItem)=> {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem?.resourceUri) { return ;}

      const oldUri = fileItem.resourceUri;
      const oldName = path.basename(oldUri.fsPath);
      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new name',
        value: oldName
      });
      if (!newName || newName === oldName) { return; }
      const newUri = vscode.Uri.joinPath(
        vscode.Uri.file(path.dirname(oldUri.fsPath)),
        newName
      );
      await vscode.workspace.fs.rename(oldUri, newUri, { overwrite: false });
      fileItem.resourceUri = newUri;

      await this.refreshViewsState();
    });
    const _delete = vscode.commands.registerCommand(COMMANDS.deleteFile,
    async (item: Object)=> {
      const items = await this.getAllSelectedIfBad(item);
      await Promise.all(items.map(i => this.deleteItem(i)));
    });
    const _copy = vscode.commands.registerCommand(COMMANDS.copy,
    async (item: Object) => {
      this.wasCutted = false;
      await this.copyItems(item);
    });
    const _cut = vscode.commands.registerCommand(COMMANDS.cut,
    async (item: Object) => {
      const items = await this.getAllSelectedIfBad(item);
      await this.cutItems(items);
    });
    const _paste = vscode.commands.registerCommand(COMMANDS.paste,
    async (item: Object) => {
      await this.pasteItems(item);
    });
    const _copyfp = vscode.commands.registerCommand(COMMANDS.copyFilePath,
    async (item: FileItem)=> {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem?.resourceUri) { return ;}

      await vscode.env.clipboard.writeText(fileItem.resourceUri.fsPath);
    });
    const _copyrfp = vscode.commands.registerCommand(COMMANDS.copyRelative, 
    async (item: FileItem)=> {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem?.resourceUri) { return ;}
      
      const relativePath = vscode.workspace.asRelativePath(fileItem.resourceUri);
      await vscode.env.clipboard.writeText(relativePath);
    });
    const _find = vscode.commands.registerCommand(COMMANDS.find,
    async (item: FileItem) => {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem?.resourceUri) { return ;}

      const cts = new vscode.CancellationTokenSource();
      const locations: vscode.Location[] =
        await this.referenceProvider.provideReferencesFor(fileItem, cts.token);
      const position = await getPositionSafelyFrom(fileItem.resourceUri);

      await vscode.commands.executeCommand(
        COMMANDS.referenceBuiltin,
        fileItem.resourceUri,
        position,
        locations
      );
    });
    const _reveal = vscode.commands.registerCommand(COMMANDS.reveal,
    async (item: FileItem) => {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem?.resourceUri) { return ;}
      
      await vscode.commands.executeCommand(
        COMMANDS.revealBuiltin,
        fileItem.resourceUri);
    });
    const _new = vscode.commands.registerCommand(COMMANDS.newFile,
    async (item: FileItem) => {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem?.resourceUri) { return ;}
      
      const folderPath = fileItem.isFile ?
        path.dirname(fileItem.resourceUri.fsPath)
      : fileItem.resourceUri.fsPath;
      this.createNewExplorerItem(folderPath, true);
    });
    const _newfld = vscode.commands.registerCommand(COMMANDS.newFolder, 
    async (item: FileItem) => {
      const fileItem = await this.getAnySelectedIfBad(item);
      if (!fileItem?.resourceUri) { return ;}

      const folderPath = fileItem.isFile ?
        path.dirname(fileItem.resourceUri.fsPath)
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
