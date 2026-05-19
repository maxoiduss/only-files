import { HasDefaults } from "../types";
import { ExtensionBrandResolver
} from "./extensionBrandResolver";
import { CancellationTokenSource as CTS,
  TreeItem, WebviewViewProvider
} from "vscode";
import { LogService as Log
} from "./logService";

const configuration = () => ExtensionBrandResolver.configuration;
const number3Property = () => ExtensionBrandResolver.number3Property;

const normalize = true as const;
const postfix = "hard_lock" as const;
const slashes = /\\/g;
const scheme = '://' as const;
const empty = '' as const;
const dot = '.' as const;

let numeric = 0;

export let autodebug: boolean[] = [];

export const workspace = {
  fsh: {
    async copy(
      source: vscode.Uri,
      target: vscode.Uri,
      options?: { useTrash?: boolean | undefined; }
    ): Promise<void> {
      const filename = basename(target);
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
  },
  fs: {
    copy(
      source: vscode.Uri,
      target: vscode.Uri,
      options?: { overwrite?: boolean; }
    ): Thenable<void> {
      return vscode.workspace.fs.copy(source, target, options);
    }
  }
};

export const window = {
  registerWebviewViewProvider(
    viewId: string,
    provider: WebviewViewProvider & HasDefaults
  ): vscode.Disposable {
    const registered = vscode.window.registerWebviewViewProvider(
      viewId, provider
    );
    provider.setDefaults();

    return registered;
  }
};

export const asRelative = (
  uriOr: vscode.Uri | undefined,
  rootMask?: string
): string => {
  if (!uriOr) { return dot; }

  const folder = vscode.workspace.getWorkspaceFolder(uriOr);
  if (folder) {
    if (same(folder.uri, uriOr)) {
      return rootMask !== undefined ? rootMask : folder.name;
    }
    return vscode.workspace.asRelativePath(uriOr);
  }

  return getNicePath(uriOr);
};

export const basename = (pathOrUri: string | vscode.Uri): string => {
  const separator = '/';
  const pathOr = typeof pathOrUri === 'string' ? pathOrUri : pathOrUri.path;
  const pathe = normalize && typeof pathOrUri === 'string' ?
    pathOr.replace(slashes, separator) : pathOr;
  const trimmedPath = pathe.length > 1 && pathe.endsWith(separator) ?
    pathe.replace(/\/+$/, '') : pathe;
  const lastIndex = trimmedPath.lastIndexOf(separator);

  return lastIndex === -1 ? trimmedPath : trimmedPath.substring(lastIndex + 1);
};

export const extname = (pathOrUri: string | vscode.Uri): string => {
  const separator = '/';
  const pathOr = typeof pathOrUri === 'string' ? pathOrUri : pathOrUri.path;
  const pathe = normalize && typeof pathOrUri === 'string' ?
    pathOr.replace(slashes, separator) : pathOr;
  const trimmedPath = pathe.length > 1 && pathe.endsWith(separator) ?
    pathe.replace(/\/+$/, empty) : pathe;
  const base = trimmedPath.substring(trimmedPath.lastIndexOf(separator) + 1);
  const lastDot = base.lastIndexOf(dot);
  if (lastDot <= 0) {
    return empty;
  }
  return base.substring(lastDot + 1);
};

export const getNonce = () => {
  let text = empty;
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

export const getNumeric = (): number => {
  return numeric < Number.MAX_SAFE_INTEGER - 1 ? ++numeric : (numeric = 1);
};

export const getTopRootOf = (path: string): string => {
  const separator = '/';
  const driveMatch = path.match(/^[a-zA-Z]:[\\/]/);
  if (driveMatch) {
    return driveMatch[0].replace(slashes, separator);
  }
  if (path.startsWith(separator)) { return separator; }

  return separator;
};

export const getNicePath = (fromUriOr: vscode.Uri | string): string => {
  const uri = typeof fromUriOr === "string" ? getUri(fromUriOr) : fromUriOr;

  return uri.scheme === 'file' ? uri.fsPath : uri.path;
};

export const getUri = (fromUriOr: vscode.Uri | string): vscode.Uri => {
  const separator = '/';
  const uri = typeof fromUriOr === "string" ?
    fromUriOr.includes(scheme) ?
      vscode.Uri.parse(fromUriOr)
    : vscode.Uri.file(
        normalize ? fromUriOr.replace(slashes, separator) : fromUriOr
      )
  : fromUriOr;

  if (uri instanceof vscode.Uri) { return uri; }

  const raw = uri as any;
  if (raw && typeof raw === 'object' && 'external' in raw) {
    return vscode.Uri.parse(raw.external);
  }
  
  return vscode.Uri.parse(raw.toString());
};

export const getUriFrom = (
  uriOrItem: vscode.Uri | TreeItem | any
): vscode.Uri => {
  return uriOrItem instanceof TreeItem ?
    (uriOrItem.resourceUri || vscode.window.activeTextEditor?.document.uri)!
  : typeof uriOrItem === "string" || uriOrItem instanceof vscode.Uri ?
      getUri(uriOrItem)
    : vscode.window.activeTextEditor?.document.uri || vscode.Uri.file(empty);
};

export const getFolder = async(uri: vscode.Uri): Promise<vscode.Uri> => {
  return await isFolder(uri) ? uri : vscode.Uri.joinPath(uri, '..');
};

export const getFoldersBy = (
  pathOrUri: string | vscode.Uri,
  actionOnStep?: (stepUri: vscode.Uri, isLast: boolean) => void
) : string[] | undefined => {
  const uri = getUri(pathOrUri);
  const base = vscode.workspace.getWorkspaceFolder(uri);
  if (!base) { return undefined; }

  const separator = '/';
  const itemUriStrings: string[] = [];
  const relativePath = vscode.workspace.asRelativePath(uri, false);
  const segments = relativePath.split(separator).filter((s) => s.length > 0);
  let currentUri = base.uri;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const isLast = i === segments.length - 1;
    currentUri = vscode.Uri.joinPath(currentUri, segment);
    
    const uriString = currentUri.toString();
    itemUriStrings.push(uriString);

    actionOnStep?.(currentUri, isLast);
  }

  return itemUriStrings;
};

export const getPathDepth = (path: string): number => {
  let count = 0;
  const separator = '/';
  const pathe = path;

  for (const char of pathe) {
    if (char === separator) { ++count; }
  }
  return count;
};

export const getWorkspaceFolderIndex = (uri: vscode.Uri): number => {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) { return -1; }

  return vscode.workspace.workspaceFolders?.indexOf(folder) ?? -1;
};

