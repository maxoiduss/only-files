import * as vscode from "vscode";
import fpath = require("path");
import { ProviderResult, TreeItemCollapsibleState } from "vscode";
import { asRelative, EmptyFolderItem, emptyRoot, FileItem, root, RootFileItem } from "./fileItem";
import { FileItemManager, getAllFolders, isInFolder } from "./fileItemManager";
import { brand } from "./commandRegistrator";

const collapsinges: string = "collapsinges";
const plainModeOn: string = "plainModeOn";

function isExpanded(state: State | TreeItemCollapsibleState | undefined): boolean
{
  return (typeof state === "number") ?
    state === TreeItemCollapsibleState.Expanded
  : state !== undefined ?
      (state as State).collapses === TreeItemCollapsibleState.Expanded
    : false;
}

type State = {
  isPlain: boolean;
  collapses: TreeItemCollapsibleState;
};

type Ignore = {
  readonly fileRules: RegExp[];
  readonly folderRules: RegExp[];
};

export class FoldersViewProvider implements vscode.TreeDataProvider<FileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | void> =
    new vscode.EventEmitter<FileItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | void> =
    this._onDidChangeTreeData.event;

  constructor(
    context: vscode.ExtensionContext,
    reveal: (item: FileItem, expand?: boolean) => Promise<void>
  ) {
    this.context = context;
    this.revealItem = reveal;
    this.checkIgnoreItems = this.checkIgnoreItems.bind(this);

    const collapsingConfig =
      this.fileItemManager.getConfigurationFor<State>(this.context, collapsinges);
    collapsingConfig.forEach(async ([uri, state]) => await this.updateCollapsings(
      vscode.Uri.file(uri), state.collapses, state.isPlain
    ));
    this.plainMode = context.workspaceState.get<boolean>(plainModeOn)
      ?? this.plainMode;
  }
  public isEmpty: boolean = true;
  public plainMode: boolean = false;
  public readonly root: RootFileItem = this.createFileItem();

  private showingRoot: boolean = true;
  private showEmptyUncollapsedFolders: boolean = true;
  private uncollapsedMode: [boolean, boolean] = [false, false];
  private context: vscode.ExtensionContext;
  private readonly fileItemManager = new FileItemManager();
  private readonly collapsingItems: Map<string, State> = new Map();
  private ignoreItems: Ignore | undefined;
  private expandedItem: FileItem | undefined;
  private focusedItem: FileItem | undefined;
  private selectedItem: (FileItem | string | undefined)[] = [];

  private revealItem: (item: FileItem, expand?: boolean) => Promise<void>;

  private createFileItem(
      uriOr?: vscode.Uri | string | FileItem | undefined,
      plainMode?: boolean,
      expanded?: boolean): FileItem {
    switch (typeof uriOr) {
      case "undefined": return new RootFileItem();
      case "object": if (uriOr instanceof FileItem) {
        return new EmptyFolderItem(plainMode ?
          uriOr.resourceUri! : uriOr,
          expanded
        );
      } else { return this.fileItemManager.createFileItem(
        uriOr, plainMode, expanded
      ); }
      case "string":
      default: return this.fileItemManager.createFileItem(
        uriOr as string, plainMode, expanded
      );
    }
  }

  private collapseItem(item: FileItem, thenRefresh: boolean = true) {
    this.expandedItem = item;

    if (thenRefresh) { this.refresh(); }
  }

  private checkIgnoreItems(itemOnly?: FileItem | undefined): boolean {
    if (!this.ignoreItems) { return true; }

    if (itemOnly) {
      const rel = itemOnly.relativePath;
      return !this.ignoreItems.folderRules.some(expr => expr.test(rel))
          && !this.ignoreItems.fileRules.some(expr => expr.test(rel));
    }
    
    for (const [path, _] of this.collapsingItems) {
      const folder = vscode.workspace.asRelativePath(path).replace(/\\/g, '/');
      if (this.ignoreItems.folderRules.some(expr => expr.test(folder))) {
        this.popFromCollapsings(path);
      }
    }
    return false;
  }

  private refreshStatesOn(items: FileItem[]) {
    for (const [path, state] of this.collapsingItems) {
      this.fileItemManager.findThen(path, items, (check) => {
        if (!state.isPlain) {
          items[check].hasExpandedState(
            { changeTo: isExpanded(state.collapses)});
        }
      });
    }
  }

  private async updateCollapsings(
    uri: vscode.Uri,
    collapses: TreeItemCollapsibleState,
    isPlain: boolean
  ): Promise<void> {
    const isFolder =
      (await vscode.workspace.fs.stat(uri)).type === vscode.FileType.Directory;
    const dir = isFolder ? uri.fsPath : fpath.dirname(uri.fsPath);
    this.collapsingItems.set(dir, { isPlain: isPlain, collapses: collapses });
  }

  private async popFromCollapsings(uriOr: vscode.Uri | string): Promise<boolean> {
    let dir: string;
    if (uriOr instanceof vscode.Uri) {
      const isFolder = (await vscode.workspace.fs.stat(uriOr)).type ===
        vscode.FileType.Directory;
      dir = isFolder ? uriOr.fsPath : fpath.dirname(uriOr.fsPath);
    } else {
      dir = uriOr;
    }
    return this.collapsingItems.delete(dir);
  }

  switchPlainModeTag() {
    vscode.commands.executeCommand(
      'setContext', 
      `${brand}:isPlain`,
      this.plainMode
    );
  }

  showItemInExplorerByUriOrTrySelect(uriOr?: vscode.Uri | undefined) {
    if (!uriOr) {
      if (this.selectedItem[0] instanceof FileItem) {
        this.revealItem(this.selectedItem[0]);
        this.selectedItem[0] = undefined;
      }
      return;
    }
    const base = vscode.workspace.getWorkspaceFolder(uriOr);
    if (!base) { return; }

    let itemPath = base.uri.fsPath.replace(/\\/g, '/');
    const folders = asRelative(uriOr).split('/');
    this.selectedItem = [];
    
    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i];
      itemPath += `/${folder}`;
      const itemUri = vscode.Uri.file(itemPath);
      this.selectedItem.push(itemUri.fsPath);

      const isLast = i === folders.length - 1;
      const exist = this.collapsingItems.get(itemUri.fsPath);
      if (!isLast && (!exist || exist.isPlain === false)) {
        this.updateCollapsings(itemUri,
          TreeItemCollapsibleState.Expanded, false);
      }
    }
    this.selectedItem = [undefined, ...this.selectedItem.reverse()];
    this.refresh();
  }

  setShowEmptyUncollapsedFolders() {
    const config = vscode.workspace.getConfiguration(`${brand}`);
    this.showEmptyUncollapsedFolders = config.get("showemptyfolders", true);
  }

  rootIsShown(forceValue: boolean | undefined = undefined): boolean {
    if (typeof forceValue === "boolean") {
      this.showingRoot = forceValue;
      this.refresh();
    }
    return this.showingRoot;
  }

  setIgnoreItems(items: [boolean, RegExp][]) {
    this.ignoreItems = {
      fileRules: items.flatMap(([fileRule, expr]) => fileRule ? expr : []),
      folderRules: items.flatMap(([fileRule, expr]) => fileRule ? [] : expr)
    };
  }

  resetIgnoreItems(): boolean {
    const wasSet = this.ignoreItems !== undefined;
    this.ignoreItems = undefined;
    return wasSet;
  }

  addCollapsingElement(element: FileItem) {
    element.hasExpandedState({ changeTo: true });
    if (element.resourceUri) {
      this.updateCollapsings(
        element.resourceUri,
        element.collapsibleState!,
        false
      );
    }
  }

  removeCollapsingElement(element: FileItem) {
    element.hasExpandedState({ changeTo: false });
    if (element.resourceUri) {
      this.popFromCollapsings(element.resourceUri);
    }
  }

  refresh(element?: FileItem): void {
    this._onDidChangeTreeData.fire(element);

    const collapsings = Object.fromEntries(this.collapsingItems);
    this.context.workspaceState.update(collapsinges, collapsings);
    this.context.workspaceState.update(plainModeOn, this.plainMode);
  }

  getTreeItem(element: FileItem): FileItem | Thenable<FileItem> {
    return element;
  }

  getParent?(element: FileItem): ProviderResult<FileItem> {
    return;
  }

  canUncollapseAll(value: boolean) {
    if (value){
      this.plainMode = true;
      this.uncollapsedMode = [true, true];
      this.collapsingItems.clear();
    } else {
      if (this.uncollapsedMode[1]) {
        this.uncollapsedMode = [false, false];
        this.collapsingItems.clear();
      }
    }
    this.refresh();
  }

  async collapseOrUncollapseItem(item: FileItem): Promise<void> {
    const expanded: boolean | undefined = item.hasExpandedState();

    if (this.plainMode) {
      if (!item.isFile && (!expanded || await item.isEmpty())) {
        this.revealItem(item, true); /// if collapsed or empty folder - expand
        return;
      }
      let uri = item.resourceUri ?? vscode.Uri.file(item.label! as string);
      uri = item.isFile ? vscode.Uri.joinPath(uri, "..") : uri; /// get folder
      const exists = this.collapsingItems.get(uri.fsPath);

      if (exists && exists.isPlain) {
        if (item instanceof EmptyFolderItem || item.isFile) { /// remove plain
          this.updateCollapsings(uri, TreeItemCollapsibleState.Expanded, false);
          this.collapseItem(item); /// go back to classic mode and collapse
        }
      } else { /// otherwise - uncollapse the folder to plain mode
        this.updateCollapsings(uri, TreeItemCollapsibleState.Expanded, true);
        this.focusedItem = item;
      }
      this.refresh();
    } else if (expanded) {
      this.collapseItem(item, true);
    } else {
      this.revealItem(item, true);
    }
    this.uncollapsedMode[0] = false;
  }

  async getChildren(element?: FileItem): Promise<FileItem[]> {
    const purify = (item: FileItem, then?: () => any) =>
      this.fileItemManager.findThen(item, items, (replacing) => {
        items[replacing] = this.createFileItem(items[replacing], false, true);
        then?.();
      });
    const emptify = (item: FileItem): FileItem =>
      this.createFileItem(item, true, false);
    const clearItemsOfEmptyElements = () =>
      items = items.filter(item => !(item instanceof EmptyFolderItem));
    const filterItemsOfIgnoredElements = () =>
      items = items.filter(this.checkIgnoreItems);
    const addFileItem = (uri: vscode.Uri) =>
      items.push(this.createFileItem(uri, this.plainMode));
    const initCollapsingItemsByAllFolders = async ()=>
      await Promise.all((await getAllFolders())!.map(uri =>
        this.updateCollapsings(uri, TreeItemCollapsibleState.Collapsed, true)));
    const excludeOrEmptifyNestedPlainItemsBy = (collapsings: [string, State][]) =>
    {
      items = items.flatMap(it => {
        const uri = it.resourceUri ?? vscode.Uri.file(it.label! as string);
        for (const [path, state] of collapsings) {
          if (state.isPlain && isInFolder(uri.fsPath, path)) {
            return uri.fsPath === path ? [emptify(it)] : []; /// empty or exclude
          }
        }
        return [it]; /// get existing element - nothing to change
      });
    };
    const revealSelectedItem = () =>
    {
      const toSelect = this.selectedItem[1];
      if (toSelect) {
        const pathes = this.selectedItem.filter(i => i !== undefined);
        this.fileItemManager.findAnyThen(pathes, items, async (found) =>
          this.revealItem(items[found], true));
        this.fileItemManager.findThen(toSelect.toString(), items,
          (i) => this.selectedItem = [items[i]]);
      }
    };
    const itemMustBeRevealed = async (on: { expand: boolean; focus: boolean }) =>
    {
      if (this.selectedItem.length > 1) { revealSelectedItem(); }
      
      const targetItem = on.expand ? this.expandedItem
      : on.focus ? this.focusedItem : undefined;

      if (!targetItem) { return true; }
      if (targetItem.isFile) {
        let found = false;
        this.fileItemManager.findThen(targetItem, items, async (i) => {
          if (on.expand) { this.expandedItem = undefined; }
          if (on.focus) { this.focusedItem  = undefined; }

          found = true;
          await this.revealItem(items[i]);
        });
        if (found) { return true; }
      }
      return false;
    };
    const refreshFilterItems = async (on: { root: boolean } = { root: true }) =>
    {
      refreshCollapsibleStates();

      if (this.plainMode) { await filterItemsInPlainMode(on.root); }
      else { filterItemsOfIgnoredElements(); }

      await itemMustBeRevealed({ expand: false, focus: true });
    };
    const collapseExpandedItem = async () =>
    {
      if (await itemMustBeRevealed({ expand: true, focus: false })) {
        return;
      }
      purify(this.expandedItem as FileItem, () => {
        this.fileItemManager.remove(this.expandedItem as FileItem,
          this.collapsingItems, () => {
            this.expandedItem = undefined;
            this.refresh();
        });
      });
    };
    const refreshCollapsibleStates = async () =>
    {
      this.refreshStatesOn(items);

      if (this.expandedItem) {
        await collapseExpandedItem();
      }
    };
    const filterItemsInPlainMode = async (root: boolean = true) =>
    {
      const getNestedComponentsArrays = async (): Promise<FileItem[][]> =>
        await Promise.all(collapsings.flatMap(async ([path, state]) => {
          if (!state.isPlain) { return []; }
          /// get all nested files and folders excluding plain folders
          const collapsingUri = vscode.Uri.file(path);
          let files: [string, vscode.FileType][];
          try {
            files = await vscode.workspace.fs.readDirectory(collapsingUri);
          } catch (error) {
            this.popFromCollapsings(path);
            files = [];
          }
          return files.flatMap(([file, _]) => { /// exclude plain folders
            const uri = vscode.Uri.joinPath(collapsingUri, file); /// create uri
            let expanded: boolean | undefined; /// state to pass to a new item
            return collapsings.some(([nestedPath, nestedState]) => {
              if (uri.fsPath === nestedPath) { /// item detected in collapsings
                expanded = isExpanded(nestedState.collapses);
                return nestedState.isPlain; /// plain items shouldn't be created
              } return false; /// these items will be created and maybe expanded
            }) ?
            [] : this.createFileItem(uri, true, expanded);
          });
        })
      );
      if (this.uncollapsedMode[0] && this.collapsingItems.size <= 0) {
        await initCollapsingItemsByAllFolders();

        if (this.showEmptyUncollapsedFolders) {
          this.uncollapsedMode[0] = false;
        }
      }
      this.checkIgnoreItems();
      excludeOrEmptifyNestedPlainItemsBy([...this.collapsingItems.entries()]);

      if (!root) { filterItemsOfIgnoredElements(); return; }

      const collapsings = [...this.collapsingItems.entries()];
      const componentsArrays = await getNestedComponentsArrays();
      items.push(...componentsArrays.flat());
      items = items.filter(this.checkIgnoreItems);

      if (this.uncollapsedMode[0] && !this.showEmptyUncollapsedFolders) {
        items = items.filter(item => item.isFile);
      }
    };
    const sortItemsThenCheckRoot = async(): Promise<FileItem[]> =>
    {
      clearItemsOfEmptyElements();
      const sorted = this.fileItemManager.sortItems(items);
      this.isEmpty = sorted.length === 0;

      if (this.showingRoot) {
        this.root.contextValue = this.isEmpty ? emptyRoot : root;
        sorted.push(this.root);
      }

      return sorted;
    };
    let items: FileItem[] = [];

    if (!element) {
      const workspaceFolders = vscode.workspace.workspaceFolders || [];

      if (workspaceFolders.length === 1) {
        const files = await vscode.workspace.fs.readDirectory(
          workspaceFolders[0].uri
        );

        for (const [name] of files) {
          const itemUri = vscode.Uri.joinPath(workspaceFolders[0].uri, name);
          addFileItem(itemUri);
        }
        await refreshFilterItems();
        return sortItemsThenCheckRoot();
      }

      for (const folder of workspaceFolders) {
        addFileItem(folder.uri);
      }
      await refreshFilterItems();
      return sortItemsThenCheckRoot();
    }

    const files = await vscode.workspace.fs.readDirectory(element.resourceUri!);

    for (const [name] of files) {
      const itemUri = vscode.Uri.joinPath(element.resourceUri!, name);
      addFileItem(itemUri);
    }
    await refreshFilterItems({ root: false });
    return this.fileItemManager.sortItems(items);
  }
}
