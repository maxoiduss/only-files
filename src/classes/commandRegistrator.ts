import * as vscode from "vscode";
import { command, FileItem } from "./fileItem";
import {
  FoldersReferenceProvider, getPositionSafelyFrom
} from "./foldersReferenceProvider";
import {
  brand as brand, ExtensionBrandResolver
} from "./extensionBrandResolver";
import { ExtensionStaticService } from "./extensionStaticService";
import * as manager from "./fileItemManager";
import {
  basename,
  extname,
  getFolder,
  getNicePath,
  getNumeric,
  getUriFrom,
  same,
  showQuickInput,
  workspace
} from "./utilManager";

const empty = '' as const;

const name = () => ExtensionBrandResolver.command;
const configuration = () => ExtensionBrandResolver.configuration;
const string1Property = () => ExtensionBrandResolver.stringProperty;

const tolerances = {
  get click() { return ExtensionStaticService.clickTolerance; },
  get rename() { return ExtensionStaticService.renameTolerance; }
};

const commands = {
  get ctrlPressed() { return `${name()}.ctrl`; },
  get renameFile() { return `${name()}.rename`; },
  get renameFromTab() { return `${name()}.renameTab`; },
  get duplicateFile() {return `${name()}.duplicate`; }, 
  get deleteFile() { return `${name()}.delete`; },
  get deleteHard() { return `${name()}.deleteHard`; },
  get copy() { return `${name()}.copy`; },
  get cut() { return `${name()}.cut`; },
  get paste() { return `${name()}.paste`; },
  get copyFilePath() { return `${name()}.copyFilePath`; },
  get copyRelative() { return `${name()}.copyRelativeFilePath`; },
  get showSettings() { return `${name()}.showSettings`; },
  get reveal() { return `${name()}.revealFileInOS`; },
  get find() { return `${name()}.findRef`; },
  get eptifyFolder() { return `${name()}.emptify`; },
  get newFolder() { return `${name()}.newFolder`; },
  get newFile() { return `${name()}.newFile`; },
      referenceBuiltin: "editor.action.showReferences",
      revealBuiltin: "revealFileInOS"
} as const;

type V = void;
type FileItemOr = FileItem | undefined;

export const getRegistratorCommands = (): string[] => {
  return Object.values(commands).sort();
};

export class CommandRegistrator {
  private readonly referenceProvider: FoldersReferenceProvider = 
    new FoldersReferenceProvider();

  private ctrlPressed: boolean = false;
  private wasRenaming: boolean = false;
  private wasCutted: boolean = false;
  private internals: Set<vscode.Uri> = new Set();
  private selected: Object | undefined;

  constructor(
    private readonly context?: vscode.ExtensionContext,
    private readonly refreshStateAction?: (it: FileItemOr) => V,
    private readonly changedItemAction?: (i: FileItemOr, u: vscode.Uri) => V
  ) {
    ExtensionStaticService.updateTolerances();
  }

  private async getAllSelectedIfBad(fileItem?: Object): Promise<FileItem[]> {
    await this.getAnySelectedIfBad(fileItem);

    const items = fileItem ?? this.selected;
    return Array.isArray(items) ? items as FileItem[] : [items as FileItem];
  }

  private async createNewExplorerItem(uriTo: vscode.Uri, isFile: boolean) {
    const newName = await vscode.window.showInputBox({
      prompt: `Enter new ${isFile ? 'file' : 'folder'} name`,
      value: empty
    });
    if (!newName) { return; }
    
    const newUri = vscode.Uri.joinPath(uriTo, newName);
    try {
      if (isFile) {
        await vscode.workspace.fs.writeFile(newUri, new Uint8Array()); }
      else {
        await vscode.workspace.fs.createDirectory(newUri);
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `Failed to create ${isFile ? 'file' : 'folder'}: ${err.message}`);
    }
    finally { this.refreshViewsState(); }
  }

