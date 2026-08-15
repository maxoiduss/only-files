import * as vscodes from "../types/vscodes";
import { MayBeBusy } from "../types/vscodes";
import { ExtensionBrandResolver } from "./extensionBrandResolver";
import { ExtensionStaticService } from "./extensionStaticService";
import { CancellationTokenSource as CTS } from "vscode";
import { LogService as Log, LogService } from "./logService";

const normalize = true as const;
const dot = '.'        as const;
const empty = ''       as const;
const scheme = '://'   as const;
const slashes = /\\/g;

const configuration = () => ExtensionBrandResolver.configuration;
const countdown     = () => ExtensionBrandResolver.number3Property;

let numeric: number  = 0;

export const delimeters = /[;\r\n]+/;

export let autodebug: boolean[] = [];

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
    pathe.replace(/\/+$/, empty) : pathe;
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
  const uri = typeof fromUriOr === 'string' ? getUri(fromUriOr) : fromUriOr;

  return uri.scheme === 'file' ? uri.fsPath : uri.path;
};

export const getUri = (fromUriOr: vscode.Uri | string): vscode.Uri => {
  const separator = '/';
  const uri = typeof fromUriOr === 'string' ?
    fromUriOr.includes(scheme) ?
      vscode.Uri.parse(fromUriOr)
    : vscode.Uri.file(
        normalize ? fromUriOr.replace(slashes, separator) : fromUriOr
      )
  : fromUriOr;

  if (uri instanceof vscode.Uri) { return uri; }

  const raw = uri as unknown;
  if (raw && typeof raw === 'object' && 'external' in raw) {
    if (typeof raw.external === 'string') {
      return vscode.Uri.parse(raw.external); }
  }
  return vscode.Uri.parse(known(raw).as<{ toString(): string }>().toString());
};

export const getUriFrom = (
  uriOrItem: vscode.Uri | vscode.TreeItem | unknown
): vscode.Uri => {
  return uriOrItem instanceof vscode.TreeItem ?
    (uriOrItem.resourceUri || vscode.window.activeTextEditor?.document.uri)!
  : typeof uriOrItem === 'string' || uriOrItem instanceof vscode.Uri ?
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
  if  (!folder) { return -1; }

  return vscode.workspace.workspaceFolders?.indexOf(folder) ?? -1;
};

export const getProjectName = (): string | undefined => {
  let n = vscode.workspace.name ?? vscode.workspace.workspaceFolders?.[0]?.name;
  let name = n?.replace(/\{.*?\}|\[.*?\]|\(.*?\)/g, '');

  return name ?? "none";
};

export const getConfigurationFor = <T>(
  context: vscode.ExtensionContext,
  key: string
): T | undefined => {
  return context.workspaceState.get<T>(key);
};

export const getConfigurationsFor = <T>(
  context: vscode.ExtensionContext,
  key: string
): [string, T][] => {
  const as = <R>(target: unknown): R => known(target).as<R>();
  const raw = context.workspaceState.get<unknown>(key);

  if (Array.isArray(raw)) {
    return as<[string, any][]>(raw.flatMap(
      (record) => typeof record === 'string' ? [[record, as<T>(undefined)]] : []
    ));
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw) as [string, T][];
  }
  return [];
};

export const getKeyByValue = <
  TObj extends Record<string, unknown>,
  TVal extends TObj[keyof TObj]
>(obj: TObj, value: TVal): keyof TObj | undefined =>
{ return Object.keys(obj).find(
    (key) => obj[key as keyof TObj] === value
  ) as keyof TObj | undefined;
};

export const getStaticName = (v: keyof typeof ExtensionStaticService): string =>
{
  return v as string;
};

export const hasNoName = (path: string): boolean => {
  return ["", "/", "\\", "\""].includes(path);
};

export const known = (object: unknown) => {
  return { as: <T>() => object as unknown as T };
};

export const erase = async (
  config: vscode.WorkspaceConfiguration,
  section: string,
  onTarget: vscode.ConfigurationTarget
): Promise<void> => {
  try { await config.update(section, undefined, onTarget); }
  catch (error) { LogService.error(error); }
};

