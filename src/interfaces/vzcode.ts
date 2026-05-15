import * as vscode from "vscode";

export interface Searchable {
  onSearch: boolean;
}

export interface Changable<T extends vscode.TreeItem> {
  changeTreeItem(treeItem: T, oldUri: vscode.Uri): void;
}

export interface HasDefaults {
  setDefaults(): Promise<void>;
}