export const getProjectName = (): string | undefined => {
  return vscode.workspace.name ?? vscode.workspace.workspaceFolders?.[0]?.name;
};

export const getConfigurationFor = <T>(
  ctx: vscode.ExtensionContext, key: string
): T | undefined => {
  return ctx.workspaceState.get<T>(key);
};

export const getConfigurationsFor = <T>(
  ctx: vscode.ExtensionContext, key: string
): [string, T][] => {
  const as = <R>(target: any): R => known(target).as<R>();
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
};

export const known = (object: any) => {
  return { as: <T>() => object as unknown as T };
};

export const resolveUri = async (
  relativePathOrUri: vscode.Uri | string
): Promise<vscode.Uri> => {
  const separator = '/';
  const folders = vscode.workspace.workspaceFolders ?? [];
  const isMultiRoot = folders.length > 1;
  const pathe = typeof relativePathOrUri === 'string' ?
    relativePathOrUri
  : vscode.workspace.asRelativePath(relativePathOrUri, isMultiRoot);

  if (isMultiRoot) {
    const segments = pathe.split(separator);
    const folderName = segments[0];
    const relativePart = segments.slice(1).join(separator);
    const targetFolder = folders.find((f) => same(f.name, folderName));

    if (targetFolder) {
      const potentialUri = vscode.Uri.joinPath(targetFolder.uri, relativePart);
      if (await isValidUri(potentialUri)) {
        return potentialUri;
      }
    }
  }

  for (const folder of folders) {
    const potentialUri = vscode.Uri.joinPath(folder.uri, pathe);
    if (await isValidUri(potentialUri)) {
      return potentialUri;
    }
  }

  return getUri(relativePathOrUri);
};

