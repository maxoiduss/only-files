declare module "vscode" {
  export interface Searchable {
    onSearch: boolean;
  }
  export interface HasDefaults {
    setDefaults(): Promise<void>;
  }
  export namespace workspace {
    export const fsh: typeof FileSystemHard;
  }
  export namespace window {
    export const registerWebviewViewProviderWithDefaults:
      typeof WindowHard.registerWebviewViewProvider;
  }
}
import * as vscode from "vscode";
import * as fpath from 'path';
import {
  CancellationTokenSource as CTS,
  TreeItem,
  WebviewViewProvider } from "vscode";
  import { LogService } from "./logService";
import { ExtensionBrandResolver } from "./extensionBrandResolver";

const number3Property = () => ExtensionBrandResolver.number3Property;
const configuration = () => ExtensionBrandResolver.configuration;
const postfix = "hard_lock" as const;
let numeric = 0;

export function initTypes() {
  (vscode.workspace as any).fsh = FileSystemHard;
  (vscode.window as any).registerWebviewViewProviderWithDefaults =
    WindowHard.registerWebviewViewProvider;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const FileSystemHard = {
  async copy(
    source: vscode.Uri,
    target: vscode.Uri,
    options?: { useTrash?: boolean | undefined; }
  ) {
    const filename = fpath.basename(target.fsPath);
    const parent = vscode.Uri.joinPath(source, '..');
    const retarget = vscode.Uri.joinPath(parent,
      `${filename}_${postfix}`
    );
    await vscode.workspace.fs.copy(source, retarget,
      { overwrite: false });
    await vscode.workspace.fs.delete(source,
      { recursive: true, useTrash: options?.useTrash });
    await vscode.workspace.fs.rename(retarget, target,
      { overwrite: true });
  }
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export const WindowHard = {
  registerWebviewViewProvider(
    viewId: string,
    provider: WebviewViewProvider & vscode.HasDefaults
  ): vscode.Disposable {
    const registered = vscode.window.registerWebviewViewProvider(viewId, provider);
    provider.setDefaults();

    return registered;
  }
};

export function getNonce() {
  let text = '';
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function getNumeric() {
  return ++numeric;
}

export function getPathASsequence(pathOr: string | vscode.Uri): string[] {
  return typeof pathOr === "string" ?
    pathOr.split(fpath.sep)
  : pathOr.fsPath.split(fpath.sep);
}

export function getSequenceASpath(path: string[]): string {
  return path.join(fpath.sep);
}

export function same(path1: string, path2: string): boolean;
export function same(uri1: vscode.Uri, uri2: vscode.Uri): boolean;
export function same(o1: vscode.Uri | string, o2: vscode.Uri | string): boolean {
  return o1 instanceof vscode.Uri && o2 instanceof vscode.Uri ?
    o1.fsPath === o2.fsPath
  : o1.toString() === o2.toString();
}

export function getString(fromUriOr: vscode.Uri | string): string {
  return typeof fromUriOr === "string" ? fromUriOr : fromUriOr.fsPath;
}

export function getUri(uriOr: vscode.Uri | string): vscode.Uri {
  return typeof uriOr === "string" ? vscode.Uri.file(uriOr) : uriOr;
}

export function getUriFrom(uriOrItem: vscode.Uri | TreeItem | any): vscode.Uri {
  return uriOrItem instanceof TreeItem ?
    (uriOrItem.resourceUri || vscode.window.activeTextEditor?.document.uri)!
  : (getUri(uriOrItem) || vscode.window.activeTextEditor?.document.uri);
}

export function hasNoName(path: string): boolean {
  return ["", "/", "\\", "\""].includes(path);
}

export function showProgressBar(withMessage: string): CTS {
  const cts = new CTS();

  vscode.window.withProgress({
    title: withMessage,
    location: vscode.ProgressLocation.Notification,
    cancellable: false
  }, async (progress, ) => {
    const dots = [".", "..", "...", "...."];
    let num: number = 0;

    return new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          num = num > dots.length - 1 ? 0 : num + 1;
          progress.report({ message: dots[num], increment: 1 });
        }, 1000);

        const stop = () => {
          clearInterval(interval);
          try { cts.dispose(); } catch {}
          resolve();
        };
        const ctstoken = cts.token.onCancellationRequested(() => {
          ctstoken.dispose();
          stop();
        });
    });
  });

  return cts;
}

export function showQuickInput
(withText: string, option: string, stop?: Promise<void>): Promise<string> {
  const empty = '';
  const config = vscode.workspace.getConfiguration(configuration());
  let pick: vscode.QuickPick<vscode.QuickPickItem>;

  const run = new Promise<string>((resolve) => {
    pick = vscode.window.createQuickPick<vscode.QuickPickItem>();
    pick.placeholder = pick.title = withText;
    pick.items = [];
    pick.value = option;
    pick.ignoreFocusOut = true;
    pick.matchOnDetail = false;
    let secondsRemaining = stop ? 0 : config.get<number>(number3Property(), 4);
    let isResolved = false;

    const okButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon("check"),
      tooltip: "Ok"
    };
    const cancelButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon("close"),
      tooltip: "Cancel"
    };
    pick.buttons = [okButton, cancelButton];

    const runAccept = async (value: string) =>
    {
      if (isResolved) { return; }
      isResolved = true;

      clearInterval(timer);

      pick.busy = true;
      pick.enabled = false as any;
      try {
        pick.hide();
        resolve(value);
      } catch(error) {
        resolve(empty);
      } finally {
        pick.busy = false;
      }
    };
    const timer = secondsRemaining > 0 ?
      setInterval(() => {
        secondsRemaining--;
        if (secondsRemaining > 0) {
          pick.placeholder = pick.title = `${withText} (${secondsRemaining})`;
        } else {
          runAccept(pick.value);
        }
      }, 1000) : undefined;
    const clearTimer = (time: NodeJS.Timeout | undefined, value?: any) => {
      if (value && value !== option) { timer ? clearInterval(timer) : {}; }
    };
    pick.onDidChangeValue((value) => clearTimer(timer, value));
    pick.onDidAccept(() => { void runAccept(pick.value); });
    pick.onDidTriggerButton((button) => {
      if (button === okButton) { void runAccept(pick.value); }
      else if (button === cancelButton) { void runAccept(empty); }
    });
    pick.onDidHide(() => {
      clearInterval(timer);
      pick.dispose();
      if (!isResolved) { resolve(empty); }
    });
    pick.show();
  });
  const promises: Promise<string>[] = stop ?
    [stop.then(() => {
      pick.hide();
      return empty;
    }), run] : [run];

  return Promise.race(promises);
}

