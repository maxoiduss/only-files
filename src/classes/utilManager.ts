declare module "vscode" {
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
import {
  CancellationTokenSource as CTS,
  TreeItem,
  WebviewViewProvider } from "vscode";
import fpath = require("path");

const postfix = "hard_lock";

export const rootDir = fpath.resolve(__dirname, "..");

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

export function getUriFrom(uriOrItem: vscode.Uri | TreeItem): vscode.Uri {
  return uriOrItem instanceof TreeItem ? uriOrItem.resourceUri! : uriOrItem;
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

export function showQuickInput(withText: string, option: string): Promise<string> {
  return new Promise((resolve) => {
    const pick = vscode.window.createQuickPick<vscode.QuickPickItem>();
    pick.placeholder = pick.title = withText;
    pick.items = [];
    pick.value = option;
    pick.ignoreFocusOut = true;
    pick.matchOnDetail = false;
    let secondsRemaining = 4;
    let isResolved = false;

    const okButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon('check'),
      tooltip: 'Ok'
    };
    const cancelButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon('close'),
      tooltip: 'Cancel'
    };
    pick.buttons = [okButton, cancelButton];

    const runAccept = async (value: string) => {
      if (isResolved) { return; }
      isResolved = true;

      clearInterval(timer);

      pick.busy = true;
      pick.enabled = false as any;
      try {
        pick.hide();
        resolve(value);
      } catch {
        resolve("");
      } finally {
        pick.busy = false;
      }
    };
    const timer = setInterval(() => {
      secondsRemaining--;
      if (secondsRemaining > 0) {
        pick.placeholder = pick.title = `${withText} (${secondsRemaining})`;
      } else {
        runAccept(pick.value);
      }
    }, 1000);

    pick.onDidAccept(() => { void runAccept(pick.value); });
    pick.onDidTriggerButton((button) => {
      if (button === okButton) { void runAccept(pick.value); }
      else if (button === cancelButton) { void runAccept(""); }
    });
    pick.onDidHide(() => {
      clearInterval(timer);
      pick.dispose();
      if (!isResolved) { resolve("."); } 
    });
    pick.show();
  });
}

export async function setNothingToExcludeTemporary(): Promise<() => Promise<void>> {
  async function updateConfig(target: vscode.ConfigurationTarget, empty?: boolean)
  {
    try {
      if (previous[target]) {
        await config.update(exclude, empty ? {} : previous[target], target);
      }
    } catch (error) {
      console.error(`Failed to update files.${exclude} for ${target}: ${error}`);
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
