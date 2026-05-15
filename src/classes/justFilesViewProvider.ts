import * as vscode from "vscode";
import * as vzcode from "../interfaces/vzcode";
import * as manager from "./fileItemManager";
import { ExtensionStaticService } from "./extensionStaticService";
import { FileItem, PlaceholderItem } from "./fileItem";
import { /* getConfigurationsFor, */ getFoldersBy, getPathDepth, isValidUri
} from "./utilManager";
import { LogService } from "./logService";
import { brand } from "./extensionBrandResolver";
import { Leaf } from "./justFilesProviderHelper";

//const empty = '' as const;
const dot = '.' as const;

const cleanupInterval = 60000 as const;

type JustFilesItemOr = FileItem | PlaceholderItem | undefined;
type JustFilesItem = FileItem | PlaceholderItem;

export class JustFilesViewProvider
  implements vscode.TreeDataProvider<FileItem | PlaceholderItem>,
  vzcode.Changable<FileItem>,
  vzcode.Searchable,
  vscode.Disposable
{
  private didChangeTreeData: vscode.EventEmitter<JustFilesItemOr> =
    new vscode.EventEmitter<FileItem | undefined>();
  public readonly onDidChangeTreeData: vscode.Event<JustFilesItemOr> =
    this.didChangeTreeData.event;

  public onSearch: boolean = false;
  public sortedMode: boolean = false;

  public get heads(): (FileItem | undefined)[] {
    return Array
      .from(this.leaves.values())
      .filter((leaf) => leaf.isRootOn(this.leaves))
      .map((leaf) => leaf.item);
  }
  
  private hidden: Set<string> = new Set();
  private leaves: Map<string, Leaf> = new Map();
  private switchable: boolean = false;
  private addonQueue: Promise<void> = Promise.resolve();
  private cleanupQueue: Promise<void> = Promise.resolve();
  private cleanupTimer;
  
  private readonly pushing: (path: string) => number;
  private readonly context: vscode.ExtensionContext;

  private get plainMode() { return ExtensionStaticService.plainMode; }

  constructor(context: vscode.ExtensionContext) {
    this.cleanupTimer = setTimeout(() => this.cleanupTask(), cleanupInterval);
    this.context = context; console.log(this.context);
    this.pushing = getPathDepth;
    /* const setItems = async (key: string, setter: (items: FileItem[]) => void) =>
      setter(await manager.createFileItems(
        getConfigurationsFor(this.context, key).map(([path, ]) => path))
      );
    Promise.all([

    ]).finally(() => this.refresh()); */
  }

  private cleanupTask() {
    const runTask = async () => {
      try { await this.cleanup(); }
      catch (err) { LogService.error(err); }
      finally {
        clearTimeout(this.cleanupTimer);
        this.cleanupTimer = setTimeout(runTask, cleanupInterval);
      }
    };
    this.cleanupQueue = runTask();
  }

  private async cleanup(): Promise<void> {
    const res: [string, number][] = [];
    const now = Date.now();
    for (const leaf of this.leaves.values()) {
      if (leaf.opened !== 0 && now - leaf.opened > cleanupInterval / 2) {
        leaf.children.forEach((childId) => this.pushById(childId, res));
      }
    }
    res.sort((a, b) => b[1] - a[1]);
    res.forEach(([id]) => this.leaves.delete(id));
  }

  private async createHiddenChildren(leaf: Leaf, id: string): Promise<void> {
    await leaf.createChildren();
    for (const childId of leaf.children) {
      if (childId !== id) {
        this.hidden.add(childId);
      }
    }
  }

  private async createParent(leaf: Leaf, hiddenId?: string): Promise<void> {
    const parentLeaf = new Leaf(leaf.parent);
    const parentId = await parentLeaf.getId();
    
    if (parentId === dot) { return; }
    if (!this.leaves.has(parentId)) {
      this.leaves.set(parentId, parentLeaf);
      const id = await leaf.getId();

      if (hiddenId) {
        await this.createHiddenChildren(parentLeaf, id);
      }
      const hiddenParent = hiddenId && parentId !== id ? hiddenId : undefined;
      await this.createParent(parentLeaf, hiddenParent);
    }
    this.hidden.delete(parentId);
  }

  private async setupParentsFor(leaf: Leaf): Promise<void> {
    const rootId = await leaf.getId();
    const parents = getFoldersBy(rootId);
    parents?.pop();
    
    if (parents && parents.some((folder) => this.leaves.has(folder))) {
      const hidden = parents.find((parent) => this.hidden.has(parent));
      await this.createParent(leaf, hidden);
    }
  }
  
  private async setupChildrenFor(leaf: Leaf, force?: boolean): Promise<void> {
    const canCreate = leaf.children.length === 0 || force;
    const shouldCreate = leaf.isFolder() && canCreate;
    if (shouldCreate) { await leaf.createChildren(); }

    await this.cleanupQueue;

    let unchanged = true;
    const allowed = leaf.children.filter((child) => !this.hidden.has(child));
    const children = await Promise.all(allowed.map(async (child) => {
      const exist = this.leaves.get(child);
      if (exist) {
        exist.parent = await leaf.getId();
        return exist;
      }
      unchanged = false;
      return new Leaf(child);
    }));
    if (!unchanged) {
      for (const childLeaf of children) {
        this.leaves.set(await childLeaf.getId(), childLeaf);
      }
    }
  }

  private removeDistantDescendantsOf(id: string) {
    for (const [leafId, leaf] of this.leaves) {
      if (leaf.parent !== id && leaf.parent.startsWith(id)) {
        this.leaves.delete(leafId);
      }
    }
  }

  private removeHiddenDescendantsOf(id: string) {
    for (const hiddenId of this.hidden) {
      if (hiddenId.startsWith(id)) {
        this.hidden.delete(hiddenId);
      }
    }
  }

  private pushById(id: string, where: [string, number][]) {
    const leaf = this.leaves.get(id);
    if (leaf) {
      for (const childId of leaf.children) {
        this.pushById(childId, where);
      };
      where.push([id, this.pushing(id)]);
    }
  }

  private removeById(id: string) {
    const leaf = this.leaves.get(id);
    if (leaf) {
      for (const childId of leaf.children) {
        this.removeById(childId);
      };
      this.leaves.delete(id);
    }
    this.hidden.delete(id);
  }

  private unhideById(id: string) {
    const leaf = this.leaves.get(id);
    if (leaf) {
      for (const childId of leaf.children) {
        this.unhideById(childId);
      };
    }
    this.hidden.delete(id);
  }

  private switchItemsInSortedMode() {
    if (!this.plainMode) { this.switchable = false; }
    if (this.plainMode && this.sortedMode) { this.switchable = true; }
    if (!this.switchable) { return; }

    const mode = this.sortedMode;
    for (const leaf of this.leaves.values()) {
      if (leaf.item && leaf.item.isFile) {
        leaf.item.setLabel(this.plainMode, { sorted: mode });
      }
    }
  }

  public async addFileItem(fileItem: FileItem): Promise<void> {
    this.addonQueue = this.addonQueue.then(async () => {
      const exist = this.leaves.get(fileItem.id);
      const root = exist ?? new Leaf(fileItem);
      await root.validateState();
      const rootId = await root.getId();

      if (!exist) { await this.setupParentsFor(root); }
      if (root.isFolder()) {
        this.removeHiddenDescendantsOf(rootId);
        this.removeDistantDescendantsOf(rootId);
      }
      this.unhideById(rootId);
      this.leaves.set(rootId, root);
      
      await this.setupChildrenFor(root, !exist);
    });
    return this.addonQueue;
  }

  public removeFileItem(fileItemOr: FileItem | vscode.Uri) {
    const rootId = fileItemOr instanceof FileItem ?
      fileItemOr.id : fileItemOr.toString(); 
    const root = this.leaves.get(rootId);
    if (!root) { return; }
    
    this.removeById(rootId);

    if (!root.isRootOn(this.leaves)) {
      this.hidden.add(rootId);
    }
  }

  public async deleteItem(item: vscode.Uri): Promise<void> {
    this.removeFileItem(item);
  }

  public clean() {
    this.leaves.clear();
    this.hidden.clear();
    this.refresh();
  }

  public dispose() {
    clearTimeout(this.cleanupTimer);
    this.didChangeTreeData.dispose();
  }

  public switchSortedModeTag() {
    vscode.commands.executeCommand(
      brand.setContext, brand.isSorted, this.sortedMode
    );
  }

  public async expandElement(element: FileItem): Promise<void> {
    const root = this.leaves.get(element.id);
    if (root) { await root.expand(); }
  }

  public collapseElement(element: FileItem) {
    const root = this.leaves.get(element.id);
    if (root) { root.collapse(); }
  }

  public refresh(element?: FileItem) {
    const leaf = this.leaves.get(element?.id ?? '_');
    if (leaf) { this.setupChildrenFor(leaf, true); }

    this.didChangeTreeData.fire(element);
  }

  public getTreeItem(element: FileItem): JustFilesItem {
    if (element instanceof PlaceholderItem) {
      element.label = undefined; 
      element.command = undefined;
    }
    return element;
  }

  public async getChildren(element?: FileItem): Promise<JustFilesItem[]>
  {
    if (!element?.id) {
      if (this.heads.length === 0) {
        return Promise.resolve([new PlaceholderItem()]);
      }
      this.switchItemsInSortedMode();
      
      return manager.sortItems(
        this.heads.filter((item) => item !== undefined),
        this.sortedMode
      );
    }
    const leaf = this.leaves.get(element.id);
    if (!leaf) { return[]; }

    await this.setupChildrenFor(leaf);

    const items = leaf.children.flatMap((child) => {
      const item = this.leaves.get(child)?.item;
      return item ? [item] : [];
    });
    this.switchItemsInSortedMode();

    return manager.sortItems(items, this.sortedMode);
  }

  public changeTreeItem(fileItem: FileItem, oldUri: vscode.Uri) {
    const newUri = fileItem.resourceUri;
    if (!newUri) { return; }

    const toRefresh: FileItem[] = [];
    const allItems = [...this.leaves].flatMap(([_, leaf]) => leaf.item ? [leaf.item] : []);
    allItems.forEach((it) => {
      if (manager.check(it).isChildOf(oldUri)) {
        manager.changeUri(it, newUri, oldUri);
        toRefresh.push(it);
      }
    });
    const found = allItems.find((it) => it.like(oldUri.toString()));
    if (found) {
      manager.changeUri(found, newUri, oldUri);
      toRefresh.push(found);
    } else if (allItems.find((it) => it.like(fileItem))) {
      toRefresh.push(fileItem);
    } else {
      allItems.forEach((it) => {
        if (manager.check(oldUri).isChildOf(it)) {
          toRefresh.push(it);
        }
      });
    }
    if (toRefresh.length > 1) { this.refresh(); }
    else if (toRefresh.length === 1) { this.refresh(toRefresh[0]); }
  }

  public async refreshIfExistsFileItemByUri(uri: vscode.Uri): Promise<void> {
    const found = this.heads.find((item) => item?.like(uri.toString()));
    if (await isValidUri(uri) || !found) {
      this.refresh(found);
    }
  }
}
/*
export class JustFilesViewProvider
  implements vscode.TreeDataProvider<FileItem | PlaceholderItem>,
  vscode.Searchable,
  vscode.Disposable
{
  private _onDidChangeTreeData: vscode.EventEmitter<JustFilesItemOr> =
    new vscode.EventEmitter<FileItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<JustFilesItemOr> =
    this._onDidChangeTreeData.event;

  public onSearch: boolean = false;
  public sortedMode: boolean = false;

  private displayedFileItems: FileItem[] = [];
  private hiddenFileItems: FileItem[] = [];
  private subDisplayedFileItems: FileItem[] = [];
  private subHiddenFileItems: FileItem[] = [];
  private fileItemManager = new FileItemManager();

  constructor(private readonly context: vscode.ExtensionContext) {
    const setItems = async (key: string, setter: (items: FileItem[]) => void) =>
      setter(await manager.createFileItems(
        getConfigurationsFor(this.context, key).map(([path, ]) => path))
      );
    Promise.all([
      setItems(displayed, (value) => this.displayedFileItems = value),
      setItems(hidden, (value) => this.hiddenFileItems = value),
      setItems(subDisplayed, (value) => this.subDisplayedFileItems = value),
      setItems(subHidden, (value) => this.subHiddenFileItems = value)
    ]).finally(() => this.refresh());
  }

  private isFileItemInArray(fileItem: FileItem, array: FileItem[]): boolean {
    return array.some((item) => item.like(fileItem));
  }

  private isParentOfArray(
    parentFileItem: FileItem, childrenFileItems: FileItem[]
  ): boolean {
    return childrenFileItems.some((item) =>
      manager.isChildOf(item, parentFileItem)
    );
  }

  private isChildOfArray(
    childFileItem: FileItem,
    parentFileItems: FileItem[]
  ): boolean {
    return parentFileItems.some(
      (item) => manager.isChildOf(childFileItem, item)
    );
  }
  
  private addDisplayFileItem(item: FileItem) {
    if (!this.isFileItemInArray(item, this.displayedFileItems)) {
      this.displayedFileItems.push(item);
    }
  }

  private async addSubNode(fileItem: FileItem): Promise<void> {
    if (this.isSubItemAlreadyDisplayed(fileItem)) {
      this.cleanFileItemChildren(fileItem);

      return;
    }
    this.addSubDisplayedItem(fileItem);
    this.removeHideFileItem(fileItem);
    this.removeSubHiddenFileItem(fileItem);
    this.cleanFileItemChildren(fileItem);

    const parent = manager.getParentInArray(
      fileItem, this.displayedFileItems
    );
    if (parent) {
      const routes = manager.getDirectoriesUntilParent(
        fileItem.resourceUri?.fsPath || empty,
        parent.resourceUri?.fsPath || empty
      );
      for (const path of routes) {
        const parentItem = await manager.createFileItem(path);
        const siblingsAll = await manager.getSiblings(parentItem);
        const siblings = siblingsAll.filter((item) => 
             !this.isFileItemInArray(item, this.subDisplayedFileItems)
          && !this.isParentOfArray(item, this.subDisplayedFileItems)
        );
        siblings.forEach((item) => {
          if (!this.isSubItemAlreadyDisplayed(item)) {
            this.addSubHiddenFileItem(item);
          }
        });

        if (this.isFileItemInArray(parentItem, this.hiddenFileItems)) {
          this.removeHideFileItem(parentItem);
        }
        this.addSubDisplayedItem(parentItem);
      }
    }
  }

  private addSubDisplayedItem(item: FileItem) {
    this.removeSubHiddenFileItem(item);
    if (!this.isFileItemInArray(item, this.subDisplayedFileItems)) {
      this.subDisplayedFileItems.push(item);
    }
  }

  private addSubHiddenFileItem(item: FileItem) {
    if (this.isFileItemInArray(item, this.subDisplayedFileItems)) {
      this.removeSubFileItem(item);
      this.cleanFileItemChildren(item);

      return;
    }

    if  (!this.isFileItemInArray(item, this.subHiddenFileItems) 
      && !this.isFileItemInArray(item, this.hiddenFileItems)) {
      this.subHiddenFileItems.push(item);
    }
  }
  
  private addMainNode(item: FileItem) {
    if (this.isParentOfArray(item, this.displayedFileItems))
    {
      const childrenItems = this.displayedFileItems.filter((it) =>
        manager.isChildOf(it, item)
      );
      childrenItems.forEach((it) => {
        this.removeFileItem(it);
        this.addSubDisplayedItem(it);
      });
    }
    this.removeHideFileItem(item);
    this.removeSubFileItem(item);
    this.cleanFileItemChildren(item);
    this.addDisplayFileItem(item);
  }

  private async removeNotFiles() : Promise<void> {
    await Promise.all([...this.hiddenFileItems].map(async (item) => {
      if (! await isValidUri(item.resourceUri?.fsPath)) {
        this.removeHideFileItem(item);
      }
    }));
    await Promise.all([...this.displayedFileItems].map(async (item) => {
      if (! await isValidUri(item.resourceUri?.fsPath)) {
        this.removeFileItem(item);
      }
    }));
    await Promise.all([...this.subHiddenFileItems].map(async (item) => {
      if (! await isValidUri(item.resourceUri?.fsPath)) {
        this.removeSubHiddenFileItem(item);
      }
    }));
    await Promise.all([...this.subDisplayedFileItems].map(async (item) => {
      if (! await isValidUri(item.resourceUri?.fsPath)) {
        this.removeSubFileItem(item);
      }
    }));
  }

  private cleanFileItemChildren(item: FileItem) {
    const hiddenFileItems = [...this.hiddenFileItems];
    hiddenFileItems.map((hiddenItem) => {
      if (manager.isChildOf(hiddenItem, item)) {
        this.removeHideFileItem(hiddenItem);
      }
    });
    const subHiddenFileItems = [...this.subHiddenFileItems];
    subHiddenFileItems.map((subHiddenItem) => {
      if (manager.isChildOf(subHiddenItem, item)) {
        this.removeSubHiddenFileItem(subHiddenItem);
      }
    });
    const subDisplayedFileItems = [...this.subDisplayedFileItems];
    subDisplayedFileItems.map((subItem) => {
      if (manager.isChildOf(subItem, item)) {
        this.removeSubFileItem(subItem);
      }
    });
  }

  private isSubItemAlreadyDisplayed(item: FileItem): boolean {
    const isInHiddenItems = this.isFileItemInArray(item, 
      this.hiddenFileItems
    );
    const isInSubHiddenItems = this.isFileItemInArray(item, 
      this.subHiddenFileItems
    );
    const isChildOfHiddenItems = this.isChildOfArray(item,
      this.hiddenFileItems
    );
    const isChildOfSubHiddenItems = this.isChildOfArray(item,
      this.subHiddenFileItems
    );

    return !(
      isInHiddenItems ||
      isInSubHiddenItems ||
      isChildOfHiddenItems ||
      isChildOfSubHiddenItems
    );
  }

  private removeHideFileItem(item: FileItem | vscode.Uri) {
    const uri = item instanceof FileItem ? item.resourceUri : item;
    const index = this.hiddenFileItems.findIndex(
      (it) => uri && it.like(uri.fsPath)
    );
    if (index > -1) {
      this.hiddenFileItems.splice(index, 1);
    }
  }

  private removeSubHiddenFileItem(item: FileItem | vscode.Uri) {
    const uri = item instanceof FileItem ? item.resourceUri : item;
    const index = this.subHiddenFileItems.findIndex(
      (it) => uri && it.like(uri.fsPath)
    );
    if (index > -1) {
      this.subHiddenFileItems.splice(index, 1);
    }
  }

  private removeSubFileItem(item: FileItem | vscode.Uri) {
    const uri = item instanceof FileItem ? item.resourceUri : item;
    const index = this.subDisplayedFileItems.findIndex(
      (it) => uri && it.like(uri.fsPath)
    );
    if (index > -1) {
      this.subDisplayedFileItems.splice(index, 1);
    }
  }

  private removeFileItem(item: FileItem | vscode.Uri) {
    const uri = item instanceof FileItem ? item.resourceUri : item;
    const index = this.displayedFileItems.findIndex(
      (it) => uri && it.like(uri.fsPath)
    );
    if (index > -1) {
      this.displayedFileItems.splice(index, 1);
    }
  }

  dispose() { this._onDidChangeTreeData.dispose(); }

  switchSortedModeTag() {
    vscode.commands.executeCommand(
      brand.setContext, brand.isSorted, this.sortedMode
    );
  }

  clean() {
    this.displayedFileItems = [];
    this.hiddenFileItems = [];
    this.subDisplayedFileItems = [];
    this.subHiddenFileItems = [];
  }
  
  refresh(element?: FileItem) {
    const asPaths = (items: FileItem[]) => items.map(i => i.resourceUri?.fsPath);

    this.removeNotFiles().then(() =>
      this._onDidChangeTreeData.fire(element)
    ).finally(() => {
      this.context.workspaceState.update(displayed, 
        asPaths(this.displayedFileItems));
      this.context.workspaceState.update(hidden,
        asPaths(this.hiddenFileItems));
      this.context.workspaceState.update(subDisplayed,
        asPaths(this.subDisplayedFileItems));
      this.context.workspaceState.update(subHidden, 
        asPaths(this.subHiddenFileItems));
    });
  }

  async refreshIfExistsFileItemByUri(uri: vscode.Uri): Promise<void> {
    const found = this.displayedFileItems.find((it) => it.like(uri.fsPath));
    if (await isValidUri(uri) || !found) {
      this.refresh(found);
    }
  }
  
  async addFileItem(fileItem: FileItem): Promise<void> {
    const isChildFile = this.isChildOfArray(fileItem, this.displayedFileItems);
    if (!isChildFile) {
      this.addMainNode(fileItem);
      return;
    }
    await this.addSubNode(fileItem);
  }

  addHideFileItem(item: FileItem) {
    if (this.isFileItemInArray(item, this.displayedFileItems)) {
      this.removeFileItem(item);
      this.cleanFileItemChildren(item);

      return;
    }

    if  (!this.isFileItemInArray(item, this.hiddenFileItems)
      && !this.isFileItemInArray(item, this.subHiddenFileItems)) {
      this.hiddenFileItems.push(item);
      this.cleanFileItemChildren(item);
    }
  }
  
  changeFileItem(item: FileItem, oldUri: vscode.Uri) {
    const toRefresh: FileItem[] = [];
    const allItems = [
      ...this.displayedFileItems,
      ...this.subDisplayedFileItems,
      ...this.hiddenFileItems,
      ...this.subHiddenFileItems
    ];
    allItems.forEach((it) => {
      if (manager.isChildOf(it, oldUri)) {
        manager.changeUri(it, item, oldUri);
        toRefresh.push(it);
      }
    });
    const found = allItems.find((it) => it.like(oldUri.fsPath));
    if (found) {
      manager.changeUri(found, item, oldUri);
      toRefresh.push(found);
    } else if (allItems.find((it) => it.like(item))) {
      toRefresh.push(item);
    } else {
      this.displayedFileItems.forEach((it) => {
        if (manager.isChildOf(oldUri, it)) {
          toRefresh.push(it);
        }
      });
    }
    if (toRefresh.length > 1) { this.refresh(); }
    else if (toRefresh.length === 1) { this.refresh(toRefresh[0]); }
  }

  removeItemFromJustFiles(item: FileItem) {
    this.removeFileItem(item);
    this.removeHideFileItem(item);
    this.removeSubFileItem(item);
    this.removeSubHiddenFileItem(item);
  }

  getTreeItem(element: FileItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
    if (element instanceof PlaceholderItem) {
      element.label = undefined; 
      element.command = undefined;
    }
    
    return element;
  }

  async getChildren(element?: FileItem): Promise<(FileItem | PlaceholderItem)[]> {
    if (!element) {
      if (this.displayedFileItems.length === 0) {
          return Promise.resolve([new PlaceholderItem()]);
      }
      
      return manager.sortItems(
        this.displayedFileItems, this.sortedMode
      );
    }

    const files = await vscode.workspace.fs.readDirectory(element.resourceUri!);
    let items: FileItem[] = [];

    for (const [name] of files) {
      const itemPath = vscode.Uri.joinPath(element.resourceUri!, name);
      const item = await manager.createFileItem(itemPath);

      if  (!this.isFileItemInArray(item, this.hiddenFileItems)
        && !this.isFileItemInArray(item, this.subHiddenFileItems)) {
        items.push(item);
      }
    }

    return manager.sortItems(items, this.sortedMode);
  }
}*/
