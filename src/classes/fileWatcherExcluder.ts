import * as vscodes from "../types/vscodes";
import { MayBeBusy } from "../types/vscodes";
import { ConfigurationTarget } from "vscode";
import { brand, ExtensionBrandResolver } from "./extensionBrandResolver";
import { ExtensionStaticService } from "./extensionStaticService";
import { basename, erase, getGlobalValue, getStaticName, inspect,
  isBusy, saveGlobalValues, sleep, stopGlobalChanges, validate
} from "./utilManager";

interface WatcherQuickPickItem extends vscode.QuickPickItem {
  action: ActionType;
  pattern?: string;
}
interface Bool<T extends { toString(): string }> extends MayBeBusy {
  key: T;
  value: boolean;
}

const empty = ''    as const;
const dot = '.'     as const;
const busyTime = 50 as const;

const defaults = {
  get file() { return "settings.json" as const; },
  get value() { return boolean3Value(); },
  get pattern() {
    return Object.fromEntries([[ExtensionStaticService.fsExclusion, true]]); }
};
const dontShow = {
  get key() { return getStaticName("showExtensionExtraWarnings"); },
  get value() { return !ExtensionStaticService.showExtensionExtraWarnings; },
  set value(value: boolean) {
    ExtensionStaticService.showExtensionExtraWarnings = !value; }
};
const actionType = {
  add: "add",
  clean: "clean",
  remove: "remove",
  change: "change",
  separator: "sep"
                   } as const;

const files          = () => brand.files.watcherExclude.split(dot)[0];
const watcherExclude = () => brand.files.watcherExclude.split(dot)[1];
const commandManage  = () => brand.manageWatcherExclude;
const commandWarning = () => brand.showWarnings;

const configuration    = () => ExtensionBrandResolver.configuration;
const boolean3Property = () => ExtensionBrandResolver.boolean3Property;
const boolean3Value    = () => ExtensionBrandResolver.boolean3DefaultValue;

const createSeparator = (): WatcherQuickPickItem => {
  return {
    label: empty,
    action: actionType.separator,
    kind: vscode.QuickPickItemKind.Separator
  };
};
const createButton = (pattern: string, positive: boolean) => {
  const newValue = String(!positive).toUpperCase();
  return {
    iconPath: new vscode.ThemeIcon(
      positive ? "notebook-state-error" : "testing-passed-icon"),
    tooltip: `Change value to ${newValue} for ${pattern}`
  };
};
const createQuickPickItems = (
  patternsTrue: string[], patternsFalse: string[]
): WatcherQuickPickItem[] => {
  const items: WatcherQuickPickItem[] = [
    {
      label: "$(diff-added) Add New Exclusion Pattern",
      action: actionType.add
    },
    {
      label: "$(close-all) Remove All Exclusion Patterns",
      action: actionType.clean
    },
    createSeparator(),
    ...patternsTrue.map((pattern) => ({
      label: `$(trash) Remove: ${pattern}`,
      action: actionType.remove,
      buttons: [createButton(pattern, true)],
      pattern
    })),
    ...patternsFalse.map((pattern) => ({
      label: `$(trash) Remove: ${pattern}`,
      action: actionType.remove,
      buttons: [createButton(pattern, false)],
      pattern
    }))
  ];
  return items;
};

type WC = vscode.WorkspaceConfiguration;
type WCE = vscode.WorkspaceFoldersChangeEvent;
type CCE = vscode.ConfigurationChangeEvent;
type Busy = (value: boolean) => void;
type RecordLike = Record<string, boolean>;
type ActionType = vscodes.EnumLike<typeof actionType>;
type WatcherQuickPickItemOr =  WatcherQuickPickItem | undefined;

export class FileWatcherExcluder implements vscodes.Disposable {
  private readonly context: vscode.ExtensionContext;
  private readonly watchers: {
    get: Map<string, Bool<vscode.Uri> >;
    one: (folder: vscode.Uri) => Bool<vscode.Uri> | undefined;
    set: (folder: vscode.Uri, value: boolean) => void;
    del: (folder: vscode.Uri) => void;
  };
  private get target() { return vscode.workspace.workspaceFile ?
    ConfigurationTarget.WorkspaceFolder
  : ConfigurationTarget.Workspace; }
  private get config() { return configuration(); }
  private get watcherConfig() { return boolean3Property(); }
  private get watcherFullConfig() {
    return `${this.config}.${this.watcherConfig}`; }
  private get workspaceFolders() {
    return vscode.workspace.workspaceFolders ?? []; }
  private get onEditor() { return this.disposable; }
  private set onEditor(value: vscode.Disposable | undefined) {
    this.disposable?.dispose();
    this.disposable = value;
  }
  private disposable: vscode.Disposable | undefined;
  
  public isDisposed: boolean | undefined;

  public didChangeWorkspaceFolders: ((event: WCE) => Promise<any>) | undefined =
    async (event: WCE) => {
      await this.syncFolders([...event.added]);
      for (const folder of event.removed) {
        this.watchers.del(folder.uri); }
    };
  