  private refreshViewsState(item?: FileItem) {
    this.refreshStateAction?.(item);
  }

  private changeItemInViews(item: FileItemOr, oldUri: vscode.Uri) {
    this.changedItemAction?.(item, oldUri);
  }

  private async emptifyFolder(fileItem: FileItem | vscode.Uri): Promise<V> {
    let files: [string, vscode.FileType][] = [];
    let base: vscode.Uri | string = empty;
    try {  
      if   (fileItem instanceof FileItem
        && !fileItem.isFile
        &&  fileItem.resourceUri) {
        base = fileItem.resourceUri;
        files = await vscode.workspace.fs.readDirectory(fileItem.resourceUri);
      }
      else if (fileItem instanceof vscode.Uri) {
        base = fileItem;
        files = await vscode.workspace.fs.readDirectory(fileItem);
      }
      if (base instanceof vscode.Uri) {
        for (const [name] of files) {
          const uri = vscode.Uri.joinPath(base, name);
          await vscode.workspace.fs.delete(uri,
            { recursive: true, useTrash: true}
          );
        }
      }
    } catch (error) { }
    if (files.length > 0) { this.refreshViewsState(); }
  }

  private async duplicateItem(fileItem: FileItem | vscode.Uri): Promise<V> {
    const config = vscode.workspace.getConfiguration(configuration());
    const num = getNumeric();
    const postfix = config.get(string1Property(), "_") + num;
    const uri = fileItem instanceof FileItem ?
      fileItem.resourceUri : fileItem;
      
    if (uri && postfix.length > 0) {
      const extn = extname(uri);
      const name = manager.getNameWithoutExt(fileItem) + `_${postfix}`;
      const folder = await getFolder(uri);
      const duplicate = vscode.Uri.joinPath(folder, name + extn);
      await workspace.fs.copy(uri, duplicate);
      this.refreshViewsState();
    }
  }

  private async deleteItem(
    fileItem: FileItem | vscode.Uri | undefined,
    useTrash: boolean = true,
    useWarning: boolean = false
  ): Promise<void> {
    const warning = "Completely Delete?";
    if (fileItem instanceof vscode.Uri) {
      const agree = !useWarning ? true : await showQuickInput(warning,
        getNicePath(fileItem)
      );
      try {
        agree ? await vscode.workspace.fs.delete(fileItem,
          { recursive: true, useTrash: useTrash }
        ) : {};
      } catch (error) { }
    }
    else {
      if (!fileItem?.resourceUri) { return; }
      try {
        const agree = !useWarning ? true : await showQuickInput(warning,
          getNicePath(fileItem.resourceUri)
        );
        agree ? await vscode.workspace.fs.delete(fileItem.resourceUri,
          { recursive: true, useTrash: useTrash }
        ) : {};
      } catch(e) { }
    }
    this.refreshViewsState();
  }
  
  private uncutAllItems() {
    this.internals.clear();
    this.wasCutted = false;
  }

  private async copyItem(fileItem: FileItemOr): Promise<void> {
    if (!fileItem?.resourceUri) { return; }

    this.internals.add(fileItem.resourceUri);

    if (fileItem.isFile) {
      const array = await vscode.workspace.fs.readFile(fileItem.resourceUri);
      const content = Buffer.from(array).toString('utf8');
      await vscode.env.clipboard.writeText(content);
    }
  }

