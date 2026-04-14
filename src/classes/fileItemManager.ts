import * as vscode from "vscode";
import * as fpath from 'path';
import { EmptyFolderItem, FileItem } from "./fileItem";
import { getUri, isFile, isValidUri } from "./utilManager";

const empty = '' as const;

export class FileItemManager {
  findRootFolder(forPath: string, inItems: FileItem[]): FileItem | undefined {
    return inItems.find((it) => {
      if (it.resourceUri && !(it instanceof EmptyFolderItem)) {
        return forPath.startsWith(it.resourceUri.fsPath);
      }
    });
  }
  
  async createFileItems(uris: vscode.Uri[] | string[]): Promise<FileItem[]> {
    return Promise.all(uris.map((u) =>
      this.createFileItem(u)
    ));
  }

  async createFileItem(
    uriOr: vscode.Uri | string,
    plainMode?: boolean,
    expanded?: boolean
  ): Promise<FileItem> {
    const uri = getUri(uriOr);

    if (await isValidUri(uri)) {
      const label = plainMode ? uri.fsPath : fpath.basename(uri.fsPath);
      const file = await isFile(uri) === true;
      const collapsibleState = file ?
        vscode.TreeItemCollapsibleState.None
      : expanded ?
        vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed;

      return this.getNewFileItem(
        plainMode ? undefined : uri,
        label, collapsibleState, file
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

  async getSiblings(fileItem: FileItem): Promise<FileItem[]> {
    const currentPath = fileItem.resourceUri?.fsPath;
    if (!currentPath) { return []; }

    const directoryPath = fpath.dirname(currentPath);
    const directoryUri = vscode.Uri.file(directoryPath);
    try {
      const entries = await vscode.workspace.fs.readDirectory(directoryUri);
      const siblingPaths: string[] = entries
        .map(([name, ]) => fpath.join(directoryPath, name))
        .filter((path) => path !== currentPath);
      return this.createFileItems(siblingPaths);
    } catch (error) {
      return [];
    }
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

  isChildOf(
    childFileItemOrUri: FileItem | vscode.Uri,
    parentFileItemOrUri: FileItem | vscode.Uri
  ): boolean {
    const childFileItemPath = childFileItemOrUri instanceof vscode.Uri ?
      childFileItemOrUri.fsPath
    : childFileItemOrUri.resourceUri?.fsPath || empty;
    const parentFileItemPath = parentFileItemOrUri instanceof vscode.Uri ?
      parentFileItemOrUri.fsPath
    : parentFileItemOrUri.resourceUri?.fsPath || empty;

    if (childFileItemPath === parentFileItemPath) {
      return false;
    }
    const relativePath = fpath.relative(parentFileItemPath, childFileItemPath);

    return !relativePath.startsWith("..") && !fpath.isAbsolute(relativePath);
  }

  changeUri(onItem: FileItem, newItem: FileItem, oldUri: vscode.Uri) {
    const newPath = newItem.resourceUri?.fsPath;
    if (newPath) {
      const path = onItem.resourceUri?.fsPath.replace(oldUri.fsPath, newPath);
      if (path) {
        onItem.setUri(vscode.Uri.file(path));
      }
    }
  }

  findThen(
    item: FileItem | string,
    inArray: FileItem[],
    then: (found: number) => any): boolean
  {
    const foundIndex = inArray.findIndex((it) => it.like(item));
    if (foundIndex >= 0) {
      then(foundIndex);
      return true;
    }
    return false;
  }

  async findAnyThen(
    items: (FileItem | string)[],
    inArray: FileItem[],
    then: (foundElem: number, foundItem: number) => Promise<any>
  ): Promise<boolean> {
    let foundPosition: number = -1;
    const foundIndex = inArray.findIndex((it) => items.some((el, i) => {
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
      this.findThen(item, collection, (where) => {
        collection.splice(where, 1);
        then?.();
      });
    } else
    if (collection instanceof Map && item.resourceUri) {
      if (collection.delete(item.resourceUri.fsPath)) {
        then?.();
      }
    }
  }

  sortItems(items: FileItem[], byNamesOnly: boolean = false) {
    return items.sort((a, b) => {
      const labelA = (byNamesOnly ?
        fpath.basename(a.relativePath)
      :  a.relativePath).toLocaleLowerCase();
      const labelB = (byNamesOnly ?
        fpath.basename(b.relativePath)
      :  b.relativePath).toLocaleLowerCase();
      const aHasSep = !byNamesOnly && /[\/\\]/.test(a.relativePath);
      const bHasSep = !byNamesOnly && /[\/\\]/.test(b.relativePath);
      
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
