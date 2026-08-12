import * as manager from "./fileItemManager";
import * as helper from "./fileSystemHelper";
import { command, FileItem, FileItemOr, FileItemOrUriOr } from "./fileItem";
import { workspace } from "./fileSystemHelper";
import { ExtensionStaticService } from "./extensionStaticService";
import { FoldersReferenceProvider, getPositionSafelyFrom
} from "./foldersReferenceProvider";
import { brand as brand,
  ExtensionBrandResolver } from "./extensionBrandResolver";
import {
  basename, extname, getFolder, getNicePath, getNumeric, getUri,
  getUriFrom, isValidUri, same, showQuickInput, sleep, validate
} from "./utilManager";

const empty = ''             as const;
const ctrlPressedTime = 1000 as const;

const tolerances = {
  get click() { return ExtensionStaticService.clickTolerance; },
  get rename() { return ExtensionStaticService.renameTolerance; }
};
const warnings = {
  get showEvery() {
    return ExtensionStaticService.showExtensionExtraWarnings; }
};
const singular = {
  get shouldCopyContent() {
    if (isWeb()) {
      return false;
    }
    return ExtensionStaticService.copyFileContentOnSingleCopy; }
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

const byId = ExtensionStaticService.withId;

const name             = () => ExtensionBrandResolver.command;
const configuration    = () => ExtensionBrandResolver.configuration;
const string1Property  = () => ExtensionBrandResolver.stringProperty;
const isWeb = () => ExtensionStaticService.process.platform === "web";

const cacheRemoval = (id: string) => ExtensionStaticService.cacheRemoval(id);
const throttling   = () => ExtensionStaticService.fsThrottling;
const cooldown     = () => 5 * throttling();

type Uri = vscode.Uri;

export const getRegistratorCommands = (): string[] => {
  return Object.values(commands).sort();
};

export class CommandRegistrator {
  private readonly refreshStateAction?: (it: FileItemOr) => void;
  private readonly changedItemAction?: (i: FileItemOrUriOr, u: Uri) => void;
  private readonly onWillHandleUri?: (u: vscode.Uri | undefined) => void;
  private readonly onDidHandleUri?: (u: vscode.Uri | undefined) => void;
  private readonly context?: vscode.ExtensionContext;
  private readonly referenceProvider: FoldersReferenceProvider = 
    new FoldersReferenceProvider();

  private internals: Set<string> = new Set();
  private selected:  Object | undefined;
  
  private ctrlPressed: boolean = false;
  private wasRenaming: boolean = false;
  private wasCutted:   boolean = false;

  public targeting = {
    on: (_: vscode.Uri) => { },
    off: () => { }
  };

  constructor(
    context?: vscode.ExtensionContext,
    refreshStateAction?: (it: FileItemOr) => void,
    changedItemAction?: (i: FileItemOrUriOr, u: vscode.Uri) => void,
    onWillHandleUri?: (u: vscode.Uri | undefined) => void,
    onDidHandleUri?: (u: vscode.Uri | undefined) => void
  ) {
    this.context = context;
    this.refreshStateAction = refreshStateAction;
    this.changedItemAction = changedItemAction;
    this.onWillHandleUri = onWillHandleUri;
    this.onDidHandleUri = onDidHandleUri;
    ExtensionStaticService.updateTolerances();
    ExtensionStaticService.updateCopyFileContentOnSingleCopy();
  }

  private async getAllSelectedIfBad(fileItem?: Object): Promise<FileItem[]> {
    await this.getAnySelectedIfBad(fileItem);

    const items = fileItem ?? this.selected;
    return Array.isArray(items) ? items as FileItem[] : [items as FileItem];
  }

  private async createNewExplorerItem(uriTo: vscode.Uri, isFile: boolean) {
    const newName = await vscode.window.showInputBox({
      prompt: `Enter new ${isFile ? 'file' : 'folder'} name`,
      value: empty,
      ignoreFocusOut: true,
      validateInput: validate().rename
    });
    if (!newName) { return; }
    
    const newUri = vscode.Uri.joinPath(uriTo, newName);
    this.willHandleUris([newUri]);
    try {
      const fs = workspace.fs;
      await (isFile ? fs.createFile : fs.createDirectory)(newUri); }
    catch (err: any) {
      vscode.window.showErrorMessage(
        `Failed to create ${isFile ? 'file' : 'folder'}: ${err.message}`);
    }
    finally {
      this.didHandleUri(newUri);
      this.refreshViewsStateFor(newUri); }
  }

  private willHandleUris(uris: (vscode.Uri | undefined)[]) {
    uris.forEach((uri) => this.onWillHandleUri?.(uri));
  }

  private didHandleUri(uri: vscode.Uri | undefined) {
    sleep(cooldown()).then(() =>
      this.onDidHandleUri?.(uri));
  }

  private refreshViewsStateFor(itemOrUriOr?: FileItemOrUriOr) {
    if (itemOrUriOr instanceof vscode.Uri) {
      manager.createFileItem(itemOrUriOr).then((item) =>
        this.refreshStateAction?.(item)); }
    else {
      this.refreshStateAction?.(itemOrUriOr); }
  }

  private changeItemInViews(item: FileItemOrUriOr, oldUri: vscode.Uri) {
    this.changedItemAction?.(item, oldUri);
    this.didHandleUri((item as FileItem)?.resourceUri || item as vscode.Uri);
    this.didHandleUri(oldUri);
  }

  private async emptifyFolder(fileItem: FileItemOrUriOr): Promise<void> {
    let errfs:  vscode.Uri | undefined;
    let files: [string, vscode.FileType][] = [];
    let basis:  vscode.Uri | string = empty;
    try {  
      if   (fileItem instanceof FileItem
        && !fileItem.isFile
        &&  fileItem.resourceUri)
      { basis = fileItem.resourceUri;
        files = await workspace.fs.readDirectory(fileItem.resourceUri); }
      else if (fileItem instanceof vscode.Uri) {
        basis = fileItem;
        files = await workspace.fs.readDirectory(fileItem);
      }
      
      if (basis instanceof vscode.Uri) {
        const base = basis;
        const uris = files.map(([name]) => vscode.Uri.joinPath(base, name));
        this.willHandleUris(uris);
        helper.ascertainBoost(files.length);

        for (const uri of uris) {
          errfs = uri;
          await workspace.fs.delete(uri,
            { recursive: false, useTrash: true });
          this.didHandleUri(uri);
        }
      } }
    catch (error) { this.didHandleUri(errfs); }

    if (files.length > 0) {
      this.refreshViewsStateFor(fileItem); }

    helper.rejectBoost();
  }

  private async duplicateItem(fileItem: FileItem | vscode.Uri): Promise<void>
  { const config = vscode.workspace.getConfiguration(configuration());
    const num = getNumeric();
    const uri = getUriFrom(fileItem);
    const postfix = config.get(string1Property(), "_") + num;
      
    if (uri && postfix.length > 0) {
      const extn = extname(uri);
      const name = await manager.getNameWithoutExt(fileItem) + `_${postfix}`;
      const folder = await getFolder(uri);

      if (await isValidUri(folder)) {
        const duplicate = extn !== empty ?
          vscode.Uri.joinPath(folder, `${name}.${extn}`)
        : vscode.Uri.joinPath(folder, `${name}`);
        this.willHandleUris([uri]);

        await workspace.fs.copy(uri, duplicate);
        this.didHandleUri(duplicate);
        this.refreshViewsStateFor(duplicate);
      }
    }
  }

  private async deleteItem(
    fileItem: FileItemOrUriOr,
    useTrash: boolean = true,
    useWarning: boolean = false
  ): Promise<void> {
    const deletes = async (uri: vscode.Uri) => {
      this.willHandleUris([uri]);
      cacheRemoval(uri.toString());

      await workspace.fs.delete(uri, {recursive: false, useTrash: useTrash});
      this.didHandleUri(uri);
    };
    const warning = "Completely Delete?";

    if (fileItem instanceof vscode.Uri) {
      const agree = !useWarning ? true : await showQuickInput(warning,
        getNicePath(fileItem));
      try { agree && await deletes(fileItem); }
      catch (error) { }
    }
    else {
      if (!fileItem?.resourceUri) { return; }
      try {
        const agree = !useWarning ? true : await showQuickInput(warning,
          getNicePath(fileItem.resourceUri ));
        agree && await deletes(fileItem.resourceUri); }
      catch(error) { }
    }
    this.refreshViewsStateFor(fileItem);
  }
  
  private uncutAllItems() {
    this.internals.clear();
    this.wasCutted = false;
  }

  private async copyItem(item: FileItemOr, single?: boolean): Promise<void> {
    if (!item?.resourceUri) { return; }

    this.internals.add(item.resourceUri.toString());

    if (item.isFile && single && singular.shouldCopyContent) {
      const array = await workspace.fs.readFile(item.resourceUri);
      const content = Buffer.from(array).toString('utf8');
      await vscode.env.clipboard.writeText(content);
    }
  }

  private async renameItem(
    item: FileItemOrUriOr,
    reopenEditor: boolean = false
  ): Promise<void> {
    if (item instanceof FileItem && !item.resourceUri) { return; }
    
    const oldUri = getUriFrom(item);
    if  (!oldUri) { return; }
    
    const changeUriForItem = (fileItem: FileItem) => {
      cacheRemoval(oldUri.toString());
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
    this.targeting.on(oldUri);

    const oldName = basename(oldUri);
    const newName = await showQuickInput("Enter new name", oldName, stop);
    if (newName === empty || same(newName, oldName)) {
      this.wasRenaming = false;
      this.targeting.off();

      return;
    }
    const newUri = vscode.Uri.joinPath(manager.getParent(oldUri), newName);
    this.willHandleUris([newUri, oldUri]);

    await workspace.fs.rename(oldUri, newUri, { overwrite: reopenEditor });
    const renamed = item instanceof vscode.Uri ?
      await manager.createFileItem(item) : item;

    if (renamed) {
      changeUriForItem(renamed); }
    /*if (item instanceof FileItem) { changeUriForItem(item); }
    else {
      let selected = await this.getAnySelectedIfBad();
      if (selected?.like(oldUri.toString())) {
        changeUriForItem(selected); }
      else {
        let t = selected; const m = t; t = m;
      }
    }*/

    if (reopenEditor) {
      await vscode.workspace.openTextDocument(newUri);
    }
    this.wasRenaming = false;
    this.targeting.off();
  }

  public async getAnySelectedIfBad(fileItem?: Object): Promise<FileItem> {
    if (!fileItem) {
      await vscode.commands.executeCommand(brand.getSelected);

      const item = Array.isArray(this.selected) ?
        (this.selected as FileItem[])[0] as FileItem
      : this.selected as FileItem;
      return item;
    }
    return fileItem as FileItem;
  }

  public async cutOrCopyItems(items: FileItem[]): Promise<void> {
    if (this.ctrlPressed) {
      this.ctrlPressed = false;
      this.copyItems(items);
    } else {
      this.cutItems(items);
    }
  }

  public async copyItems(items: FileItem[]): Promise<void> {
    this.internals.clear();
    this.wasCutted = false;
    const single = items.length === 1 ? true: undefined;
    await Promise.all(items.map((i) => this.copyItem(i, single)));
  }

  public async cutItems(items: FileItem[]): Promise<void> {
    this.internals.clear();
    this.wasCutted = true;
    await Promise.all(items.map((i) => this.copyItem(i)));
  }

  public async pasteItems(whereItem: Object | undefined): Promise<void> {
    const where = await this.getAnySelectedIfBad(whereItem);
    if (!where?.resourceUri) { return; }

    const newUriTo = await getFolder(where.resourceUri);
    const internalsAScopy = new Set(this.internals);
    helper.ascertainBoost(internalsAScopy.size);

    for (const internal of internalsAScopy) {
      const source = getUri(internal);
      const placename = basename(newUriTo);
      const filename = basename(source);
      const target = vscode.Uri.joinPath(newUriTo, filename);
      const theSameNames = same(filename, placename);
      const theSameObjects = same(source, target);
      try {
        if ((this.wasCutted && theSameNames) || theSameObjects) {
          this.internals.delete(internal);
          
          if (warnings.showEvery) {
            vscode.window.showInformationMessage(
              "Check what and where you're trying to cut/copy. " +
              "Overwrite is disabled.");
          }
          continue;
        }
        this.willHandleUris([target]);

        if (theSameNames) {
          await workspace.fsh.copy(source, target,
            { useTrash: false });
          this.refreshViewsStateFor(target); }
        else {
          if (this.wasCutted) {
            this.willHandleUris([source]);
            cacheRemoval(source.toString());

            let exist = await isValidUri(target);
            if (exist) {
              const ok = "Yes, overwrite";
              const answer = await vscode.window.showWarningMessage(
                `File/folder exists: ${getNicePath(target)}.` +
                " Do you want to overwrite it?", ok, "No"
              );
              exist = answer !== ok;
            }
            if (!exist) {
              await workspace.fs.rename(source, target,
                { overwrite: true });
            }
            this.changeItemInViews(target, source); }
          else {
            await workspace.fs.copy(source, target,
              { overwrite: false });
            this.refreshViewsStateFor(target); }
        } }
      catch(error) {
        this.internals.delete(internal);
        
        continue; }
      finally { this.didHandleUri(target); }
    }
    this.wasCutted = false;
    helper.rejectBoost();
  }

  public onRenaming(): boolean {
    let wasOn = this.wasRenaming;
    if (wasOn) { this.targeting.off(); }

    this.wasRenaming = false;

    return wasOn;
  }

  public registerEditor() {
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

  public registerCommands() {
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
            this.targeting.off();
          }
          this.wasRenaming = false;
        }
    });
    const _ctrlkey = vscode.commands.registerCommand(commands.ctrlPressed,
      async () => {
        this.ctrlPressed = true;
        await sleep(ctrlPressedTime);
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
        helper.ascertainBoost(items.length);
        await Promise.all(items.map((i) => this.deleteItem(i)));
        helper.rejectBoost();
    });
    const _deletehrd = vscode.commands.registerCommand(commands.deleteHard,
      async (item: Object) => {
        const elements = Array.isArray(item) ? item : undefined;
        const items = await this.getAllSelectedIfBad(elements);
        await Promise.all(items.map((i) => this.deleteItem(i, false, true)));
    });
    const _copy = vscode.commands.registerCommand(commands.copy,
      async (items: Object) => {
        const fileItems = await this.getAllSelectedIfBad(items);
        await this.copyItems(fileItems);
    });
    const _cut = vscode.commands.registerCommand(commands.cut,
      async (items: Object) => {
        const fileItems = await this.getAllSelectedIfBad(items);
        await this.cutItems(fileItems);
    });
    const _paste = vscode.commands.registerCommand(commands.paste,
      async (items: Object) => await this.pasteItems(items));
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
          await this.referenceProvider.provideReferencesFor(fileItem,
            cts.token);
        const position = await getPositionSafelyFrom(fileItem.resourceUri);
        await vscode.commands.executeCommand(commands.referenceBuiltin,
          fileItem.resourceUri,
          position,
          locations
        );
    });
    const _reveal = vscode.commands.registerCommand(commands.reveal,
      async (item: FileItem) => {
        const fileItem = await this.getAnySelectedIfBad(item);
        if (!fileItem?.resourceUri) { return; }
        
        try {
          await vscode.commands.executeCommand(commands.revealBuiltin,
            fileItem.resourceUri); }
          catch (error) {
            vscode.window.showInformationMessage("Can't reveal on Web"); }
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
