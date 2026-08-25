import * as vscodes from "../types/vscodes";
import * as manager from "./fileItemManager";
import { TreeItem, TreeItemCollapsibleState } from "vscode";
import { FileItem, FileItemLike, FileItemOr, PlaceholderItem
} from "./fileItem";
import {
  getConfigurationFor, getUri, isFolder, isValidUri, known, isReal, same
} from "./utilManager";

/**
 * ```
 * class OnlyFilesViewProvider implements
 * vscode.TreeDataProvider<FileItem | PlaceholderItem>,
 * vscodes.Changable<FileItem>,
 * vscodes.Searchable,
 * vscodes.Disposable
 * ```
 *
 * Provides {@link TreeItem} elements such as {@link FileItem}, 
 * {@link PlaceholderItem} for a TreeView registered in the OnlyFiles 
 * main class.
 * - {@link vscodes.Changable<T>} - provides changeTreeItem method 
 * of change to TreeItem element in cases like move/remove/rename file
 * - {@link vscodes.Searchable} - provides flag to detect the view-list 
 * search is on/off
 * - {@link vscode.Disposable} - standard vscode api disposable object
 * 
 * Unlike *FoldersViewProvider*, the provider does not keep a tree
 * that mirrors the workspace on its own. It keeps only the files and folders
 * selected by the user, while creating the required parents and children
 * around them.
 * 
 * Provider is based on inner tree-like custom logic provided by {@link Vertex} 
 * class that is used in a mutable *Set/Map* of vertices. The selected items 
 * are represented by *Vertex* objects. A vertex is a graph node 
 * identified by the item's URI string:
 * - {@link Vertex.item} is the materialised {@link FileItem}, when the item is
 *   currently available.
 * - {@link Vertex.parent} stores the parent URI string.
 * - {@link Vertex.children} stores child URI strings and is populated lazily
 *   by {@link Vertex.createChildren}.
 * - {@link Vertex.opened} records the last expansion/collapse activity used by
 *   *OnlyFilesViewProvider* to remove stale descendants.
 *
 * *OnlyFilesViewProvider* owns two related collections:
 * - its `vertices` map contains the materialised graph nodes used to render
 *   TreeView elements;
 * - its `hidden` set contains descendant or bridge IDs that are retained by
 *   the provider but must not be rendered as visible children.
 *
 * When a selected item is added, the provider restores its parent chain with
 * {@link Vertex}, loads directory children on demand, and filters hidden
 * entries before returning them from `getChildren`. When an item is removed,
 * descendants may be moved to the hidden set so that tracked items remain
 * associated with the visible graph while their current visual root is
 * absent. The provider also validates URI existence during refresh and
 * periodically cleans up inactive descendants using {@link cleanupInterval}.
 * 
 * `refreshOn` refreshes only the parent or item associated with the changed
 * {@link FileItem}, while `refreshOnReload` clears and rebuilds the tracked
 * vertex graph (inner tree) from its current roots. On move/rename, 
 * `refreshOnReload` is called; otherwise `refreshOn` is used.
 *
 * The module-level {@link cache} keeps weak references to rendered
 * {@link FileItem} instances. {@link refreshTheCache} reuses live instances
 * so VS Code retains TreeItem identity while labels and collapsible states
 * are refreshed; {@link removeFromCache}, {@link clearTheCache}, and
 * {@link addToCache} maintain that cache as the graph changes.
 *
 * Workspace state is serialised through {@link loadWorkspaceContexts} and
 * {@link saveWorkspaceContexts}. Vertices are converted to the serialisable
 * {@link VertexLike} shape and restored with their item label, file/folder
 * flag, collapsible state, and parent URI. The same state also persists the
 * sorted-mode flag and hidden URI set, allowing the Only Files view to be
 * reconstructed after reload without scanning the entire workspace.
 */
// OnlyFilesProviderHelper module defines some helper types, funcs and docs
export class OnlyFilesProviderHelper { }

const empty = '' as const;
const sorted = "sorted" as const;
const heades = "heades" as const;
const hidden = "hidden" as const;

type VertexLike = { /// Serializable
  id: string;
  parent: string;
  item: FileItemLike
} & vscodes.Serializable;

export type TreeItemOr = TreeItem | undefined;
export type PlaceholderItemOr = PlaceholderItem | undefined;

export const dot  = '.' as const;
export const cleanupInterval = 60000 as const;

export class Vertex {
  private id!: string;
  private state: TreeItemCollapsibleState = TreeItemCollapsibleState.None;
  private readonly childrenSet: Set<string> = new Set();
  
  public parent!: string;
  public opened: number = 0;
  public item: FileItemOr;
  
  public get children() { return Array.from(this.childrenSet.values()); }
  
  constructor(item: FileItem);
  constructor(id: string, state?: TreeItemCollapsibleState);
  constructor(itemOrId: FileItem | string, state?: TreeItemCollapsibleState) {
    const setState  = () => { this.state = state ?? this.state; };
    const setParent = () => { this.parent = this.item ?
      manager.getParent(this.item).toString() : manager.getParent(this.id);
      this.parent = same(this.parent, this.id) ? empty : this.parent;
    };
    if (itemOrId instanceof FileItem) {
      this.id = itemOrId.id;
      this.item = itemOrId;
      setState(); setParent();
    } else {
      this.id = itemOrId;
      setState(); setParent();
    }
  }