  private async renameItem(
    item: FileItem | vscode.Uri | undefined,
    reopenEditor: boolean = false
  ): Promise<void> {
    if (item instanceof FileItem && !item.resourceUri) { return; }
    
    const oldUri = getUriFrom(item);
    if (!oldUri) { return; }
    
    const changeUriForItem = (fileItem: FileItem) => {
      fileItem.setUri(newUri);
      this.changeItemInViews(fileItem, oldUri);
    };
    const stop = new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (!this.wasRenaming) {
            clearInterval(interval); resolve();
        }}, 400);
    });
    this.wasRenaming = true;

    const oldName = basename(oldUri);
    const newName = await showQuickInput("Enter new name", oldName, stop);
    if (newName === empty || same(newName, oldName)) {
      this.wasRenaming = false;
      
      return;
    }
    const newUri = vscode.Uri.joinPath(manager.getParent(oldUri), newName);
    await vscode.workspace.fs.rename(oldUri, newUri,
      { overwrite: reopenEditor }
    );
    if (item instanceof FileItem) { changeUriForItem(item); }
    else {
      this.changeItemInViews(undefined, oldUri);
      
      const selected = await this.getAnySelectedIfBad();
      if (selected?.like(oldUri.toString())) {
        changeUriForItem(selected);
      }
    }

    if (reopenEditor) {
      await vscode.workspace.openTextDocument(newUri);
    }
    this.wasRenaming = false;
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

  async cutOrCopyItems(items: FileItem[]): Promise<void> {
    if (this.ctrlPressed) {
      this.ctrlPressed = false;
      this.copyItems(items);
    } else {
      this.cutItems(items);
    }
  }

  async copyItems(items: Object): Promise<void> {
    this.internals.clear();
    const fileItems = await this.getAllSelectedIfBad(items);
    await Promise.all(fileItems.map((i) => this.copyItem(i)));
  }

  async cutItems(items: FileItem[]): Promise<void> {
    this.internals.clear();
    await Promise.all(items.map((i) => this.copyItem(i)));
    this.wasCutted = true;
  }

  async pasteItems(whereItem: Object | undefined): Promise<void> {
    const where = await this.getAnySelectedIfBad(whereItem);
    if (!where?.resourceUri) { return; }

    const newUriTo = await getFolder(where.resourceUri);
    const internalsAScopy = new Set(this.internals);

    for (const source of internalsAScopy) {
      const placename = basename(newUriTo);
      const filename = basename(source);
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
          await workspace.fsh.copy(source, target,
            { useTrash: false });
        } else {
          await workspace.fs.copy(source, target,
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
    this.refreshViewsState();
  }

  onRenaming(): boolean {
    const wasOn = this.wasRenaming;
    this.wasRenaming = false;

    return wasOn;
  }

  registerEditor() {
    const did = vscode.workspace.onDidOpenTextDocument((e) => {
      const pathe = e.uri.toString();
      for (const uri of this.internals) {
        if (same(pathe, uri)) {
          this.uncutAllItems();
        }
      }
    });
    this.context?.subscriptions?.push(did);
  }

  registerCommands() {
    const _set = vscode.commands.registerCommand(brand.setSelected,
      (item: Object | undefined) => this.selected = item
    );
    const _click = vscode.commands.registerCommand(command.tryOpen,
      async (item: FileItem)=> {
        const fileItem = await this.getAnySelectedIfBad(item);
        if (!fileItem) { return; }

        const now = Date.now();
        const tolerance = now - fileItem.lastClickTime;
        fileItem.lastClickTime = now;

        if (tolerance < tolerances.click) {
          if (fileItem.isFile) {
            vscode.commands.executeCommand(
              brand.vscode.open,
              fileItem.resourceUri
            );
            fileItem.lastClickTime -= tolerances.rename;
          }
        } 
        else if (tolerance < tolerances.rename) {
          vscode.commands.executeCommand(commands.renameFile, fileItem);
        } else {
          if (this.wasRenaming) {
            fileItem.lastClickTime -= tolerances.rename;
          }
          this.wasRenaming = false;
        }
    });
    const _ctrlkey = vscode.commands.registerCommand(commands.ctrlPressed,
      async () => {
        this.ctrlPressed = true;
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        this.ctrlPressed = false;
    });
    const _rename = vscode.commands.registerCommand(commands.renameFile,
      async (item: FileItem) => {
        const fileItem = await this.getAnySelectedIfBad(item);
        await this.renameItem(fileItem);
    });
    const _renametb = vscode.commands.registerCommand(commands.renameFromTab,
      async (item: vscode.Uri | undefined) => {
        const uri = item ?? vscode.window.activeTextEditor?.document.uri;
        if (!uri) { return; }

        await this.renameItem(uri, true);
    });
    const _emptify = vscode.commands.registerCommand(commands.eptifyFolder,
      async (item: FileItem | vscode.Uri) => await this.emptifyFolder(item)
    );
    const _duplicat = vscode.commands.registerCommand(commands.duplicateFile,
      async (item: FileItem | vscode.Uri) => await this.duplicateItem(item)
    );
    const _delete = vscode.commands.registerCommand(commands.deleteFile,
      async (item: Object) => {
        const elements = Array.isArray(item) ? item : undefined;
        const items = await this.getAllSelectedIfBad(elements);
        await Promise.all(items.map((i) => this.deleteItem(i)));
    });
    const _deletehrd = vscode.commands.registerCommand(commands.deleteHard,
      async (item: Object) => {
        const elements = Array.isArray(item) ? item : undefined;
        const items = await this.getAllSelectedIfBad(elements);
        await Promise.all(items.map((i) => this.deleteItem(i, false, true)));
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
      async (item: FileItem) => {
        const fileItem = await this.getAnySelectedIfBad(item);
        if (!fileItem?.resourceUri) { return; }

        await vscode.env.clipboard.writeText(
          getNicePath(fileItem.resourceUri)
        );
    });
    const _copyrfp = vscode.commands.registerCommand(commands.copyRelative, 
      async (item: FileItem) => {
        const fileItem = await this.getAnySelectedIfBad(item);
        if (!fileItem?.resourceUri) { return; }
        
        const relativePath = vscode.workspace.asRelativePath(
          fileItem.resourceUri
        );
        await vscode.env.clipboard.writeText(relativePath);
    });
    const _find = vscode.commands.registerCommand(commands.find,
      async (item: FileItem) => {
        const fileItem = await this.getAnySelectedIfBad(item);
        if (!fileItem?.resourceUri) { return; }

        const cts = new vscode.CancellationTokenSource();
        const locations: vscode.Location[] =
          await this.referenceProvider.provideReferencesFor(
            fileItem, cts.token
          );
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
        if (!fileItem?.resourceUri) { return; }
        
        await vscode.commands.executeCommand(
          commands.revealBuiltin,
          fileItem.resourceUri);
    });
    const _new = vscode.commands.registerCommand(commands.newFile,
      async (item: FileItem) => {
        const fileItem = await this.getAnySelectedIfBad(item);
        if (!fileItem?.resourceUri) { return; }
        
        const folderUri = fileItem.isFile ?
          manager.getParent(fileItem) : fileItem.resourceUri;
        this.createNewExplorerItem(folderUri, true);
    });
    const _newfld = vscode.commands.registerCommand(commands.newFolder, 
      async (item: FileItem) => {
        const fileItem = await this.getAnySelectedIfBad(item);
        if (!fileItem?.resourceUri) { return; }

        const folderUri = fileItem.isFile ?
          manager.getParent(fileItem) : fileItem.resourceUri;
        this.createNewExplorerItem(folderUri, false);
    });
    const _setting = vscode.commands.registerCommand(commands.showSettings,
      async () => {
        const byId = (id: any) => `@ext:${id}`;
        await vscode.commands.executeCommand(
          brand.workbench.action.openSettings,
          byId(this.context?.extension?.id)
        );
      }
    );
    this.context?.subscriptions?.push(
      _set, _click, _ctrlkey, _setting,
      _rename, _renametb,
      _duplicat, _emptify, _copy, _cut, _paste,
      _delete, _deletehrd,
      _copyfp, _copyrfp, _reveal,
      _new, _newfld, _find
    );
  }
}
