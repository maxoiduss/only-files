// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as vzcode from "../interfaces/vzcode";
import * as vscode from "vscode";
import * as manager from "./fileItemManager";
import { TreeItemCollapsibleState } from "vscode";
import { ExtensionBrandResolver } from "./extensionBrandResolver";
import { ExtensionStaticService as Static
} from "./extensionStaticService";
import { EmptyFolderItem, FileItem, RootFileItem
} from "./fileItem";
import { getConfigurationFor, getConfigurationsFor, getUri
} from "./utilManager";

/**
 * ```
 * class FoldersViewProvider
   implements vscode.TreeDataProvider<FileItem>,
   vzcode.Changable<FileItem>,
   vzcode.Searchable,
   vscode.Disposable
   ```

   Provides {@link FileItem} elements such as 
   {@link FileItem}, {@link EmptyFolderItem}, {@link RootFileItem}
   for a TreeView registered in JustFiles main class.
   - {@link vzcode.Changable<T>} - provides changeTreeItem method 
   of change to TreeItem element in cases like move/remove/rename file
   - {@link vzcode.Searchable} - provides flag to detect the view-list 
   search is on/off
   - {@link vscode.Disposable} - standard vscode api disposable object

   Provider is based on linear arrays search on each *getChildren* step. 
   It has *collapsingItems: Map<string, State>* where each entry of a map 
   has {@link State} that describes is such folder uncollapsed to 'plain' 
   variant in the global Plain Mode or not and its 
   {@link TreeItemCollapsibleState} state. Only folders can be uncollapsed 
   and persist in the map.

   Each expand/collapse the folder in the TreeView adds/deletes the folder 
   to/from *collapsingItems*.

   Each *getChildren* call creates the items read from the directory and 
   filter or removes any part of them that are uncollapsed to 'plain' and 
   synchronises its *TreeItemCollapsibleState* with *collapsingItems* elements.

   {@link EmptyFolderItem} uses purifing system and is used to:
   - create uncollapsed to 'plain' folder - in the Plain Mode
   - create temporary folder to collapse the folder and removed by new
   created one - in the Basic Mode, because vs code api can't obtain the 
   folder-collapse constality so removal then recreation is the only 
   real option.

   Purifing system as any other system in the class remembers the item to 
   focus/expand/select in the future when system calls *getChildren* after 
   the refresh, it looks for this item on every *getChildren* step and 
   provides appropriate action.

   {@link RootFileItem} is used to show empty cell below all files and is 
   acting like project root folder of a such workspace folder.
 */
// FoldersProviderHelper module defines some helper types, funcs and docs
export class FoldersProviderHelper {}

type StateOr = State | TreeItemCollapsibleState | undefined;

export type State = {
  isPlain: boolean;
  collapses: TreeItemCollapsibleState;
};

let getChildrenRootCount: number = 0;

const refreshStatesFrequency = 0.05 as const;
const collapsings = "collapsings"   as const;
const plainModeOn = "plainModeOn"   as const;

const workspaceFolders = () => vscode.workspace.workspaceFolders ?? [];
const configuration    = () => ExtensionBrandResolver.configuration;
const boolean1Property = () => ExtensionBrandResolver.boolean1Property;
const boolean2Property = () => ExtensionBrandResolver.boolean2Property;

export const real = (obj: any): obj is {} => obj !== undefined && obj !== null;

export const isTimeToRefreshStates = (): boolean => {
  getChildrenRootCount++;

  if (getChildrenRootCount * refreshStatesFrequency > 1) {
    getChildrenRootCount = 0;
    return true;
  }
  return false;
};

export const isExpanded = (state: StateOr): boolean => {
  return (typeof state === "number") ?
    state === TreeItemCollapsibleState.Expanded
  : state !== undefined ?
      (state as State).collapses === TreeItemCollapsibleState.Expanded
    : false;
};

export const getFolder = async <T extends FileItem>(
  item: T
): Promise<vscode.Uri> => {
  const uri = await item.getUri();
  return item.isFile ? vscode.Uri.joinPath(uri, '..') : uri;
};

export const createTreeItem = (
  uriOr?: vscode.Uri | string | FileItem | number,
  expanded?: boolean
): Promise<FileItem> => { 
  switch (typeof uriOr)
  { case "number": return Promise.resolve(new RootFileItem(uriOr));
    case "object": if (uriOr instanceof FileItem) {
      return Promise.resolve(Static.plainMode ?
        new EmptyFolderItem(uriOr)
      : new EmptyFolderItem(uriOr.resourceUri!));
    } else {
      return manager.createFileItem(uriOr, expanded);
    }
    case "string":
    default: return manager.createFileItem(uriOr as string, expanded);
  }
};

export const setShowEmptyUncollapsedFolders = () => {
  const config = vscode.workspace.getConfiguration(configuration());
  Static.showEmptyUncollapsedFolders = config.get(boolean2Property(), true);
};

export const setShowUncollapsedPlainFolders = () => {
  const config = vscode.workspace.getConfiguration(configuration());
  Static.showUncollapsedPlainFolders = config.get(boolean1Property(), true);
};

export const loadWorkspaceRoots = (
  setRoots: (set: () => Promise<FileItem[]>) => Promise<FileItem[]>
): Promise<any> => {
  const load = () => Promise.all(
    workspaceFolders().length > 0 ?
      workspaceFolders().map((_, number) => createTreeItem(number))
    : [createTreeItem(0)]
  );
  return setRoots(load);
};

export const loadWorkspaceContexts = (
  context: vscode.ExtensionContext,
  updateCollapsings: (
    uri: vscode.Uri,
    collapses: TreeItemCollapsibleState,
    isPlain: boolean ) => Promise<void>,
  setPlainMode?: ( plainMode: boolean ) => void
) => {
  let collapsing = getConfigurationsFor<State>(context, collapsings);
  for (const [path, state] of collapsing) {
    updateCollapsings(getUri(path), state.collapses, state.isPlain);
  };
  setPlainMode?.(
    getConfigurationFor<boolean>(context, plainModeOn) ?? Static.plainMode
  );
};

export const saveWorkspaceContexts = (
  context: vscode.ExtensionContext,
  plainMode: boolean,
  collapsingItems: Map<string, State>
) => {
  let collapsing = Object.fromEntries(collapsingItems);
  context.workspaceState.update(collapsings, collapsing);
  context.workspaceState.update(plainModeOn, plainMode);
};

export const getExpandingStateFor = (
  uri: vscode.Uri,
  fromCollapsingItems: Map<string, State>
): boolean => {
  const state = fromCollapsingItems.get(uri.toString());
  return isExpanded(state);
};

export const refreshStatesFor = (
  itemsOrItem: FileItem[] | FileItem,
  byCollapsingItems: Map<string, State>
) => {
  if (itemsOrItem instanceof FileItem) {
    const item = itemsOrItem;
    if (item.resourceUri) {
      const state = byCollapsingItems.get(item.resourceUri.toString());
      if (state) {
        const collapses = item.collapsibleState;
        if (collapses === TreeItemCollapsibleState.None) { return; }
        if (collapses !== state.collapses) {
          item.collapsibleState = state.collapses;
        }
      }
    }
  } else {
    const items = itemsOrItem;
    for (const [pathe, state] of byCollapsingItems) {
      manager.findThen(pathe, items, (check) => {
        const collapses = items[check].collapsibleState;
        if (collapses === TreeItemCollapsibleState.None) { return; }
        if (collapses !== state.collapses) {
          items[check].collapsibleState = state.collapses;
        }
      });
    }
  }
};
