export type Serializable =
  | Serializing
  | { [key: string]: Serializable }
  | Serializable[];

type Serializing = string | number | boolean | null | undefined;
/*-------------------------------------------------------------------------*/

export interface Searchable {
  onSearch: boolean;
}

export interface Changable<T extends import("vscode").TreeItem> {
  changeTreeItem(treeItem: T, oldUri: import("vscode").Uri): void;
}

export interface HasDefaults {
  setDefaults(): Promise<void>;
}
/*-------------------------------------------------------------------------*/

(() => {
  if ((globalThis as any).vscode) { return; }

  const vsc = require("vscode");

  Object.defineProperty(globalThis, "vscode", {
    value: vsc,
    writable: false,
    configurable: false,
    enumerable: true
  });
})();
