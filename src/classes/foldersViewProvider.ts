import * as vscode from "vscode";
import * as fpath from 'path';
import { ProviderResult, TreeItemCollapsibleState } from "vscode";
import {
  asRelative,
  EmptyFolderItem,
  emptyRoot,
  FileItem,
  root,
  RootFileItem
} from "./fileItem";
import { FileItemManager } from "./fileItemManager";
import {
  getAllFolders,
  getConfigurationFor,
  getConfigurationsFor,
  isFolder,
  isInFolder 
} from "./utilManager";
import { brand, ExtensionBrandResolver } from "./extensionBrandResolver";

const collapsinges = "collapsinges" as const;
const plainModeOn = "plainModeOn" as const;

const configuration = () => ExtensionBrandResolver.configuration;
const boolean1Property = () => ExtensionBrandResolver.boolean1Property;
const boolean2Property = () => ExtensionBrandResolver.boolean2Property;

function isExpanded(state: State | TreeItemCollapsibleState | undefined):boolean
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

type FileItemOr = FileItem | undefined | void;

export class FoldersViewProvider
  implements vscode.TreeDataProvider<FileItem>,
  vscode.Searchable,
  vscode.Disposable
{
  private _onDidChangeTreeData: vscode.EventEmitter<FileItemOr> =
    new vscode.EventEmitter<FileItemOr>();
  readonly onDidChangeTreeData: vscode.Event<FileItemOr> =
    this._onDidChangeTreeData.event;

  public isEmpty: boolean = true;
  public onSearch: boolean = false;
  public plainMode: boolean = false;

  private showingRoot: boolean = true;
  private showEmptyUncollapsedFolders: boolean = true;
  private showUncollapsedPlainFolders: boolean = false;
  private uncollapsedMode: [boolean, boolean] = [false, false];
  private readonly fileItemManager = new FileItemManager();
  private readonly collapsingItems: Map<string, State> = new Map();
  private ignoredItems: Ignore | undefined;
  private focusedItem: FileItem | undefined;
  private expandedItem: FileItem | undefined;
  private selectedItem: (FileItem | string | undefined)[] = [];
  private root!: RootFileItem;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly revealItem: (item: FileItem, expand?: boolean) => void
  ) {
    new Promise(async () => this.root = await this.createFileItem());
    this.checkIgnoredItems = this.checkIgnoredItems.bind(this);
    this.setShowEmptyUncollapsedFolders();
    this.setShowUncollapsedPlainFolders();

    const collapsingConfig =
      getConfigurationsFor<State>(this.context, collapsinges);
    collapsingConfig.forEach(async ([path, state]) =>
      await this.updateCollapsings(
        vscode.Uri.file(path), state.collapses, state.isPlain
      ));
    this.plainMode = getConfigurationFor<boolean>(this.context, plainModeOn)
      ?? this.plainMode;
    if (this.plainMode) { this.switchPlainModeTag(); }
  }

  private createFileItem(
      uriOr?: vscode.Uri | string | FileItem | undefined,
      plainMode?: boolean,
      expanded?: boolean): Promise<FileItem> {
    switch (typeof uriOr) {
      case "undefined": return Promise.resolve(new RootFileItem());
      case "object": if (uriOr instanceof FileItem) {
        return Promise.resolve(
          new EmptyFolderItem(plainMode ?
            uriOr.resourceUri! : uriOr,
            expanded
        ));
      } else { return Promise.resolve(this.fileItemManager.createFileItem(
        uriOr, plainMode, expanded
      )); }
      case "string":
      default: return Promise.resolve(this.fileItemManager.createFileItem(
        uriOr as string, plainMode, expanded
      ));
    }
  }

  private collapseItem(item: FileItem, thenRefresh: boolean = true) {
    this.expandedItem = item;

    if (thenRefresh) { this.refresh(); }
  }

  private checkIgnoredItems(itemOnly?: FileItem | undefined): boolean {
    if (!this.ignoredItems) { return true; }

    if (itemOnly) {
      const rel = itemOnly.relativePath;
      return !this.ignoredItems.folderRules.some((expr) => expr.test(rel))
          && !this.ignoredItems.fileRules.some((expr) => expr.test(rel));
    }
    
    for (const [path, ] of this.collapsingItems) {
      const folder = vscode.workspace.asRelativePath(path).replace(/\\/g, '/');
      if (this.ignoredItems.folderRules.some((expr) => expr.test(folder))) {
        this.popFromCollapsings(path);
      }
    }
    return false;
  }

  private refreshStatesFor(items: FileItem[]) {
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
    const dir = await isFolder(uri) ? uri.fsPath : fpath.dirname(uri.fsPath);
    this.collapsingItems.set(dir, { isPlain: isPlain, collapses: collapses });
  }

  private async popFromCollapsings(uriOr: vscode.Uri | string): Promise<boolean>
  {
    let dir: string;
    if (uriOr instanceof vscode.Uri) {
      dir = await isFolder(uriOr) ? uriOr.fsPath : fpath.dirname(uriOr.fsPath);
    } else {
      dir = uriOr;
    }
    return this.collapsingItems.delete(dir);
  }

  dispose() { this._onDidChangeTreeData.dispose(); }

  switchPlainModeTag() {
    vscode.commands.executeCommand(
      brand.setContext, brand.isPlain, this.plainMode
    );
  }

  releaseSelection() {
    const item = this.selectedItem[0];
    if (item instanceof FileItem) {
      this.selectedItem[0] = undefined;
      this.revealItem(item);
    }
  }

  trySelectByUri(uri: vscode.Uri) {
    const base = vscode.workspace.getWorkspaceFolder(uri);
    if (!base) { return; }

    let separator = '/';
    let itemPath = base.uri.fsPath.replace(/\\/g, separator);
    const folders = asRelative(uri).split(separator);
    this.selectedItem = [];
    
    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i];
      itemPath += `${separator}${folder}`;

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
    const config = vscode.workspace.getConfiguration(configuration());
    this.showEmptyUncollapsedFolders = config.get(boolean2Property(), true);
  }

  setShowUncollapsedPlainFolders() {
    const config = vscode.workspace.getConfiguration(configuration());
    this.showUncollapsedPlainFolders = config.get(boolean1Property(), true);
  }

  rootIsShown(shouldBeShown?: boolean | undefined): boolean {
    if (shouldBeShown !== undefined) {
      this.showingRoot = shouldBeShown;
      this.refresh();
    }
    return this.showingRoot;
  }

  revealRoot() { this.revealItem(this.root, true); }

  setIgnoredItems(items: [boolean, RegExp][]) {
    this.ignoredItems = {
      fileRules: items.flatMap(([fileRule, expr]) => fileRule ? expr : []),
      folderRules: items.flatMap(([fileRule, expr]) => fileRule ? [] : expr)
    };
  }

  resetIgnoredItems(): boolean {
    const wasSet = this.ignoredItems !== undefined;
    this.ignoredItems = undefined;
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

  // eslint-disable-next-line no-unused-vars
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
      this.fileItemManager.findAnyThen([item], items, async (replacing) => {
        const replaced = items[replacing];
        items[replacing] = await this.createFileItem(replaced, false, true);
        then?.();
      });
    const emptify = async (item: FileItem): Promise<FileItem> =>
      await this.createFileItem(item, true, false);
    const clearItemsOfEmptyElements = () =>
      items = items.filter((item) => !(item instanceof EmptyFolderItem));
    const filterItemsOfIgnoredElements = () =>
      items = items.filter(this.checkIgnoredItems);
    const addFileItem = async (uri: vscode.Uri) =>
      items.push(await this.createFileItem(uri, this.plainMode));
    const initCollapsingItemsByAllFolders = async () =>
      await Promise.all((await getAllFolders())!.map((uri) =>
        this.updateCollapsings(uri, TreeItemCollapsibleState.Collapsed, true)));
    const excludeOrEmptifyNestedPlainItems = async (colls: [string, State][]) =>
    {
      items = (await Promise.all(items.flatMap(async (it) => {
        const uri = it.resourceUri ?? vscode.Uri.file(it.label! as string);
        for (const [path, state] of colls) {
          if (state.isPlain && isInFolder(uri.fsPath, path)) {
            return uri.fsPath === path ? [await emptify(it)] : [];
          } /// emptify or exclude
        }
        return [it]; /// get existing element - nothing to change
      }))).flat();
    };
    const revealSelectedItem = () =>
    {
      const toSelect = this.selectedItem[1];
      if (toSelect) {
        const pathes = this.selectedItem.filter((i) => i !== undefined);
        this.fileItemManager.findAnyThen(pathes, items,
          async (found) => this.revealItem(items[found], !items[found].isFile)
        );
        this.fileItemManager.findThen(toSelect.toString(), items,
          (found) => this.selectedItem = [items[found]]
        );
      }
    };
    const itemMustBeRevealed = (on: { expand: boolean; focus: boolean }) =>
    {
      if (this.selectedItem.length > 1) { revealSelectedItem(); }
      
      const targetItem = on.expand ? this.expandedItem
      : on.focus ? this.focusedItem : undefined;

      if (!targetItem) { return true; }
      if (targetItem.isFile) {
        let found = false;
        this.fileItemManager.findThen(targetItem, items, (i) => {
          if (on.expand) { this.expandedItem = undefined; }
          if (on.focus) { this.focusedItem  = undefined; }

          found = true;
          this.revealItem(items[i]);
        });
        if (found) { return true; }
      }
      return false;
    };
    const refreshFilterItems = async (on: { root: boolean } = { root: true }) =>
    {
      await refreshCollapsibleStates();

      if (this.plainMode) { await filterItemsInPlainMode(on.root); }
      else { filterItemsOfIgnoredElements(); }

      itemMustBeRevealed({ expand: false, focus: true });
    };
    const collapseExpandedItem = async () =>
    {
      if (itemMustBeRevealed({ expand: true, focus: false })) { return; }

      await purify(this.expandedItem as FileItem, () => {
        this.fileItemManager.remove(this.expandedItem as FileItem,
          this.collapsingItems, () => {
            this.expandedItem = undefined;
            this.refresh();
        });
      });
    };
    const refreshCollapsibleStates = async () =>
    {
      this.refreshStatesFor(items);

      if (this.expandedItem) {
        await collapseExpandedItem();
      }
    };
    const filterItemsInPlainMode = async (root: boolean = true) =>
    {
      const getNestedComponentsArrays = async () =>
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
          } /// exclude plain folders
          return Promise.all(files.map(async ([file, ]) => {
            const uri = vscode.Uri.joinPath(collapsingUri, file); /// create uri
            let expanded: boolean | undefined; /// state to pass to a new item
            return collapsings.some(([nestedPath, nestedState]) => {
              if (uri.fsPath === nestedPath) { /// item detected in collapsings
                expanded = isExpanded(nestedState.collapses);
                return nestedState.isPlain; /// plain items shouldn't be created
              } return false; /// these items will be created and maybe expanded
            }) ?
            [] : await this.createFileItem(uri, true, expanded);
          }));
        })
      );
      if (this.uncollapsedMode[0] && this.collapsingItems.size <= 0) {
        await initCollapsingItemsByAllFolders();
      }
      this.checkIgnoredItems();
      
      await excludeOrEmptifyNestedPlainItems(
        [...this.collapsingItems.entries()]
      );
      if (!root) { filterItemsOfIgnoredElements(); return; }

      const collapsings = [...this.collapsingItems.entries()];
      const componentsArrays = await getNestedComponentsArrays();
      items.push(...componentsArrays.flat(2));
      items = items.filter(this.checkIgnoredItems);

      if (this.uncollapsedMode[0] && !this.showEmptyUncollapsedFolders) {
        items = items.filter((item) => item.isFile);
      }
    };
    const sortItemsThenCheckRoot = async(): Promise<FileItem[]> =>
    {
      if (!this.showUncollapsedPlainFolders) { clearItemsOfEmptyElements(); }

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
          await addFileItem(itemUri);
        }
        await refreshFilterItems();
        return sortItemsThenCheckRoot();
      }

      for (const folder of workspaceFolders) {
        await addFileItem(folder.uri);
      }
      await refreshFilterItems();
      return sortItemsThenCheckRoot();
    }

    const files = await vscode.workspace.fs.readDirectory(element.resourceUri!);

    for (const [name] of files) {
      const itemUri = vscode.Uri.joinPath(element.resourceUri!, name);
      await addFileItem(itemUri);
    }
    await refreshFilterItems({ root: false });
    if (!this.showUncollapsedPlainFolders) { clearItemsOfEmptyElements(); }
    
    return this.fileItemManager.sortItems(items);
  }
}
