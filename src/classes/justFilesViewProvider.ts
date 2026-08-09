import * as vscodes from "../types/vscodes";
import * as manager from "./fileItemManager";
import * as helper from "./justFilesProviderHelper";
import { TreeItemCollapsibleState } from "vscode";
import { JustFilesProviderHelper } from "./justFilesProviderHelper";
import { ExtensionStaticService } from "./extensionStaticService";
import { LogService } from "./logService";
import { Vertex } from "./justFilesProviderHelper";
import { brand } from "./extensionBrandResolver";
import {
  FileItem, FileItemOr, FileItemOrUriOr, JustFilesItem, JustFilesItemOr,
  PlaceholderItem
} from "./fileItem";
import { getFoldersBy, getPathDepth, getUri, isValidUri
} from "./utilManager";

export const small = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  get 1() { return 100 as const; }, get 2() { return 170 as const; }
} as const;

typeof JustFilesProviderHelper;
/** @see Docs on {@link JustFilesProviderHelper} */

export class JustFilesViewProvider implements
  vscode.TreeDataProvider<JustFilesItem>,
  vscodes.Changable<FileItem>,
  vscodes.Searchable,
  vscodes.Disposable
{
  private didChangeTreeData: vscode.EventEmitter<JustFilesItemOr> =
    new vscode.EventEmitter<JustFilesItemOr>();
  readonly onDidChangeTreeData: vscode.Event<JustFilesItemOr> =
    this.didChangeTreeData.event;

  public onSearch: boolean = false;
  public isDisposed: boolean | undefined;

  public get highlighting() { return this.highlights; }
  public set highlighting(value) {
    this.highlights = value;
    this.populateHighlightings();
  }
  
  public get sortedMode(): boolean { return this.sorted; }
  public set sortedMode(val: boolean) {
    this.sorted = val;
    vscode.commands.executeCommand(
      brand.setContext, brand.isSorted, this.sorted
    );
  }

  public get heads(): Vertex[] {
    return Array
      .from(this.vertices.values())
      .filter((vertex) => vertex.isRootOn(this.vertices));
  }

  private sorted: boolean = false;
  private hidden: Set<string> = new Set();
  private vertices: Map<string, Vertex> = new Map();
  private switchable: boolean = false;
  private addonQueue: Promise<void> | undefined = Promise.resolve();
  private cleanupQueue: Promise<void> | undefined = Promise.resolve();
  private cleanupTimer;
  private reloadTimer;
  private savingTimer;
  private highlights = {
    has: (_: vscode.Uri | string | undefined): boolean => { return false; },
    add: (_: (vscode.Uri | string)[] | undefined) => { },
    rem: (_: vscode.Uri | string | undefined, __?: boolean) => { },
    clr: () => { }
  };
  private readonly revealItem: (item: FileItem, expand?: boolean) => void;
  private readonly pushing: (path: string) => number;
  private readonly context: vscode.ExtensionContext;

  private get plainMode() { return ExtensionStaticService.plainMode; }

  constructor(
    context: vscode.ExtensionContext,
    revealItem: (item: FileItem, expand?: boolean) => void
  ) {
    helper satisfies vscodes.HelperContract<FileItem>;
    this.context = context;
    this.pushing = getPathDepth;
    this.revealItem = revealItem;
    this.reloadTimer = setTimeout(() => {}, 0);
    this.savingTimer = setTimeout(() => {}, 0);
    this.cleanupTimer = setTimeout(() => this.cleanupTask(), 
      helper.cleanupInterval);
    helper.loadWorkspaceContexts(this.context,
      (heads) => this.vertices = heads,
      (hidden) => this.hidden = hidden,
      (mode) => this.sortedMode = mode
    );
    this.removeNotHeads();
  }

  private removeNotHeads() {
    const heads = new Set(
      this.heads.map((vertex) => vertex.item?.id)
                .filter((it) => helper.real(it)));
    for (const id of this.vertices.keys()) {
      if (!heads.has(id)) { this.delete(id).fromVertices(); }
    }
  }

  private cleanupTask() {
    const runTask = async () => {
      try { this.cleanup(); }
      catch (err) { LogService.error(err); }
      finally {
        clearTimeout(this.cleanupTimer);
        this.cleanupTimer = setTimeout(runTask, helper.cleanupInterval);
      }
    };
    this.cleanupQueue = runTask();
  }

  private cleanup(): void {
    const res: [string, number][] = [];
    const now = Date.now();
    for (const vertex of this.vertices.values()) {
      if (!this.cleanupQueue) { return; }

      if  (vertex.opened !== 0
        && now - vertex.opened > helper.cleanupInterval / 2) {
        vertex.children.forEach((childId) => this.pushById(childId, res));
      }
    }
    res.sort((a, b) => b[1] - a[1]);
    res.forEach(([id]) => this.delete(id).fromVertices());
  }

  private add(id: string, vertex?: Vertex) { return {
    toVertices: () => { this.vertices.set(id, vertex!); },
    toHidden: () => {
      this.hidden.add(id);
      this.highlighting.add([id]); }
  }; }
  private delete(id: string) { return {
    fromVertices: () => {
      helper.removeFromCache(id);
      this.vertices.delete(id); },
    fromHidden: () => {
      this.hidden.delete(id);
      this.highlighting.rem(id); }
  }; }
  private clear() { return {
    theVertices: () => {
      helper.clearTheCache();
      this.vertices.clear(); },
    theHidden: () => {
      this.hidden.clear();
      this.highlighting.clr(); }
  }; }

  private async createHiddenChildren(vert: Vertex, id: string): Promise<void>
  {
    await vert.createChildren();
    for (const childId of vert.children) {
      if (childId !== id) {
        this.add(childId).toHidden();
      }
    }
  }

  private async createParent(vert: Vertex, hiddenId?: string): Promise<void> {
    const parentVert = new Vertex(vert.parent);
    const parentId = await parentVert.getId();
    
    if (parentId === helper.dot) { return; }
    if (!this.vertices.has(parentId)) {
      this.add(parentId, parentVert).toVertices();
      const id = await vert.getId();

      if (hiddenId) {
        await this.createHiddenChildren(parentVert, id);
      }
      const hiddenParent = hiddenId && parentId !== id ? hiddenId : undefined;
      await this.createParent(parentVert, hiddenParent);
    }
    this.delete(parentId).fromHidden();
  }

  private async setupParentsFor(vert: Vertex): Promise<void> {
    const rootId = await vert.getId();
    const parents = getFoldersBy(rootId);
    parents?.pop();
    
    if (parents && parents.some((folder) => this.vertices.has(folder))) {
      const hidden = parents.find((parent) => this.hidden.has(parent));
      await this.createParent(vert, hidden);
    }
  }
  
  private async setupChildrenFor(vert: Vertex, force?: boolean): Promise<void>
  {
    const canCreate = vert.children.length === 0 || force;
    const shouldCreate = vert.isFolder() && canCreate;
    if (shouldCreate) { await vert.createChildren(); }

    await this.cleanupQueue;

    let unchanged = true;
    const allowed = vert.children.filter((child) => !this.hidden.has(child));
    const children = await Promise.all(allowed.map(async (child) => {
      const exist = this.vertices.get(child);
      if (exist) {
        exist.parent = await vert.getId();
        return exist;
      }
      unchanged = false;
      return new Vertex(child);
    }));
    if (!unchanged) {
      for (const childVertex of children) {
        this.add(await childVertex.getId(), childVertex).toVertices();
      }
    }
  }

  private removeDistantDescendantsOf(id: string) {
    for (const [vertexId, vertex] of this.vertices) {
      if (vertex.parent !== id && vertex.parent.startsWith(id)) {
        this.delete(vertexId).fromVertices();
      }
    }
  }

  private removeHiddenDescendantsOf(id: string) {
    for (const hiddenId of this.hidden) {
      if (hiddenId.startsWith(id)) {
        this.delete(hiddenId).fromHidden();
      }
    }
  }

  private pushById(id: string, where: [string, number][]) {
    const vertex = this.vertices.get(id);
    if (vertex) {
      for (const childId of vertex.children) {
        this.pushById(childId, where);
      };
      where.push([id, this.pushing(id)]);
    }
  }

  private removeById(id: string) {
    const vertex = this.vertices.get(id);
    if (vertex) {
      for (const childId of vertex.children) {
        this.removeById(childId);
        vertex.removeChild(childId);
      };
      let parent = this.vertices.get(vertex.parent);
      if (parent) {
        parent.removeChild(id);
      }
      this.delete(id).fromVertices();
    }
    this.delete(id).fromHidden();
  }

  private unhideById(id: string) {
    const vertex = this.vertices.get(id);
    if (vertex) {
      for (const childId of vertex.children) {
        this.unhideById(childId);
      };
    }
    this.delete(id).fromHidden();
  }

  private switchItemsInSortedMode() {
    if (!this.plainMode) { this.switchable = false; }
    if ( this.plainMode && this.sortedMode) { this.switchable = true; }
    if (!this.switchable) { return; }

    const mode = this.sortedMode;
    for (const vertex of this.vertices.values()) {
      if (vertex.item && vertex.item.isFile) {
        vertex.item.setLabel(this.plainMode, { sorted: mode });
      }
    }
  }

  private async validateHidden(): Promise<void> {
    for (const pathe of this.hidden) {
      const exist = await isValidUri(getUri(pathe));
      if  (!exist) {
        this.delete(pathe).fromHidden();
      }
    }
  }

  private async validateVertices(): Promise<void> {
    const toRefresh = new Set<Vertex>();
    await this.cleanupQueue;

    for (const [id, vertex] of this.vertices) {
      let  exist = await vertex.validateItem();
      if (!exist) {
        this.removeById(id);
        let parent = this.vertices.get(vertex.parent);
        if (parent) { toRefresh.add(parent); }
      }
    }
    for (const vertex of toRefresh) {
      await this.setupChildrenFor(vertex, true);
    }
    await this.validateHidden();
  }

  private revealFileItem(element?: FileItem | string) {
    if (element) {
      const id = element instanceof FileItem ? element.id : element;
      let item = helper.cache.get(id)?.deref() ?? element;
      if (item instanceof FileItem) {
        this.revealItem(item,
          !item.isFile
        && item.collapsibleState === TreeItemCollapsibleState.Expanded);
      }
    }
  }

  private refreshAndSave(element?: FileItem) {
    const exist = helper.cache.get(element?.id);
    const item  = exist?.deref();
    if  (!item && exist) {
      helper.removeFromCache(element!.id);
    }
    isValidUri(item?.resourceUri)
      .then((valid) => valid ? item : undefined)
      .then((it) => this.didChangeTreeData.fire(it))
      .then(() => this.populateHighlightings());
    clearTimeout(this.savingTimer);

    this.savingTimer = setTimeout(() =>
      helper.saveWorkspaceContexts(
        this.context, this.sortedMode, this.heads, [...this.hidden]
      ), small[1]);
  }
  
  public populateHighlightings() {
    this.highlighting.add([...this.hidden]);
  }

  public updateHighlighting(newId: string, oldId: string) {
    if (this.highlighting.has(oldId)) {
      this.highlighting.rem(oldId, false);
      this.highlighting.add([newId]);
    }
  }

  public async addFileItem(fileItem: FileItem): Promise<void> {
    this.addonQueue = this.addonQueue?.then(async () => {
      await this.cleanupQueue;

      const exist = this.vertices.get(fileItem.id);
      const root = exist ?? new Vertex(fileItem);
      await root.validateState();
      const rootId = await root.getId();

      if (!this.addonQueue) { return; }
      if (!exist) { await this.setupParentsFor(root); }
      if (root.isFolder()) {
        this.removeHiddenDescendantsOf(rootId);
        this.removeDistantDescendantsOf(rootId);
      }
      if (!this.addonQueue) { return; }
      this.unhideById(rootId);
      this.add(rootId, root).toVertices();
      
      await this.setupChildrenFor(root, !exist);
    });

    return this.addonQueue ?? Promise.resolve();
  }

  public removeFileItem(
    itemOrUri: FileItem | vscode.Uri,
    canBeHidden: boolean = true
  ) {
    const rootId = itemOrUri instanceof FileItem ?
      itemOrUri.id : itemOrUri.toString(); 
    const root = this.vertices.get(rootId);
    if (!root) { return; }
    
    this.removeById(rootId);

    if (canBeHidden) {
      if (!root.isRootOn(this.vertices)) {
        this.add(rootId).toHidden();
      } }
  }

  public async removeAllParents(element: FileItem): Promise<void> {
    const roots = await Promise.all(this.heads.map((v) => v.getId()));
    let item  = element;
    let heads = new Set(roots);
    if (heads.size <= 0) { return; }

    do {
      let parent = this.getParent(item);
      if (parent instanceof FileItem) { item = parent; }
      else { break; }
    }
    while(!heads.has(item.id));
    this.removeFileItem(item);

    await this.addFileItem(element);
    this.refreshOnReload(element);
  }

  public removeAllHidden() {
    this.clear().theHidden();
  }

  public deleteItem(item: vscode.Uri) {
    this.removeFileItem(item, false);
  }

  public clean() {
    this.clear().theVertices();
    this.clear().theHidden();
    this.refreshAndSave();
  }

  public async expandElement(element: FileItem): Promise<void> {
    const root = this.vertices.get(element.id);
    if (root) { await root.expand(); }
  }

  public collapseElement(element: FileItem) {
    const root = this.vertices.get(element.id);
    if (root) { root.collapse(); }
  }

  public refresh(element?: FileItem) {
    (this.sortedMode || !element ?
      this.refreshOnReload(element)
    : this.refreshOn(element));
  }

  public async refreshOn(element?: FileItem): Promise<void> {
    const checkIsValid = async (item: FileItem) => {
      return item?.resourceUri ? await isValidUri(item.resourceUri) : false;
    };
    await this.validateVertices();

    let item: FileItemOr;
    const parent = element ?
      await manager.createFileItem(manager.getParent(element))
    : undefined;

    let valid  = parent ? await checkIsValid(parent) : false;
    if (valid && parent) {
      const vertex = this.vertices.get(parent.id);
      if (vertex) {
        item = parent;
        await this.setupChildrenFor(vertex, true); } }
    else {
      valid = element ? await checkIsValid(element) : false;
      if (valid && element) {
        if (this.vertices.has(element.id)) {
          item = element;
          await this.addFileItem(element); }
      }
    }
    this.refreshAndSave(item);
    this.revealFileItem(element);
  }

  public async refreshOnReload(element?: FileItemOrUriOr): Promise<void> {
    const hidden = new Set(this.hidden);
    const items = this.heads
      .map((vertex) => vertex.item)
      .filter((item) => helper.real(item));
    this.clear().theVertices();

    for (const item of items) {
      await this.addFileItem(item);
    }
    for (const id of hidden) {
      this.removeById(id);
    }
    this.hidden = hidden;

    await this.validateVertices();
    const item = element instanceof vscode.Uri ? element.toString() : element;

    this.refreshAndSave(undefined);
    this.revealFileItem(item);
  }
  
  dispose() {
    if (this.isDisposed) { return; } else { this.isDisposed = true; }

    clearTimeout(this.cleanupTimer);
    this.didChangeTreeData.dispose();
    this.addonQueue   = undefined;
    this.cleanupQueue = undefined;
  }

  getTreeItem(element: FileItem): JustFilesItem {
    if (element instanceof PlaceholderItem) {
      element.label = undefined; 
      element.command = undefined;
    }
    return element;
  }
  
  getParent(element: JustFilesItem): JustFilesItemOr {
    if (element instanceof FileItem) {
      const parent = manager.getParent(element).toString();

      return this.vertices.get(parent)?.item;
    }
    return undefined;
  }

  async getChildren(element?: FileItem): Promise<JustFilesItem[]> {
    await this.cleanupQueue;

    if (!element?.id) {
      if (this.heads.length === 0) {
        return Promise.resolve([new PlaceholderItem()]);
      }
      this.switchItemsInSortedMode();
      let items = this.heads
        .map((vert) => vert.item)
        .filter((it) => helper.real(it));
      items = helper.refreshTheCache(items);

      return manager.sortItems(items, this.sortedMode);
    }
    const vertex = this.vertices.get(element.id);
    if (!vertex) { return[]; }

    await this.setupChildrenFor(vertex, true);
    this.switchItemsInSortedMode();

    let items = vertex.children
      .map((child) => this.vertices.get(child)?.item)
      .filter((item) => helper.real(item));
    items = helper.refreshTheCache(items);

    return manager.sortItems(items, this.sortedMode);
  }

  public changeTreeItem(item: FileItem | vscode.Uri, oldUri: vscode.Uri) {
    clearTimeout(this.reloadTimer);

    this.reloadTimer = setTimeout(
      async () => {
        await this.cleanupQueue;
        const uri = item instanceof FileItem ? item.resourceUri : item;
        if  (!uri) { return; }

        const uris = new Map<string, vscode.Uri>();
        for (const vertex of this.hidden) {
          const changing = getUri(vertex);
          if (manager.check(changing).isChildOf(oldUri, true)) {
            let changed = manager.changeUri(changing, uri, oldUri);
            if (changed) { uris.set(vertex, changed); }
          }
        }
        uris.forEach((uri, changed) => {
          this.delete(changed).fromHidden();
          this.add(uri.toString()).toHidden();
        });

        const roots = await Promise.all(this.heads.map(async (head) =>
          [await head.getId(), head.item!] as const
        ));
        const found = roots.filter(([_, it]) =>
          manager.check(it).isChildOf(oldUri, true)
        );
        for (const [_, it] of found) {
          let changed = manager.changeUri(it, uri, oldUri);
          if (changed) {
            const expanded = it.hasExpandedState();
            const head = await manager.createFileItem(changed, expanded);

            this.removeFileItem(it);
            await this.addFileItem(head);
          }
        }
        await this.refreshOnReload(item);
      }, small[2]
    );
  }
}