export const inspect = <T>(
  configuration: vscode.WorkspaceConfiguration,
  section: string,
  onTarget: vscode.ConfigurationTarget
): T | undefined => {
  const inspection = configuration.inspect<T>(section);
  switch (onTarget) {
    case vscode.ConfigurationTarget.WorkspaceFolder:
      return inspection?.workspaceFolderValue;
    case vscode.ConfigurationTarget.Workspace:
      return inspection?.workspaceValue;
    case vscode.ConfigurationTarget.Global:
      return inspection?.globalValue;
    default:
      return inspection?.defaultValue;
  }
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
>(o1: T1, o2: T2): boolean => {
  return o1.toString() === o2.toString();
};

export const stopGlobalChanges = async (
  configurtion: string,
  section: string
): Promise<void> => {
  const config = vscode.workspace.getConfiguration(configurtion);
  const inspection = config.inspect<boolean>(section);
  if (inspection?.globalValue !== undefined) {
    await erase(config, section, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(
      `This setting has no effect in Global User settings. 
      Apply this configuration exclusively under the Workspace or Folder tabs.`
    );
  }
};

export const saveGlobalValues = (
  context: vscode.ExtensionContext, 
  ...keyValues: [string, unknown][]) => { 
  Promise.all(keyValues.map(([k, v]) => context.globalState.update(k, v)));
};

export const getGlobalValue = (context: vscode.ExtensionContext, key: string) =>
{
  return context.globalState.get(key); 
};

export const setBusy = (watcherOr: MayBeBusy | undefined, value: boolean) => {
  if (watcherOr) { watcherOr.busy = value; }
};

export const isBusy = (obj: MayBeBusy | undefined) => {
  return (value: boolean) => setBusy(obj, value);
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
  try {
    return ((await vscode.workspace.fs.stat(uri)).type & dir) === dir; }
  catch(error) {
    return undefined; }
};

export const isValidUri = async (
  uriOr: vscode.Uri | undefined
): Promise<boolean> => {
  if (uriOr === undefined) {
    return false; }

  return (await isFolder(uriOr)) !== undefined;
};

export const isProjectTooLarge = async (
  folderOrIndex: number = 0,
  foldersMax: number = 1111
): Promise<boolean> => {
  const folderIndex = typeof folderOrIndex === 'number' ?
    folderOrIndex
  : getWorkspaceFolderIndex(getUriFrom(folderOrIndex));
  const folders = await retrieveAllFolders(folderIndex, { max: foldersMax });

  return folders === null || folders.length > foldersMax;
};

export const largeProjectFilesAmount: number = 5555;
export const useUnexcludeSystemConfig = true;

export const setNothingToExcludeTemporary = async (
): Promise<() => Promise<void> > => {
  const updateConfig = async (
    onTarget: vscode.ConfigurationTarget, empty?: boolean) =>
  {
    try {
      if (previous[onTarget]) {
        await config.update(exclude, empty ? {} : previous[onTarget], onTarget);
      }
    } catch (error) {
      Log.error(`Failed to update files.${exclude} for ${onTarget}: ${error}`);
    }
  };
  if (!useUnexcludeSystemConfig) {
    return async () => {}; }

  const exclude = "exclude";
  const config = vscode.workspace.getConfiguration("files", null);
  const values = config.inspect< Record<string, boolean> >(exclude);
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
  optionText: string | vscodes.Warning,
  stop?: Promise<void>
): Promise<string> => {
  const valid  = typeof optionText === 'object';
  const option = valid ? optionText.value : optionText;
  const config = vscode.workspace.getConfiguration(configuration());
  let pick: vscode.QuickPick<vscode.QuickPickItem>;

  const run = new Promise<string>((resolve) => {
    pick = vscode.window.createQuickPick<vscode.QuickPickItem>();
    pick.placeholder = pick.title = withText;
    pick.items = [];
    pick.value = option;
    pick.ignoreFocusOut = true;
    pick.matchOnDetail = false;
    let secondsRemaining = stop ? 0 : config.get<number>(countdown(), 4);
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

    const runError = (text: string) => `🚫 ${text}`;
    const runAccept = async (value: string) =>
    {
      if (isResolved) { return; }
      isResolved = true;

      clearInterval(timer);

      pick.busy = true;
      pick.enabled = false;
      try {
        pick.hide();
        resolve(value); }
      catch(errors) {
        resolve(empty); }
      finally {
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
    const clearTimer = (time: {} | undefined, value?: unknown) => {
      if (value && value !== option) {
        timer && clearInterval(timer);
      }
    };
    pick.onDidChangeValue((value) => {
      clearTimer(timer, value);
      if (valid) { return; }
      
      const validatable = validation().rename(value);
      pick.title   = validatable ? runError(validatable) : withText;
      pick.buttons = validatable ?
        [cancelButton]
      : [okButton, cancelButton];
    });
    pick.onDidAccept(() => {
      const value = pick.value;
      const validatable = validation().rename(value);
      if (valid || !validatable) {
        void runAccept(pick.value); }
      else {
        pick.title = runError(validatable);

        return; }
    });
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

export const validation = () => { return {
  exclude: (input: string): string | undefined => {
    const trimmed = input.trim();
    if  (!trimmed) { return "Pattern cannot be empty or only spaces."; }
    if   (trimmed.includes("\\")) { return `Use forward slashes (/) for glob 
      paths instead of backslashes (\\)`; }
    if (/^[a-zA-Z]:/i.test(trimmed) || trimmed.startsWith('/')) { return `Paths 
      must be relative to the workspace root. Do not use absolute paths`; }
    if (/["'`><~]/.test(trimmed)) {
      return `Pattern contains illegal path characters: ", ', \`, <, >, ~`; }

    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) { return `Pattern contains unbalanced 
      curly braces { }. Please close all open braces`; }

    const openBrackets = (trimmed.match(/\[/g) || []).length;
    const closeBrackets = (trimmed.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) { return `Pattern contains unbalanced 
      brackets [ ]. Please close all open brackets`; }

    return undefined;
  },
  rename: (input: string): string | undefined => {
    if (!input || input.trim().length === 0) {
      return "Name cannot be empty or consist only of spaces"; }
    if (input.length > 255) {
      return "Name is too long. Maximum length is 255 characters"; }

    const forbiddenCharsRegex = /[<>:"\/\\|?*\x00-\x1F]/;
    if (forbiddenCharsRegex.test(input)) {
      return `Name cannot contain control characters or ` +
             `any of these symbols: <, >, :, ", /, \\, |, ?, *`; }
    if (input.endsWith('.') || input.endsWith(' ')) {
      return "Name cannot end with a space or a period"; }

    return undefined;
  } };
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
