import * as vscode from "vscode";
import * as vzcode from "../interfaces/vzcode";
import * as helper from "./foldersProviderHelper";
import * as manager from "./fileItemManager";
import { ProviderResult, TreeItemCollapsibleState } from "vscode";
import { brand } from "./extensionBrandResolver";
import { ExtensionStaticService } from "./extensionStaticService";
import { State, FoldersProviderHelper } from "./foldersProviderHelper";
import { EmptyFolderItem, emptyRoot, FileItem, root, RootFileItem
} from "./fileItem";
import {
  asRelative,
  retrieveAllFolders,
  getFolder,
  getFoldersBy,
  getUri,
  getWorkspaceFolderIndex,
  resolveUri,
  same
} from "./utilManager";

type FileItemOr = FileItem | undefined | void;

type Ignore = {
  readonly fileRules: RegExp[];
  readonly folderRules: RegExp[];
};

typeof FoldersProviderHelper;
/** @see Docs on {@link FoldersProviderHelper} */

export class FoldersViewProvider
  implements vscode.TreeDataProvider<FileItem>,
  vzcode.Changable<FileItem>,
  vzcode.Searchable,
  vscode.Disposable
{
  private didChangeTreeData: vscode.EventEmitter<FileItemOr> =
    new vscode.EventEmitter<FileItemOr>();
  readonly onDidChangeTreeData: vscode.Event<FileItemOr> =
    this.didChangeTreeData.event;

  public isEmpty: boolean = false;
  public onSearch: boolean = false;
  
  public get plainMode() { return ExtensionStaticService.plainMode; }
  public set plainMode(val: boolean) {
    if (ExtensionStaticService.plainMode !== val) {
      ExtensionStaticService.plainMode = val;
      vscode.commands.executeCommand(
        brand.setContext, brand.isPlain, this.plainMode
      );
    }
  }
  private readonly collapsingItems: Map<string, State> = new Map();
  private readonly context: vscode.ExtensionContext;
  private readonly revealItem: (item: FileItem, expand?: boolean) => void;
  /** Uncollapse-To-All mode. [A, B] : A - global, B - local */
  private uncollapsedMode: [boolean, boolean] = [false, false];
  private showingRoot: boolean = true;
  private ignoredItems: Ignore | undefined;
  private focusedItem: FileItem | undefined;
  private expandedItem: FileItem | undefined;
  private selectedItem: (FileItem | string | undefined)[] = [];
  private roots!: RootFileItem[];

  private selectedWorkspaceFolder: number = -1;
  private loadingWorkspaceFolders: Promise<any> | undefined;
  private didChangedWorkspaceFolders = 
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      this.loadingWorkspaceFolders = helper.loadWorkspaceRoots(async (load) =>
        this.roots = await load());
      });
  
  private get root() { return this.roots[this.roots.length - 1]; }
  private get workspaceFolders() {
    return vscode.workspace.workspaceFolders ?? []; }
  private get showEmptyUncollapsedFolders() {
    return ExtensionStaticService.showEmptyUncollapsedFolders; }
  private get showUncollapsedPlainFolders() {
    return ExtensionStaticService.showUncollapsedPlainFolders; }

  constructor(
    context: vscode.ExtensionContext,
    revealItem: (item: FileItem, expand?: boolean) => void
  ) {
    this.context = context;
    this.revealItem = revealItem;
    helper.setShowEmptyUncollapsedFolders();
    helper.setShowUncollapsedPlainFolders();
    
    this.loadingWorkspaceFolders =
    helper.loadWorkspaceRoots(async (load) => this.roots = await load());
    helper.loadWorkspaceContexts(this.context,
      this.updateCollapsings.bind(this),
      (mode) => (this.plainMode = mode)
    );
  }

  private check() { 
    return {
      ignored: (item: FileItem): boolean => {
        if (!this.ignoredItems) { return true; }
        if (item) {
          const rel = item.relativePath;
          return !this.ignoredItems.folderRules.some((expr) => expr.test(rel))
              && !this.ignoredItems.fileRules.some((expr) => expr.test(rel));
        }
        return false;
      },
      ignoredItems: async (): Promise<void> => {
        if (!this.ignoredItems) { return; }

        for (const [pathe] of this.collapsingItems) {
          const folder = asRelative(getUri(pathe));
          if (this.ignoredItems.folderRules.some((expr) => expr.test(folder)))
          { await this.popFromCollapsings(pathe); }
        }
      }
    };
  }

  private async updateCollapsings(
    uri: vscode.Uri,
    collapses: TreeItemCollapsibleState,
    isPlain: boolean): Promise<void>
  { const dir = (await getFolder(uri)).toString();
    this.collapsingItems.set(dir, { isPlain: isPlain, collapses: collapses });
  }

  private async popFromCollapsings(
    uriOr: vscode.Uri | string ): Promise<boolean>
  { const pathe = typeof uriOr === "string" ? uriOr : undefined;
    const dir = pathe ?? (await getFolder(uriOr as vscode.Uri)).toString();
    return this.collapsingItems.delete(dir);
  }
  
  private async collapseItem(item: FileItem): Promise<void> {
    this.expandedItem = item;
    this.expandedItem.hasExpandedState({ changeTo: false });
    if (item.resourceUri) {
      const exist = this.collapsingItems.get(item.resourceUri.toString());
      if (exist) {
        await this.updateCollapsings(
          item.resourceUri, TreeItemCollapsibleState.Collapsed, exist.isPlain
        );
      }
    }
    this.refresh();
  }

  public async changeTreeItem(
    fileItem: FileItem,
    oldUri: vscode.Uri
  ): Promise<void> {
    const exist = this.collapsingItems.get(oldUri.toString());
    const newUri = fileItem.resourceUri;
    if (fileItem.isFile || !newUri) { return; }

    const changeCollapsingUri = (target: vscode.Uri, state: State) =>
    { const uri = manager.changeUri(target, newUri, oldUri);
      if (uri) {
        updated.push({ target: target, state, new: uri });
      }
    };
    const updated: { target: vscode.Uri; state: State; new: vscode.Uri }[] = [];

    if (exist) { changeCollapsingUri(oldUri, exist); }
    for (const [pathe, state] of this.collapsingItems) {
      const targetUri = getUri(pathe);
      if (same(targetUri, oldUri)) { continue; }
      if (manager.check(targetUri).isChildOf(oldUri)) {
        changeCollapsingUri(targetUri, state);
      }
    }
    for (const u of updated) {
      await this.popFromCollapsings(u.target.toString());
      await this.updateCollapsings(u.new, u.state.collapses, u.state.isPlain);
    }
  }

  public dispose() {
    this.didChangedWorkspaceFolders.dispose();
    this.didChangeTreeData.dispose();
  }

  public setWorkspaceFolderFrom(itemOr: FileItem | vscode.Uri | string) {
    const uri = itemOr instanceof FileItem ?
      itemOr.resourceUri! : getUri(itemOr);
    const number = getWorkspaceFolderIndex(uri);
    if (number >= 0) {
      this.selectedWorkspaceFolder = number;
    }
  }

  public prepareState(fileItem: FileItem) {
    helper.refreshStatesFor(fileItem, this.collapsingItems);
  }

  public prepareLabel(fileItem: FileItem) {
    fileItem.setLabel();
  }

  public canBeCreated(withUri: vscode.Uri | undefined) {
    if (withUri) {
      const plain = this.collapsingItems.get(withUri.toString())?.isPlain;
      return plain !== true;
    }
    return true;
  }

  public releaseSelection() {
    const item = this.selectedItem[0];
    if (item instanceof FileItem) {
      this.selectedItem[0] = undefined;
      this.revealItem(item);
    }
  }

  public trySelectByUri(uri: vscode.Uri) {
    const oldSelectedItem = this.selectedItem;
    this.selectedItem = [];

    const newSelectedItem = getFoldersBy(uri, (stepUri, isLast) =>
    {
      this.selectedItem.push(stepUri.toString());
      const exist = this.collapsingItems.get(stepUri.toString());

      if (!isLast && (!exist || exist.isPlain === false)) {
        this.updateCollapsings(stepUri,
          TreeItemCollapsibleState.Expanded, false);
      }
    });

    if (!newSelectedItem) {
      this.selectedItem = oldSelectedItem;
      return;
    }
    this.selectedItem = [undefined, ...newSelectedItem.reverse()];
    this.refresh();
  }

  public rootIsShown(shouldBeShown?: boolean | undefined): boolean {
    if (shouldBeShown !== undefined) {
      this.showingRoot = shouldBeShown;
      this.refresh();
    }
    return this.showingRoot;
  }

  public revealRoot() { this.revealItem(this.root, true); }

  public setIgnoredItems(items: [boolean, RegExp][]) {
    this.ignoredItems = {
      fileRules: items.flatMap(([fileRule, expr]) => fileRule ? expr : []),
      folderRules: items.flatMap(([fileRule, expr]) => fileRule ? [] : expr)
    };
  }

  public resetOrNotIgnoredItems(): boolean {
    const restored = this.ignoredItems !== undefined;
    this.ignoredItems = undefined;
    vscode.commands.executeCommand(
      brand.setContext, brand.isIgnored, !restored
    );

    return restored;
  }

  public addCollapsingElement(element: FileItem) {
    element.hasExpandedState({ changeTo: true });

    if (element.resourceUri) {
      const collapsing = element.resourceUri.toString();
      const isPlain = this.collapsingItems.get(collapsing)?.isPlain;
      this.updateCollapsings(
        element.resourceUri,
        element.collapsibleState!,
        isPlain ?? false
      );
    }
  }

  public removeCollapsingElement(element: FileItem) {
    element.hasExpandedState({ changeTo: false });
    
    if (element.resourceUri) {
      const collapsing = element.resourceUri.toString();
      const isPlain = this.collapsingItems.get(collapsing)?.isPlain;
      if (!isPlain) {
        this.popFromCollapsings(element.resourceUri);
      }
    }
  }
  
  public refresh(element?: FileItem): void {
    this.didChangeTreeData.fire(element);

    if (!this.uncollapsedMode[1]) {
      helper.saveWorkspaceContexts(
        this.context, this.plainMode, this.collapsingItems
      );
    }
  }

  public getTreeItem(element: FileItem): FileItem | Thenable<FileItem> {
    return element;
  }

  public getParent?(_element: FileItem): ProviderResult<FileItem> {
    return;
  }

  public couldUncollapseAll(value: boolean) {
    if (value) {
      if (!this.uncollapsedMode[1]) {
        helper.saveWorkspaceContexts(
          this.context, this.plainMode, this.collapsingItems
        );
      }
      this.plainMode = true;
      this.uncollapsedMode = [true, true];
      this.collapsingItems.clear();
    } else {
      if (this.uncollapsedMode[1]) {
        this.uncollapsedMode = [false, false];
        this.collapsingItems.clear();
        helper.loadWorkspaceContexts(this.context,
          this.updateCollapsings.bind(this)
        );
      }
    }
    this.refresh();
  }

  public async collapseOrUncollapseItem(item: FileItem): Promise<void> {
    const expanded: boolean | undefined = item.hasExpandedState();

    if (this.plainMode) {
      if (!item.isFile && (!expanded || await item.isEmpty())) {
        this.revealItem(item, true); /// if collapsed or empty folder - expand
        return;
      }
      const uri = await helper.getFolder(item); /// get folder
      const exists = this.collapsingItems.get(uri.toString());

      if (exists && exists.isPlain) { /// go back to classic mode for the item
        if (item instanceof EmptyFolderItem || item.isFile) { /// set not plain
          this.updateCollapsings(uri, TreeItemCollapsibleState.Expanded, false);
        }
      } else { /// otherwise - uncollapse the folder to plain mode
        this.updateCollapsings(uri, TreeItemCollapsibleState.Expanded, true);
        this.focusedItem = item;
      }
      this.refresh();
    } else if (expanded) {
      this.collapseItem(item); /// save item as expanded
    } else {
      this.revealItem(item, true); /// expand item and nothing else to do
    }
    this.uncollapsedMode[0] = false;
  }

  public async getChildren(element?: FileItem): Promise<FileItem[]>
  {
    const purify = <T extends FileItem>(item: T, then?: () => any) =>
      manager.findAnyThen([item], items, async (replacing) => {
        const replaced = items[replacing];
        items[replacing] = await helper.createTreeItem(replaced, true);
        then?.();
      });
    const emptify = async (item: FileItem) =>
      await helper.createTreeItem(item, false);
    const clearItemsOfEmptyElements = () =>
      items = items.filter((item) => !(item instanceof EmptyFolderItem));
    const filterItemsOfIgnoredElements = () =>
      items = items.filter(this.check().ignored);
    const addFileItem = async (uri: vscode.Uri) =>
      items.push(await helper.createTreeItem(
        uri, helper.getExpandingStateFor(uri, this.collapsingItems)));
    const uncollapsedModeNotSetButShould = () =>
      this.uncollapsedMode[0] && this.collapsingItems.size <= 0;
    const initCollapsingItemsByAllSubFoldersOf = async (wsFolder: number) =>
      await Promise.all((await retrieveAllFolders(wsFolder))!.map((uri) =>
        this.updateCollapsings(uri, TreeItemCollapsibleState.Collapsed, true)));
    const isWorkspaceFolder = (item: FileItem) =>
      this.workspaceFolders.some((f) => item.like(f.uri.toString()));
    const hideEmptyFoldersOnSelectedWorkspace = () =>
    {
      let checked = false;
      const check = (item: FileItem) => {
        if (manager.check(item).isChildOf(folder.uri)) {
          checked = true; return item.isFile;
        } else { return true; }
      };
      let  folder = this.workspaceFolders[this.selectedWorkspaceFolder];
      if  (folder) { items = items.filter(check); }
      if (checked) { this.selectedWorkspaceFolder = -1; }
    };
    const excludeOrEmptifyNestedPlainItems = async (colls: [string, State][]) =>
    {
      items = (await Promise.all(items.flatMap(async (item) => {
        const uri = item.resourceUri ?? await resolveUri(item.getLabel());
        for (const [pathe, state] of colls) {
          const child = uri.toString();
          const parent = manager.getParent(uri).toString();
          if (state.isPlain && (same(child, pathe) || same(parent, pathe))) {
            return same(child, pathe) ? [await emptify(item)] : [];
          } /// emptify or exclude
        }
        return [item]; /// get existing element - nothing to change
      }))).flat();
    };
    const revealSelectedItem = () =>
    {
      const toSelect = this.selectedItem[1]; /// the first is undefined
      if (toSelect) {
        const pathes = this.selectedItem.filter((i) => i !== undefined);
        manager.findAnyThen(pathes, items,
          async (found) => this.revealItem(items[found], !items[found].isFile)
        );
        manager.findThen(toSelect.toString(), items,
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
        manager.findThen(targetItem, items, (i) =>
        {
          if (on.expand) { this.expandedItem = undefined; }
          if (on.focus) { this.focusedItem  = undefined; }

          found = true;
          this.revealItem(items[i]);
        });
        if (found) { return true; }
      }
      return false;
    };
    const refreshAndFilterItems = async (on: {root: boolean} = {root: true}) =>
    {
      if (this.expandedItem) { await collapseExpandedItem(); }
      if (on.root && helper.isTimeToRefreshStates()) {
        helper.refreshStatesFor(items, this.collapsingItems);
      }

      if (this.plainMode) { await filterItemsInPlainMode(on.root); }
      else { filterItemsOfIgnoredElements(); }

      itemMustBeRevealed({ expand: false, focus: true });

      if (!this.showUncollapsedPlainFolders) {
        clearItemsOfEmptyElements();
      }
    };
    const collapseExpandedItem = async () =>
    {
      if (itemMustBeRevealed({ expand: true, focus: false })) { return; }
      if (this.expandedItem) {
        await purify(this.expandedItem, async () => {
          this.expandedItem = undefined;
          this.refresh();
        });
      }
    };
    const hideFoldersIfDontNeedThem = () =>
    {
      if (this.uncollapsedMode[0]) {
        if (!this.showEmptyUncollapsedFolders) {
          if (this.selectedWorkspaceFolder >= 0) {
            hideEmptyFoldersOnSelectedWorkspace();
          }
        } else { this.selectedWorkspaceFolder = -1; }
      }
    };
    const filterItemsInPlainMode = async (rooted: boolean = true) =>
    { /* ----------------------------------------------------------------- */
      const getNestedComponentsArrays = async () =>
        await Promise.all(collapsings.map(async ([path, state]) => {
          if (!state.isPlain) { return []; }
          /// get all nested files and folders excluding plain folders
          const collapsingUri = getUri(path);
          let  files: [string, vscode.FileType][];
          try {files = await vscode.workspace.fs.readDirectory(collapsingUri); }
          catch (error) {
            this.popFromCollapsings(collapsingUri);
            files = [];
          } /// exclude plain folders
          const elements = await Promise.all(files.map(async ([file]) => {
            let uri = vscode.Uri.joinPath(collapsingUri, file); /// create uri
            let expanded: boolean | undefined; /// state to pass to a new item
            return collapsings.some(([nestedPath, nestedState]) => {
              if (same(uri, nestedPath)) { /// detected in collapsings
                expanded = helper.isExpanded(nestedState.collapses);
                return nestedState.isPlain; /// plain items shouldn't be created
              } return false; /// these items will be created and maybe expanded
            }) ?
            [] : [await helper.createTreeItem(uri, expanded)];
          }));
          return elements;
        })
      ).then((resolved) => resolved.flat(2).filter((it) => helper.real(it)));
      /* ----------------------------------------------------------------- */
      if (uncollapsedModeNotSetButShould()) { /// launches uncollapse-all mode
        if (this.selectedWorkspaceFolder >= 0) {
          await initCollapsingItemsByAllSubFoldersOf(
            this.selectedWorkspaceFolder
          );
        }
      }
      /* ----------------------------------------------------------------- */
      await this.check().ignoredItems();
      await excludeOrEmptifyNestedPlainItems(
        [...this.collapsingItems.entries()]
      );
      if (!rooted) { filterItemsOfIgnoredElements(); return; }

      const collapsings = [...this.collapsingItems.entries()];
      const componentsArrays = await getNestedComponentsArrays();
      const components = [...componentsArrays.flat()];

      items.push(...components.filter(
        (item) => element ? manager.check(item).isChildOf(element) : true)
      );
      filterItemsOfIgnoredElements();
      hideFoldersIfDontNeedThem();
    };
    const withRoot = (sorted: FileItem[], rootIndex: number = 0): FileItem[] =>
    {
      if (this.showingRoot) {
        this.roots[rootIndex].contextValue = this.isEmpty ? emptyRoot : root;
        sorted.push(this.roots[rootIndex]);
      }
      return sorted;
    };
    /*-----------------------------------------------------------------------*/
    let items: FileItem[] = [];
    await this.loadingWorkspaceFolders;

    if (!element) {
      if (this.workspaceFolders.length === 1)
      {
        const files = await vscode.workspace.fs.readDirectory(
          this.workspaceFolders[0].uri
        );
        for (const [name] of files) {
          const uri = vscode.Uri.joinPath(this.workspaceFolders[0].uri, name);
          await addFileItem(uri);
        }
        await refreshAndFilterItems();
        const sorted = manager.sortItems(items);

        return withRoot(sorted);
      }

      for (const folder of this.workspaceFolders) {
        await addFileItem(folder.uri);
      }
      this.isEmpty = this.workspaceFolders.length <= 0;

      await refreshAndFilterItems({ root: false });
      const sorted = manager.sortItems(items);

      return this.isEmpty ? withRoot(sorted) : sorted;
    }

    const files = await vscode.workspace.fs.readDirectory(element.resourceUri!);
    for (const [name] of files) {
      const itemUri = vscode.Uri.joinPath(element.resourceUri!, name);
      await addFileItem(itemUri);
    }
    await refreshAndFilterItems({ root: isWorkspaceFolder(element) });

    const rootIndex = this.roots.findIndex((root) => root.like(element));
    const sorted = manager.sortItems(items);

    return rootIndex >= 0 ? withRoot(sorted, rootIndex) : sorted;
    /*-----------------------------------------------------------------------*/
  }
}
