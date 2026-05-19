import * as global from 'vscode';
declare global { export import vscode = global; }

export type Serializable =
  | Serializing
  | { [key: string]: Serializable }
  | Serializable[];

type Serializing = string | number | boolean | null | undefined;
/*-------------------------------------------------------------------------*/

export interface Searchable {
  onSearch: boolean;
}

export interface Changable<T extends global.TreeItem> {
  changeTreeItem(treeItem: T, oldUri: global.Uri): void;
}

export interface HasDefaults {
  setDefaults(): Promise<void>;
}