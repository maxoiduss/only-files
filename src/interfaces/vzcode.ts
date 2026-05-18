import * as vscode from "vscode";

type Serializing = string | number | boolean | null | undefined;

export type Serializable =
  | Serializing
  | { [key: string]: Serializable }
  | Serializable[];

/*-------------------------------------------------------------------------*/

export interface Searchable {
  onSearch: boolean;
}

export interface Changable<T extends vscode.TreeItem> {
  changeTreeItem(treeItem: T, oldUri: vscode.Uri): void;
}

export interface HasDefaults {
  setDefaults(): Promise<void>;
}