  public didChangeConfiguration: ((event: CCE) => Promise<any>) | undefined =
    async (event: CCE) => {
      if  (event.affectsConfiguration(this.watcherFullConfig)) {
        await stopGlobalChanges(this.config, this.watcherConfig);
        await this.manageWatchers(); }
    };

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.watchers = { get: new Map(),
      one: (folder: vscode.Uri) => this.watchers.get.get(folder.toString()),
      set: (folder: vscode.Uri, value: boolean) => {
        this.watchers.get.set(folder.toString(),
          { key: folder, value: value });
      },
      del: (dir: vscode.Uri) => this.watchers.get.delete(dir.toString())
    };
    this.syncFolders([...this.workspaceFolders]).then(() =>
    this.checkDontShowWarning().then(() =>
    this.checkFoldersHaveFileWatcherExclusions()));

    this.subscribe();
  }

  private async askToErase(text: string, folderUri: vscode.Uri): Promise<void> {
    if (dontShow.value === true) { return; }

    const ye = "Yes";
    const no = "No. Don't do that";
    const answer = await vscode.window.showWarningMessage(text, ye, no);
    if   (answer === ye) {
      const config = vscode.workspace.getConfiguration(files(), folderUri);
      await erase(config, watcherExclude(), this.target);
    }
  }

  private async checkFoldersHaveFileWatcherExclusions (): Promise<void> {
    if (dontShow.value === true) { return; }

    const folderUris = [...this.watchers.get.values()]
      .filter((watcher) => watcher.value)
      .map((watcher) => watcher.key);
    for (const folderUri of folderUris) {
      const config = vscode.workspace.getConfiguration(files(), folderUri);
      const have = inspect<RecordLike>(config, watcherExclude(), this.target);
      if  (!have || Object.entries(have).length <= 0) {
        const ye = "Use";
        const no = "No. Don't use";
        const ex = "Don't show again";
        const text = `${basename(folderUri)} project folder settings don't 
          contain "${brand.files.watcherExclude}" exclusion list. Just Files 
          extension uses it as extra exclusions from heavy file system 
          operation set per workspace folder. Use this list or not?`;
        const answer = await vscode.window.showWarningMessage(text, ye, no, ex);
        if (answer === ye) {
          await config.update(watcherExclude(), defaults.pattern, this.target);
        }
        else if (answer === no) {
          await vscode.workspace
            .getConfiguration(this.config, folderUri)
            .update(this.watcherConfig, false, this.target); }
        else if (answer === ex) {
          await this.setDontShowWarning();
          break;
        }
      }
    }
  }

  private async setDontShowWarning(): Promise<void> {
    const ye = "Yes, turn off";
    const answer = await vscode.window.showInformationMessage(
      `You are going to turn off some extension warnings. If you want to turn 
      them on back use "Make Just Files Warnings Showable" command 
      (${commandWarning()}). Do you want to turn them off?`, ye, "No");
    if (answer === ye) {
      dontShow.value = true;
      saveGlobalValues(this.context, [dontShow.key, dontShow.value]);
    }
  }

  private checkDontShowWarning(): Thenable<void> {
    const value = getGlobalValue(this.context, dontShow.key);
    if (typeof value === 'boolean') {
      dontShow.value = value;
    }
    return Promise.resolve();
  }

  private canUseWatcherExclusions(folder: vscode.WorkspaceFolder): boolean {
    const use = this.watchers.one(folder.uri);
    if (use === undefined) { this.watchers.set(folder.uri, defaults.value); }

    return use?.value ?? defaults.value;
  }

  private async syncFolders(folders: vscode.WorkspaceFolder[]): Promise<void> {
    if (this.target === ConfigurationTarget.WorkspaceFolder) {
      const config = vscode.workspace.getConfiguration(this.config);
      await erase(config, this.watcherConfig, ConfigurationTarget.Workspace);
    }
    for (const folder of folders) {
      const watcher = this.watchers.one(folder.uri);
      const config  = vscode.workspace.getConfiguration(this.config, folder);
      const value   = await this.manageWatcherConfig(config, isBusy(watcher));
      this.watchers.set(folder.uri, value);
    }
  }

  private async manageWatcherConfig(config: WC, busy: Busy): Promise<boolean> {
    const value = config.get<boolean>(this.watcherConfig, defaults.value);
    if (value === defaults.value) {
      busy(true);
      await erase(config, this.watcherConfig, this.target);
      await sleep(busyTime);
      busy(false);
    }
    return value;
  }

  private async manageWatchers(): Promise<void> {
    for (const [_, watcher] of this.watchers.get) {
      const wc = vscode.workspace.getConfiguration(this.config, watcher.key);
      const inspected = inspect<boolean>(wc, this.watcherConfig, this.target);
      const value = inspected ?? defaults.value;
      if (watcher.value !== value) {
        if (watcher?.busy) { break; }

        let value = await this.manageWatcherConfig(wc, isBusy(watcher));
        if (value === false) {
          await this.askToErase(`
            You select not to use exclusions for watching the file system. 
            Once you won't use it all exclusions can be erased. Erase?`,
            watcher.key);
        }
        this.watchers.set(watcher.key, value);
        break;
      }
    }
  }

  private async executeQuickPickExcludeManager(
    folder: vscode.WorkspaceFolder
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(files(), folder.uri);
    const nativeMap = { 
      ...(inspect<RecordLike>(config, watcherExclude(), this.target))
    };
    const activePatterns = Object.keys(nativeMap).filter(
      (key) => nativeMap[key] === true);
    const passivePatterns = Object.keys(nativeMap).filter(
      (key) => nativeMap[key] === false);
    const items = createQuickPickItems(activePatterns, passivePatterns);
    const picker = vscode.window.createQuickPick<WatcherQuickPickItem>();
    picker.title = `Managing Watcher Exclusions For Folder: ${folder.name}`;
    picker.items = items;

    const selection = await new Promise<WatcherQuickPickItemOr>((resolve) => {
      picker.onDidTriggerItemButton((e) => {
        e.item.action = actionType.change;
        resolve(e.item);
        picker.hide();
      });
      picker.onDidAccept(() => {
        const selected = picker.selectedItems[0];
        resolve(selected);
        picker.hide();
      });
      picker.onDidHide(() => {
        resolve(undefined);
        picker.dispose();
      });
      picker.show();
    });
    
    if (!selection) { return; }

    let wasChanged = await this.resolve(selection, nativeMap);
    if (wasChanged) {
      const property = Object.keys(nativeMap).length ? nativeMap : undefined;
      await config.update(watcherExclude(), property, this.target);
      this.executeQuickPickExcludeManager(folder);
    }
  }

  private async resolve(selected: WatcherQuickPickItem, onMap: RecordLike) {
    let changed = false;

    switch (selected.action) {
      case actionType.add:
        const newPattern = (await vscode.window.showInputBox({
          prompt: "Type a pattern string to exclude from file watching",
          ignoreFocusOut: true,
          validateInput: validate().exclude
        }))?.trim();
        changed = newPattern ? onMap[newPattern] = true : false;
        break;
      case actionType.remove: selected.pattern && (
        delete onMap[selected.pattern],
          changed = true);
        break;
      case actionType.change: selected.pattern && (
        onMap[selected.pattern] = !onMap[selected.pattern],
          changed = true);
        break;
      case actionType.clean:
        for (const key in onMap) { delete onMap[key]; }
        changed = true;
        break;
      default:
        changed = false;
        break;
    }
    return changed;
  }

  private async manageFolderSettings(
    folder: vscode.WorkspaceFolder | undefined
  ): Promise<string | undefined> {
    let  targetFolder: vscode.WorkspaceFolder | undefined = folder;
    if (!targetFolder && vscode.window.activeTextEditor) {
      targetFolder = vscode.workspace.getWorkspaceFolder(
        vscode.window.activeTextEditor.document.uri
      ); }

    if (!targetFolder && this.workspaceFolders.length > 1) {
      targetFolder = await vscode.window.showWorkspaceFolderPick({
        placeHolder: "Select the project workspace folder you want to modify"
      }); }
    else if (!targetFolder) { targetFolder = this.workspaceFolders[0]; }

    if (!targetFolder) {
      return vscode.window.showErrorMessage(
        "Could not determine a valid workspace folder context."
      ); }

    await this.executeQuickPickExcludeManager(targetFolder);
  }

  private subscribe() {
    const onGo = vscode.commands.registerCommand(commandManage(), async () => {
      this.onEditor = vscode.window.onDidChangeActiveTextEditor(async (e) => {
        this.onEditor?.dispose();

        const editor = e;
        if (editor && editor.document.fileName.endsWith(defaults.file)) {
          if (editor.document.uri.path.endsWith(`User/${defaults.file}`)) {
            return;
          }
          const text = editor.document.getText();
          const searchStr = brand.files.watcherExclude;
          const length = searchStr.length + 1;
          const index = text.indexOf(`${searchStr}`) + length;

          if (index > 0) {
            const position = editor.document.positionAt(index + 1);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), 
              vscode.TextEditorRevealType.InCenter
            ); }
          else {
            vscode.commands.executeCommand(brand.actions.find, {
              searchString: brand.files.watcherExclude });
          }

          const dir = vscode.workspace.getWorkspaceFolder(editor.document?.uri);
          if  (!dir) { await this.manageFolderSettings(dir); }
          else if (this.canUseWatcherExclusions(dir)) {
            await  this.manageFolderSettings(dir);
          }
        }
      }, this, this.context.subscriptions);

      await vscode.commands.executeCommand(brand.settings.switchToJSON);
    });
    const onWarn = vscode.commands.registerCommand(commandWarning(), () => {
      dontShow.value = false;
      saveGlobalValues(this.context, [dontShow.key, dontShow.value]);
      vscode.window.showInformationMessage("All warnings will be shown now.");
    });

    this.context.subscriptions.push(onGo, onWarn);
  }

  public dispose(): void {
    if (this.isDisposed) { return; }
    else { this.isDisposed = true; }

    this.disposable?.dispose();
  }
}
