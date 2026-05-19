import * as vscodes from "../types";
import * as manager from "./fileItemManager";
import * as helper from "./justFilesProviderHelper";
import { JustFilesProviderHelper } from "./justFilesProviderHelper";
import { ExtensionStaticService } from "./extensionStaticService";
import { LogService } from "./logService";
import { Vertex } from "./justFilesProviderHelper";
import { brand } from "./extensionBrandResolver";
import { FileItem, PlaceholderItem } from "./fileItem";
import { autodebug, getFoldersBy, getPathDepth, getUri, isValidUri
} from "./utilManager";

const dot = '.' as const;
//const empty = ''  as const;

const cleanupInterval = 60000 as const;

type JustFilesItemOr = FileItem | PlaceholderItem | undefined;
type JustFilesItem = FileItem | PlaceholderItem;

typeof JustFilesProviderHelper;
/** @see Docs on {@link JustFilesProviderHelper} */

export class JustFilesViewProvider
  implements vscode.TreeDataProvider<FileItem | PlaceholderItem>,
  vscodes.Changable<FileItem>,
  vscodes.Searchable,
  vscode.Disposable
{
  private didChangeTreeData: vscode.EventEmitter<JustFilesItemOr> =
    new vscode.EventEmitter<FileItem | undefined>();
  public readonly onDidChangeTreeData: vscode.Event<JustFilesItemOr> =
    this.didChangeTreeData.event;

  public onSearch: boolean = false;
  
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
  private addonQueue: Promise<void> = Promise.resolve();
  private cleanupQueue: Promise<void> = Promise.resolve();
  private cleanupTimer;
  
  private readonly pushing: (path: string) => number;
  private readonly context: vscode.ExtensionContext;

  private get plainMode() { return ExtensionStaticService.plainMode; }

  constructor(context: vscode.ExtensionContext) {
    this.cleanupTimer = setTimeout(() => this.cleanupTask(), cleanupInterval);
    this.context = context;
    this.pushing = getPathDepth;
    helper.loadWorkspaceContexts(this.context,
      (heads) => this.vertices = heads,
      (hidden) => this.hidden = hidden,
      (mode) => this.sortedMode = mode
    );
    this.removeNotHeads();
  }
  
  private removeNotHeads() {
    const heads = new Set(
      this.heads.map((h) => h.item?.id).filter((i) => helper.real(i))
    );
    for (const id of this.vertices.keys()) {
      if (id && heads.has(id)) {
        this.deleteFromVertices(id);
      }
    }
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
    for (const vertex of this.vertices.values()) {
      if (vertex.opened !== 0 && now - vertex.opened > cleanupInterval / 2) {
        vertex.children.forEach((childId) => this.pushById(childId, res));
      }
    }
    res.sort((a, b) => b[1] - a[1]);
    res.forEach(([id]) => this.deleteFromVertices(id));
  }

  private addToVertices(id: string, vertex: Vertex) {
    this.vertices.set(id, vertex);
  }

  private deleteFromVertices(id: string) {
    this.vertices.delete(id);
  }

  private async createHiddenChildren(vert: Vertex, id: string): Promise<void> {
    await vert.createChildren();
    for (const childId of vert.children) {
      if (childId !== id) {
        this.hidden.add(childId);
      }
    }
  }

  private async createParent(vert: Vertex, hiddenId?: string): Promise<void> {
    const parentVert = new Vertex(vert.parent);
    const parentId = await parentVert.getId();
    
    if (parentId === dot) { return; }
    if (!this.vertices.has(parentId)) {
      this.addToVertices(parentId, parentVert);
      const id = await vert.getId();

      if (hiddenId) {
        await this.createHiddenChildren(parentVert, id);
      }
      const hiddenParent = hiddenId && parentId !== id ? hiddenId : undefined;
      await this.createParent(parentVert, hiddenParent);
    }
    this.hidden.delete(parentId);
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
  
  private async setupChildrenFor(vert: Vertex, force?: boolean): Promise<void> {
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
        this.addToVertices(await childVertex.getId(), childVertex);
      }
    }
  }

  private removeDistantDescendantsOf(id: string) {
    for (const [vertexId, vertex] of this.vertices) {
      if (vertex.parent !== id && vertex.parent.startsWith(id)) {
        this.deleteFromVertices(vertexId);
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
      };
      this.deleteFromVertices(id);
    }
    this.hidden.delete(id);
  }

  private unhideById(id: string) {
    const vertex = this.vertices.get(id);
    if (vertex) {
      for (const childId of vertex.children) {
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
    for (const vertex of this.vertices.values()) {
      if (vertex.item && vertex.item.isFile) {
        vertex.item.setLabel(this.plainMode, { sorted: mode });
      }
    }
  }

  private async validateHidden(): Promise<void> {
    for (const pathe of this.hidden) {
      const exist = await isValidUri(getUri(pathe));
      if (!exist) { this.hidden.delete(pathe); }
    }
  }

  private async validateVertices(): Promise<void> {
    for (const [id, vertex] of this.vertices) {
      const exist = await vertex.validateItem();
      if (!exist) {
        this.deleteFromVertices(id);
        this.removeById(id);
      }
    }
    await this.validateHidden();
  }

  public async addFileItem(fileItem: FileItem): Promise<void> {
    this.addonQueue = this.addonQueue.then(async () => {
      const exist = this.vertices.get(fileItem.id);
      const root = exist ?? new Vertex(fileItem);
      await root.validateState();
      const rootId = await root.getId();

      if (!exist) { await this.setupParentsFor(root); }
      if (root.isFolder()) {
        this.removeHiddenDescendantsOf(rootId);
        this.removeDistantDescendantsOf(rootId);
      }
      this.unhideById(rootId);
      this.addToVertices(rootId, root);
      
      await this.setupChildrenFor(root, !exist);
    });
    return this.addonQueue;
  }

  public removeFileItem(fileItemOr: FileItem | vscode.Uri) {
    const rootId = fileItemOr instanceof FileItem ?
      fileItemOr.id : fileItemOr.toString(); 
    const root = this.vertices.get(rootId);
    if (!root) { return; }
    
    this.removeById(rootId);

    if (!root.isRootOn(this.vertices)) {
      this.hidden.add(rootId);
    }
  }

  public async deleteItem(item: vscode.Uri): Promise<void> {
    this.removeFileItem(item);
  }

  public clean() {
    this.vertices.clear();
    this.hidden.clear();
    this.refresh();
  }

  public dispose() {
    clearTimeout(this.cleanupTimer);
    this.didChangeTreeData.dispose();
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
    const prepare = this.sortedMode ?
      this.validateVertices.bind(this) : () => Promise.resolve();

    prepare().then(() => {
      if (autodebug[4]) { debugger; }
      const vertex = this.vertices.get(element?.id ?? '_');
      if (vertex) {
        this.setupChildrenFor(vertex, true);
      }
      this.didChangeTreeData.fire(element);

      helper.saveWorkspaceContexts(
        this.context, this.sortedMode, this.heads, [...this.hidden]
      );
    });
  }

  public getTreeItem(element: FileItem): JustFilesItem {
    if (element instanceof PlaceholderItem) {
      element.label = undefined; 
      element.command = undefined;
    }
    return element;
  }

  public async getChildren(element?: FileItem): Promise<JustFilesItem[]> {
    if (!element?.id) {
      if (this.heads.length === 0) {
        return Promise.resolve([new PlaceholderItem()]);
      }
      this.switchItemsInSortedMode();
      
      return manager.sortItems(
        this.heads.map((vert) => vert.item).filter((it) => helper.real(it)),
        this.sortedMode
      );
    }
    const vertex = this.vertices.get(element.id);
    if (!vertex) { return[]; }

    await this.setupChildrenFor(vertex);
    const items = vertex.children
      .map((child) => this.vertices.get(child)?.item)
      .filter((item) => helper.real(item));

    this.switchItemsInSortedMode();

    return manager.sortItems(items, this.sortedMode);
  }

  /*public changeTreeItem(fileItem: FileItem, oldUri: vscode.Uri) {
    const newUri = fileItem.resourceUri;
    if (!newUri) { return; }

    const toRefresh: FileItem[] = [];
    const allItems = [...this.vertices]
      .map(([_, vertex]) => vertex.item)
      .filter((item) => helper.real(item));
      
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
  }*/

  public changeTreeItem(fileItem: FileItem, _oldUri: vscode.Uri) {
    const newUri = fileItem.resourceUri;
    if (!newUri) { return; }

    /*const changed: [string, vscode.Uri | undefined][] = [];
    for (const vertex of this.heads) {
      if (vertex.item && manager.check(vertex.item).isChildOf(oldUri, true)) {
        const id = vertex.item.id;
        manager.changeUri(vertex.item, newUri, oldUri);
        this.removeById(id);
        this.addToVertices(vertex.item.id, vertex);
        changed[0] = [empty, undefined];
      } }
    for (const pathe of this.hidden) {
      const uri = getUri(pathe);
      if (manager.check(uri).isChildOf(oldUri, true)) {
        changed.push([pathe, manager.changeUri(uri, newUri, oldUri)]);
      } }
    if (changed.length > 0) {
      if (changed[0][0] === empty) { changed[0] = changed.pop()!; }

      changed.forEach(([key, uri]) => {
        this.hidden.delete(key);
        uri ? this.hidden.add(uri.toString()) : {};
      });
      this.refresh(fileItem);
    }*/
  }

  public async refreshIfExistsFileItemByUri(uri: vscode.Uri): Promise<void> {
    const found = this.heads.find((v) => v.item?.like(uri.toString()))?.item;
    if (await isValidUri(uri) || !found) {
      this.refresh(found);
    }
  }
}