  public async validateItem(): Promise<boolean> {
    return await isValidUri(getUri(this.id));
  }
  
  public async validateState(): Promise<void> {
    if (!this.item) { await this.createItem(); }

    let aFolder = this.isFolder();
    if (aFolder === undefined) { aFolder = await isFolder(getUri(this.id)); }
    if (aFolder === undefined) { return; }
    if (this.getState() === TreeItemCollapsibleState.None && aFolder) {
      this.state = TreeItemCollapsibleState.Collapsed;
      this.item!.collapsibleState = this.state;
    }
  }

  public getState(): TreeItemCollapsibleState {
    return this.item ? (this.state = this.item.collapsibleState!) : this.state;
  }

  public async getId(): Promise<string> {
    if (!this.item) { await this.createItem(); }

    return this.item?.id || dot;
  }

  public async createItem(): Promise<void> {
    if (this.id === dot) { return; }

    const uri = getUri(this.id);
    this.item = cache.get(uri.toString())?.deref();

    if (!this.item) {
      this.item = await manager.createFileItem(uri,
        this.state === TreeItemCollapsibleState.Expanded
      );
    }
  }

  public removeChild(child: string) {
    this.childrenSet.delete(child);
  }

  public async createChildren(): Promise<void> {
    const children = await manager.getChildrenNames(this.item || this.id);
    children.forEach((child) => this.childrenSet.add(child));
  };

  public async gatherChildrenOn(vertices: Map<string, Vertex>): Promise<void> {
    const parentId = await this.getId();
    for (const [id, vertex] of vertices) {
      if (vertex.parent === parentId) {
        this.childrenSet.add(id); }
    }
  }

  public isRootOn(vertices: Map<string, Vertex>): boolean {
    return !vertices.has(this.parent);
  }

  public isFolder(): boolean | undefined {
    return this.item ? !this.item.isFile : undefined;
  }

  public async expand(): Promise<void> {
    if (!this.item) { await this.createItem(); }

    this.item?.hasExpandedState({ changeTo: true });
    this.state = this.item?.collapsibleState ?? this.state;
    this.opened = 0;
  }

  public collapse() {
    this.item?.hasExpandedState({ changeTo: false });
    this.state = this.item?.collapsibleState ?? this.state;
    this.opened = Date.now();
  }
}

export const cache: Map<string | undefined, WeakRef<FileItem> > = new Map();

export const removeFromCache = (id: string) => { cache.delete(id); };
export const addToCache = (id: string, item: FileItem) => {
  cache.set(id, new WeakRef(item));
};
export const clearTheCache = () => { cache.clear(); };
export const refreshTheCache = (items: FileItem[]): FileItem[] => {
  return items = items.map((item) => {
    const cached  = cache.get(item.id)?.deref();
    if  (!cached){ addToCache(item.id, item); }
    else {cached.label = item.label;
          cached.collapsibleState = item.collapsibleState; }
   return cached ?? cache.get(item.id)!.deref()!;
  });
};

const convertTo = <T extends VertexLike>(
  vertex: Vertex
): T | undefined => {
  if (!vertex.item || !real(vertex.item.collapsibleState)) {
    return undefined; }

  const it = vertex.item;
  const s  = vertex.item.collapsibleState;
  const l  = vertex.item.getLabel();
  const item: FileItemLike = { id: it.id, state: s, label: l, file: it.isFile };
  const convertable: VertexLike = {
    id: it.id, parent: vertex.parent, item: item
  };
  return known(convertable).as<T>();
};

const convertFrom = <T extends VertexLike>(
  convertable: T
): Vertex => {
  const it = convertable.item;
  const uri = getUri(it.id);
  const item = manager.getNewFileItem(uri, it.label, it.state, it.file);
  const vertex = new Vertex(item);
  vertex.parent = convertable.parent;
  
  return vertex;
};

export const real = isReal;

export const loadWorkspaceContexts = (
  context: vscode.ExtensionContext,
  updateHeads: ( vertices: Map<string, Vertex> ) => void,
  updateHiddens: ( pathes: Set<string> ) => void,
  setSortedMode: ( plainMode: boolean ) => void
) => {
  const heads = getConfigurationFor<Array<VertexLike> >(context, heades);
  const hidds = getConfigurationFor<Array<string> >(context, hidden);
  if (heads) {
    let head = heads.map((v) => [v.id, convertFrom(v)] as const);
    updateHeads(new Map(head));
  }
  if (hidds) {
    updateHiddens(new Set(hidds));
  }
  let mode =  getConfigurationFor<boolean>(context, sorted);
  if (mode) { setSortedMode(mode); }
};

export const saveWorkspaceContexts = (
  context: vscode.ExtensionContext,
  sortedMode: boolean,
  heads: Vertex[],
  hiddens: string[]
) => {
  let head = heads.map((h) => convertTo<VertexLike>(h)).filter((x) => real(x));
  context.workspaceState.update(heades, head);
  context.workspaceState.update(hidden, hiddens);
  context.workspaceState.update(sorted, sortedMode);
};