export const same = <
  T1 extends string | vscode.Uri,
  T2 extends string | vscode.Uri
  >(o1: T1, o2: T2): boolean =>
{ return o1.toString() === o2.toString(); };

export const hasNoName = (path: string): boolean => {
  return ["", "/", "\\", "\""].includes(path);
};

export const isFile = async (
  uri: vscode.Uri
): Promise<boolean | undefined> => {
  const file = vscode.FileType.File;
  try { return ((await vscode.workspace.fs.stat(uri)).type & file) === file; }
  catch(error) { return undefined; }
};

export const isFolder = async (
  uri: vscode.Uri
): Promise<boolean | undefined> => {
  const dir = vscode.FileType.Directory;
  try { return ((await vscode.workspace.fs.stat(uri)).type & dir) === dir; }
  catch(error) { return undefined; }
};

export const isValidUri = async (
  uriOr: vscode.Uri | undefined
): Promise<boolean> => {
  if (uriOr === undefined) { return false; }

  return (await isFolder(uriOr)) !== undefined;
};

export const isProjectTooLarge = async (
  folderOrIndex: number = 0,
  foldersMax: number = 1111
): Promise<boolean> => {
  const folderIndex = typeof folderOrIndex === "number" ?
    folderOrIndex : getWorkspaceFolderIndex(getUriFrom(folderOrIndex));
  const folders = await retrieveAllFolders(folderIndex, { max: foldersMax });
  return folders === null || folders.length > foldersMax;
};

export const largeProjectFilesAmount: number = 5555;
export const useUnexcludeSystemConfig = true;

export const setNothingToExcludeTemporary = async (
): Promise<() => Promise<void>> =>
{ const updateConfig = async (
    target: vscode.ConfigurationTarget, empty?: boolean) =>
  {
    try {
      if (previous[target]) {
        await config.update(exclude, empty ? {} : previous[target], target);
      }
    } catch (error) {
      Log.error(`Failed to update files.${exclude} for ${target}: ${error}`);
    }
  };
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
};

export const retrieveAllFolders = async (
  workspaceFolderIndex?: number,
  options?: { max?: number }
): Promise<vscode.Uri[] | null> => {
  const separator = '/';
  const folders = new Set<vscode.Uri>();
  let roots = vscode.workspace.workspaceFolders?.map((f) => f.uri);
  if (!roots) { return []; }

  if (workspaceFolderIndex !== undefined) {
    const specificRoot = roots[workspaceFolderIndex];
    if (!specificRoot) { return []; }

    roots = [specificRoot];
  }
  const restoreSetting = await setNothingToExcludeTemporary();

  for (const root of roots) {
    const pattern = new vscode.RelativePattern(root, '**');
    const files = await vscode.workspace.findFiles(pattern, null, 55555);
    if (options?.max && files.length > largeProjectFilesAmount) {
      await restoreSetting(); return null;
    }

    for (const file of files) {
      const relativeStr = file.path.slice(root.path.length);
      const parts = relativeStr.split(separator).filter(Boolean);
      parts.pop(); 

      let currentUri = root;
      for (const part of parts) {
        currentUri = vscode.Uri.joinPath(currentUri, part);
        folders.add(currentUri);

        if (options?.max && folders.size > options?.max) {
          await restoreSetting();
          return null;
        }
      }
    }
  }
  await restoreSetting();

  return [...folders];
};

export const showProgressBar = (withMessage: string): CTS => {
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
          try { cts.dispose(); } catch { }
          resolve();
        };
        const ctstoken = cts.token.onCancellationRequested(() => {
          ctstoken.dispose();
          stop();
        });
    });
  });

  return cts;
};

export const showQuickInput = (
  withText: string,
  option: string,
  stop?: Promise<void>
): Promise<string> => {
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
};
