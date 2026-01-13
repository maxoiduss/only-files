import * as vscode from "vscode";
import * as fs from "fs";
import { EmptyFolderItem, FileItem } from "./fileItem";
import { getUri } from "./utilManager";
import fpath = require("path");

export class FileItemManager {
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

  getConfigurationFor<T>(ctx: vscode.ExtensionContext, key: string): [string, T][]
  {
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

  sortItems(items: FileItem[], byNamesOnly: boolean = false) {
    return items.sort((a, b) => {
      const labelA = (byNamesOnly ?
        fpath.basename(a.relativePath)
      :  a.relativePath).toLocaleLowerCase();
      const labelB = (byNamesOnly ?
        fpath.basename(b.relativePath)
      :  b.relativePath).toLocaleLowerCase();
      const aHasSep = /[\/\\]/.test(a.relativePath);
      const bHasSep = /[\/\\]/.test(b.relativePath);
      
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
