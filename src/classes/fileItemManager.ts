import * as vscode from "vscode";
import * as fs from "fs";
import { CancellationTokenSource as CTS } from "vscode";
import { EmptyFolderItem, FileItem } from "./fileItem";
import fpath = require("path");

export function getString(fromUriOr: vscode.Uri | string): string {
  return typeof fromUriOr === "string" ? fromUriOr : fromUriOr.fsPath;
}

export function getUri(uriOr: vscode.Uri | string): vscode.Uri {
  return typeof uriOr === "string" ? vscode.Uri.file(uriOr) : uriOr;
}

export function getUriFrom(uriOrItem: vscode.Uri | FileItem): vscode.Uri {
  return uriOrItem instanceof FileItem ? uriOrItem.resourceUri! : uriOrItem;
}

export function showProgressBar(withMessage: string): CTS {
  const cts = new CTS();

  vscode.window.withProgress({
    title: withMessage,
    location: vscode.ProgressLocation.Notification,
    cancellable: false
  }, async (progress, _) => {
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
    pick.buttons = [okButton];

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

export class FileItemManager {
  private tryValidatePath(path: string, scheme = "/"): string {
    const validPath = path.replace(/\\+/g, "/");
    return validPath.startsWith(scheme) ? validPath : `${scheme}${validPath}`;
  }
  
  getParentPath(fileItem: FileItem): string | undefined {
    if (fileItem.resourceUri) {
      const filePath = fileItem.resourceUri.fsPath;
      const parentPath = fpath.dirname(filePath);
      return parentPath;
    }

    return undefined;
  }

  findRootFolder (
    forPath: string,
    inItems: FileItem[]): FileItem | undefined {
    return inItems.find(it => {
      if (it.resourceUri && !(it instanceof EmptyFolderItem)) {
        return forPath.startsWith(it.resourceUri.fsPath);
      }
    });
  }

  isValidUri(uriOr: vscode.Uri | string | undefined): boolean {
    if (uriOr === undefined) {
      return false;
    }
    const uri = getUri(uriOr);
    const filePath = uri.fsPath;

    return fs.existsSync(filePath);
  }

  createFileItem(
    uriOr: vscode.Uri | string,
    plainMode?: boolean,
    expanded?: boolean
  ): FileItem {
    const uri = getUri(uriOr);

    if (this.isValidUri(uri)) {
      const label = plainMode ? uri.fsPath : fpath.basename(uri.fsPath);
      const isFile = fs.statSync(uri.fsPath).isFile();
      const collapsibleState = isFile ?
        vscode.TreeItemCollapsibleState.None
      : expanded ?
        vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed;

      return this.getNewFileItem(
        plainMode ? undefined : uri,
        label, collapsibleState, isFile
      );
    }
    
    const newFileItem = this.getNewFileItem(
      plainMode ? undefined : uri,
      plainMode ? uri.fsPath : fpath.basename(uri.fsPath),
      vscode.TreeItemCollapsibleState.None,
      true
    );
    newFileItem.description = "File not found";
    newFileItem.tooltip = `'${uri.fsPath}' was not found, 
      click on Refresh icon for remove all invalid files from Just Files`;

    return newFileItem;
  }

  getNewFileItem(
    uri: vscode.Uri | undefined,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    isFile: boolean
  ): FileItem {
    return uri ?
      new FileItem(label, collapsibleState, isFile, uri)
    : new FileItem(label, collapsibleState, isFile);
  }

  getConfigurationFor<T>(context: vscode.ExtensionContext,
    key: string): [string, T][] {
    const config = context.workspaceState.get<Record<string, T>>(key) || {};
    return Object.entries(config);
  }

  getPathConfiguration(context: vscode.ExtensionContext,
    key: string): string[] {
    const pathConfig: string = context.workspaceState.get(key) || "[]";
    return JSON.parse(pathConfig);
  }

  fileItemsFromPaths(paths: string[]): FileItem[] {
    return paths.map((path) => this.createFileItem(path));
  }

  getPathArray(fileItems: FileItem[]): string[] {
    const paths: string[] = fileItems
      .map((fileItem) => fileItem.resourceUri?.fsPath)
      .filter((fsPath): fsPath is string => fsPath !== undefined);

    return paths;
  }

  getSiblings(fileItem: FileItem): FileItem[] {
    const directoryPath = this.getParentPath(fileItem);
    if (!directoryPath) {
      return [];
    }
    const items: string[] = fs
      .readdirSync(directoryPath, { withFileTypes: true })
      .map((entry: fs.Dirent) => fpath.join(directoryPath, entry.name));

    const indexFileItem = items.findIndex(
      (item) => item === fileItem.resourceUri?.fsPath
    );
    if (indexFileItem > -1) {
      items.splice(indexFileItem, 1);
    }

    return items.map((path) => this.createFileItem(path));
  }

  getParentInArray(
    fileItem: FileItem,
    parentFileItems: FileItem[]
  ): FileItem | undefined {
    const resp = parentFileItems.filter((item) =>
      this.isChildOf(fileItem, item)
    );
    if (resp && resp.length > 0) {
      return resp[0];
    }
    return undefined;
  }

  getDirectoriesUntilParent(
    childPath: string,
    parentPath: string
  ): string[] {
    const relativePath = fpath.relative(parentPath, childPath);
    const segments = relativePath.split(fpath.sep);

    const directories: string[] = [];
    let currentPath = parentPath;
    for (const segment of segments) {
      currentPath = fpath.join(currentPath, segment);
      directories.unshift(currentPath);
    }

    return directories;
  }

  isFileItemInArray(fileItem: FileItem, array: FileItem[]): boolean {
    return array.some(item => item.like(fileItem));
  }

  isChildOf(
    childFileItem: FileItem,
    parentFileItem: FileItem
  ): boolean {
    const childFileItemPath = childFileItem.resourceUri?.fsPath || "";
    const parentFileItemPath = parentFileItem.resourceUri?.fsPath || "";

    if (childFileItemPath === parentFileItemPath) {
      return false;
    }

    const relativePath = fpath.relative(parentFileItemPath, childFileItemPath);

    return !relativePath.startsWith("..") && !fpath.isAbsolute(relativePath);
  }

  isChildOfArray(
    childFileItem: FileItem,
    parentFileItems: FileItem[]
  ): boolean {
    return parentFileItems.some((item) => this.isChildOf(childFileItem, item));
  }

  isParentOfArray(
    parentFileItem: FileItem,
    childrenFileItems: FileItem[]
  ): boolean {
    return childrenFileItems.some((item) =>
      this.isChildOf(item, parentFileItem)
    );
  }

  findThen(
    item: FileItem | string,
    inArray: FileItem[],
    then: (found: number) => any): boolean
  {
    const foundIndex = inArray.findIndex(it => it.like(item));
    if (foundIndex >= 0) {
      then(foundIndex);
      return true;
    }
    return false;
  }

  async findAnyThen(
    items: (FileItem | string)[],
    inArray: FileItem[],
    then: (foundElem: number, foundItem: number) => Promise<any>): Promise<boolean>
  {
    let foundPosition: number = -1;
    const foundIndex = inArray.findIndex(it => items.some((el, i) => {
      if (it.like(el)) {
        foundPosition = i;
        return true;
      }
      return false;
    }));
    if (foundIndex >= 0 && foundPosition >= 0) {
      await then(foundIndex, foundPosition);
      return true;
    }
    return false;
  }

  remove(item: FileItem, array: FileItem[], then?: () => any): void;
  remove(item: FileItem, map: Map<string, Object>, then?: () => any): void;
  remove(item: FileItem, collection: FileItem[] | Map<string, Object>,
    then?: () => any)
  {
    if (Array.isArray(collection)) {
      this.findThen(item, collection, (rm) => {
        collection.splice(rm, 1);
        then?.();
      });
    } else
    if (collection instanceof Map && item.resourceUri) {
      if (collection.delete(item.resourceUri.fsPath)) {
        then?.();
      }
    }
  }

  sortItems(items: FileItem[]) {
    return items.sort((a, b) => {
      const labelA = a.resourceUri?.fsPath.toLocaleLowerCase();
      const labelB = b.resourceUri?.fsPath.toLocaleLowerCase();
      const aHasSep = (typeof a.label === "string") && /[\/\\]/.test(a.label);
      const bHasSep = (typeof b.label === "string") && /[\/\\]/.test(b.label);
      
      if (labelA && labelB) {
        if (a.isFile && !b.isFile) {
          return 1;
        } else if (!a.isFile && b.isFile) {
          return -1;
        }

        if (!aHasSep && bHasSep) {
          return 1;
        } else if (aHasSep && !bHasSep) {
          return -1;
        }
        return labelA.localeCompare(labelB);
      }

      return 0;
    });
  }
}
