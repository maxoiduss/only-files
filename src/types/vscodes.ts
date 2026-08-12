export type Disposable = import("vscode").Disposable & {
  isDisposed: boolean | undefined;
}; /// use: if (this.isDisposed) { return; } else { this.isDisposed = true; }

export type EnumLike<T> = T[keyof T];

export type ViewX = "Files" | "Only Files" | "Preview";

export type Serializable =
  | Serializing
  | { [key: string]: Serializable }
  | Serializable[];

type Serializing = string | number | boolean | null | undefined;
/*-------------------------------------------------------------------------*/

export interface HelperContract<T extends import("vscode").TreeItem> {
  cache: Map<string | undefined, WeakRef<T> >;
  removeFromCache: (id: string) => void;
  addToCache: (id: string, item: T) => void;
  loadWorkspaceContexts: (
    context: import("vscode").ExtensionContext,
    ...args: any[]
  ) => void;
  saveWorkspaceContexts: (
    context: import("vscode").ExtensionContext,
    ...args: any[]
  ) => void;
  real: (obj: any) => boolean;
}

export interface Searchable {
  onSearch: boolean;
}

export interface Changable<T extends import("vscode").TreeItem> {
  changeTreeItem(item: T, oldUri: import("vscode").Uri): void;
}

export interface MayBeBusy {
  busy?: boolean;
}

export interface HasDefaults {
  setDefaults(): Promise<void>;
}

export interface Brand {
  show: string;
  hide: string;
  openFolder: string;
  closeFolder: string;
  closeFolderAction: string;
  getSelected: string;
  setSelected: string;
  addItemFromTabMenu: string;
  removeItemFromTabMenu: string;
  addItemFromCommand: string;
  removeItemFromCommand: string;
  addItemFromExplorer: string;
  revealInSidebar: string;
  revealInExplorer: string;
  refuseMarked: string;
  collectMarked: string;
  collapseFolder: string;
  uncollapseAll: string;
  previewItem: string;
  removeAll: string;
  remark: string;
  ignore: string;
  ignoreback: string;
  showAll: string;
  showLogs: string;
  showExact: string;
  showWarnings: string;
  switch: string;
  switchback: string;
  searchListFiles: string;
  searchListOnlyFiles: string;
  searchListActiveFiles: string;
  searchListActiveOnlyFiles: string;
  refreshFiles: string;
  refreshOnlyFiles: string;
  refreshSortedOnlyFiles: string;
  manageWatcherExclude: string;
  setContext: string;
  restore: string;
  isActive: string;
  isIgnored: string;
  isSorted: string;
  isPlain: string;
  actions: {
    find: string;
  };
  files: {
    watcherExclude: string;
  };
  list: {
    find: string,
    closeFind: string
  };
  settings: {
    switchToJSON: string;
  };
  vscode: {
    open: string,
    openFolder: string
  };
  workbench: {
    action: {
      files: {
        openFolderViaWorkspace: string;
      },
      openSettings: string,
      openGlobalKeybindings: string,
      closeFolder: string,
      closeActiveEditor: string,
      focusActiveEditorGroup: string
    },
    view: {
      extension: {
        webviewContainer: string,
        treeviewContainer: string
      }
    }
  };
  focus: (on: ViewX) => string;
}
/*-------------------------------------------------------------------------*/

export const window = {
  registerWebviewViewProvider(
    viewId: string,
    provider: vscode.WebviewViewProvider & HasDefaults
  ): vscode.Disposable {
    const registered = require("vscode").window.registerWebviewViewProvider(
      viewId, provider
    );
    provider.setDefaults();

    return registered;
  }
};
/*-------------------------------------------------------------------------*/

const init = () => {
  return {
    vscode: () => {
      if ((globalThis as any).vscode) { return; }

      const vsc = require("vscode");

      Object.defineProperty(globalThis, "vscode", {
        value: vsc,
        writable: false,
        configurable: false,
        enumerable: true
      });
    }
  };
};

init().vscode();