export async function setNothingToExcludeTemporary(): Promise<() => Promise<void>>
{
  async function updateConfig(target: vscode.ConfigurationTarget, empty?: boolean)
  {
    try {
      if (previous[target]) {
        await config.update(exclude, empty ? {} : previous[target], target);
      }
    } catch (error) {
      LogService.error(`Failed to update files.${exclude} for ${target}: ${error}`);
    }
  }
  if (!useUnexcludeSystemConfig) { return async () => {}; }

  const exclude = "exclude";
  const config = vscode.workspace.getConfiguration("files", null);
  const values = config.inspect<Record<string, boolean>>(exclude);
  const previous:
    Record<vscode.ConfigurationTarget, Record<string, boolean> | undefined> = {
      [vscode.ConfigurationTarget.Global]: values?.globalValue,
      [vscode.ConfigurationTarget.Workspace]: values?.workspaceValue,
      [vscode.ConfigurationTarget.WorkspaceFolder]: values?.workspaceFolderValue
  };
  await updateConfig(vscode.ConfigurationTarget.WorkspaceFolder, true);
  await updateConfig(vscode.ConfigurationTarget.Workspace, true);
  await updateConfig(vscode.ConfigurationTarget.Global, true);

  return async () => {
    await updateConfig(vscode.ConfigurationTarget.WorkspaceFolder);
    await updateConfig(vscode.ConfigurationTarget.Workspace);
    await updateConfig(vscode.ConfigurationTarget.Global);
  };
}

export function isInFolder(path: string, folder: string): boolean {
  if (path === folder) { return true; }
  
  const filePath = fpath.resolve(path);
  const folderPath = fpath.resolve(folder);
  const parent = fpath.dirname(filePath);
  return parent === folderPath;
}

export async function isFile(uri: vscode.Uri): Promise<boolean | undefined> {
  const file = vscode.FileType.File;
  try { return ((await vscode.workspace.fs.stat(uri)).type & file) === file; }
  catch(error) { return undefined; }
}

export async function isFolder(uri: vscode.Uri): Promise<boolean | undefined> {
  const dir = vscode.FileType.Directory;
  try { return ((await vscode.workspace.fs.stat(uri)).type & dir) === dir; }
  catch(error) { return undefined; }
}

export async function isValidUri(
  uriOr: vscode.Uri | string | undefined
): Promise<boolean> {
  if (uriOr === undefined) { return false; }

  return (await isFolder(getUri(uriOr))) !== undefined;
}

export const largeProjectFilesAmount: number = 5555;
export const useUnexcludeSystemConfig = true;

export async function isProjectTooLarge(foldersMax: number = 1111):
  Promise<boolean> {
  const folders = await getAllFolders(foldersMax);
  return folders === null || folders.length > foldersMax;
}

export async function getAllFolders(max?: number): Promise<vscode.Uri[] | null> {
  const folders = new Set<string>();
  const roots = vscode.workspace.workspaceFolders?.map(f => f.uri);
  if (!roots) { return []; }
  
  const restoreSetting = await setNothingToExcludeTemporary();

  for (const root of roots) {
    const files = await vscode.workspace.findFiles('**', null, 55555);
    if (max && files.length > largeProjectFilesAmount) {
      await restoreSetting(); return null;
    }

    for (const file of files) {
      const relative = fpath.relative(root.fsPath, file.fsPath);
      const directory = fpath.dirname(relative);
      const parts = directory.split(fpath.sep).filter(Boolean);

      for (let i = 0; i < parts.length; i++) {
        const folderPath = fpath.join(root.fsPath, ...parts.slice(0, i + 1));
        if (folderPath !== root.fsPath) {
          folders.add(folderPath); }
        if (max && folders.size > max) {
          await restoreSetting(); return null; }
      }
    }
  }
  await restoreSetting();

  return [...folders].map(path => vscode.Uri.file(path));
}

export function getConfigurationFor<T>(
  ctx: vscode.ExtensionContext, key: string
): T | undefined {
  return ctx.workspaceState.get<T>(key);
}

export function getConfigurationsFor<T>(
  ctx: vscode.ExtensionContext, key: string
): [string, T][] {
  const as = <R>(target: any): R => target as unknown as R;
  const raw = ctx.workspaceState.get<any>(key);

  if (Array.isArray(raw)) {
    return as<[string, any][]>(raw.flatMap(
      (record) => typeof record === "string" ? [[record, as<T>(undefined)]] : []
    ));
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw) as [string, T][];
  }

  return [];
}
