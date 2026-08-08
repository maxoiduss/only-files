import { FileItem } from "./fileItem";
import { ExtensionStaticService as Static
} from "./extensionStaticService";
import {
  autodebug, basename, extname, getUri, getUriFrom, isFile, isValidUri, same
} from "./utilManager";

const empty = '' as const;

type UriOrString = vscode.Uri | string;

export function getParent(itemOr: string): string;
export function getParent(itemOr: FileItem | vscode.Uri): vscode.Uri;
export function getParent(itemOr: FileItem | UriOrString): UriOrString {
  if (!itemOr) { return empty; }
  if (typeof itemOr === 'object') {
    const uri = itemOr instanceof FileItem ?
      itemOr.resourceUri ?
        itemOr.resourceUri : getUri(itemOr.getLabel())
    : itemOr;

    return uri ? vscode.Uri.joinPath(uri, '..') : empty;
  }
  const uri = getUri(itemOr);

  return vscode.Uri.joinPath(uri, '..').toString();
}

export const getNameWithoutExt = async (
  fileItemOr: FileItem | UriOrString
): Promise<string> => {
  const pathOr = fileItemOr instanceof FileItem ?
    await fileItemOr.getUri()
  : getUri(fileItemOr);
  const base = basename(pathOr);
  const ext = extname(pathOr);

  if (ext && base.endsWith(ext) && base !== ext) {
    return base.slice(0, ext.length > 0 ? -ext.length -1 : 0);
  }
  return base;
};

export const getChildrenNames = async (
  itemOr: FileItem | UriOrString | undefined
): Promise<string[]> => {
  const currentUri = itemOr instanceof FileItem ?
    itemOr.isFile ? empty : itemOr.resourceUri ?? empty
  : itemOr ? getUri(itemOr) : empty;

  if (currentUri === empty) { return []; }

  try {
    const entries = await vscode.workspace.fs.readDirectory(currentUri);
    return entries.map(([name]) =>
      vscode.Uri.joinPath(currentUri, name).toString()
    ); }
  catch (error) { return []; }
};

export const getNewFileItem = (
  uri: vscode.Uri | undefined,
  label: string,
  collapsibleState: vscode.TreeItemCollapsibleState,
  isFile: boolean
): FileItem => {
  return uri ?
    new FileItem(label, collapsibleState, isFile, uri)
  : new FileItem(label, collapsibleState, isFile);
};
  
export const createFileItems = async (
  uris: vscode.Uri[] | string[]
): Promise<FileItem[]> => {
  return Promise.all(uris.map((uri) => createFileItem(uri)));
};

export const createFileItem = async (
  uriOr: UriOrString,
  expanded?: boolean
): Promise<FileItem> => {
  const uri = getUri(uriOr);
  const valid = await isValidUri(uri);
  if (valid) {
    const label = Static.plainMode ? uri.toString() : basename(uri);
    const aFile = await isFile(uri) === true;
    const collapsibleState = aFile ?
      vscode.TreeItemCollapsibleState.None
    : expanded ?
        vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.Collapsed;

    return getNewFileItem(
      Static.plainMode ? undefined : uri,
      label, collapsibleState, aFile
    );
  }
  
  const newFileItem = getNewFileItem(
    Static.plainMode ? undefined : uri,
    Static.plainMode ? uri.path : basename(uri),
    vscode.TreeItemCollapsibleState.None,
    true
  );
  newFileItem.description = "File not found";
  newFileItem.tooltip = `'${uri.path}' was not found, 
    click on Refresh icon for remove all invalid files from View`;

  return newFileItem;
};

export const check = (childFileItemOrUri: FileItem | vscode.Uri) => {
  return {
    isChildOf: (
      parentFileItemOrUriOrPath: FileItem | UriOrString,
      canBeEqualToParent?: boolean
    ): boolean => {
      const sep = '/';
      const childUri = getUriFrom(childFileItemOrUri);
      const parentUri = typeof parentFileItemOrUriOrPath === "string" ?
        getUri(parentFileItemOrUriOrPath)
      : getUriFrom(parentFileItemOrUriOrPath);

      if (childUri.scheme !== parentUri.scheme
       || childUri.authority !== parentUri.authority) { return false; }
      
      const child = childUri.path;
      const parent = parentUri.path;
      if (same(child, parent)) { return canBeEqualToParent === true; }

      const parentWithSlash = parent.endsWith(sep) ? parent : parent + sep;

      return child.startsWith(parentWithSlash);
    }
  };
};

export const changeUri = (
  on: FileItem | vscode.Uri, newUri: vscode.Uri, oldUri: vscode.Uri
): vscode.Uri | undefined => {
  const sep = '/';
  const isFileItem = on instanceof FileItem;
  const targetUri = isFileItem ? on.resourceUri : on;
  if (!targetUri) { return undefined; }

  const targetPath = targetUri.path;
  const oldPath = oldUri.path;
  if (same(targetPath, oldPath) || targetPath.startsWith(oldPath + sep)) {
    let relativePart = targetPath.substring(oldPath.length);
    if (relativePart.startsWith(sep)) {
      relativePart = relativePart.substring(1);
    }
    const uri = vscode.Uri.joinPath(newUri, relativePart);
    if (isFileItem) { on.setUri(uri); }

    return uri;
  }

  return undefined;
};

export const findThen = (
  item: FileItem | string,
  inArray: FileItem[],
  then: (found: number) => unknown): boolean =>
{ const foundIndex = inArray.findIndex((it) => it.like(item));
  if (foundIndex >= 0) {
    then(foundIndex);
    return true;
  }
  return false;
};

export const findAnyThen = async (
  items: (FileItem | string)[],
  inArray: FileItem[],
  then: (foundElem: number, foundItem: number) => Promise<unknown>
): Promise<boolean> => {
  let foundPosition: number = -1;
  const foundIndex = inArray.findIndex((it) => items.some((element, i) =>
  {
    if (it.like(element)) {
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
};

export const sortItems = (
  fileItems: FileItem[],
  byNamesOnly: boolean = false) =>
{ const sep = '/';
  const collator = new Intl.Collator('en', { numeric: true });
  const mapped = fileItems.map((item) => {
    const pathe = item.relativePath;
    const label = byNamesOnly ? basename(pathe) : pathe;
    
    return { item,
      label: label.toLowerCase(),
      isDir: !item.isFile,
      hasSep: !byNamesOnly && pathe.includes(sep)
    };
  });
  mapped.sort((a, b) => {
    if (autodebug[2]) { debugger; }
    if (a.isDir !== b.isDir) { return a.isDir ? -1 : 1; }
    if (!byNamesOnly && a.hasSep !== b.hasSep) { return a.hasSep ? 1 : -1; }

    return collator.compare(a.label, b.label);
  });

  return mapped.map((v) => v.item);
};
