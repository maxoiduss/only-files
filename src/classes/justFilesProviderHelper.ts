import * as vscodes from "../types/vscodes";
import * as manager from "./fileItemManager";
import { TreeItemCollapsibleState } from "vscode";
import { FileItem, FileItemLike, FileItemOr } from "./fileItem";
import { getConfigurationFor, getUri, isFolder, isValidUri, known, same
} from "./utilManager";

/**
 * ```
 * class JustFilesViewProvider
 * implements vscode.TreeDataProvider<FileItem | PlaceholderItem>,
 * vscodes.Changable<FileItem>,
 * vscodes.Searchable,
 * vscodes.Disposable
 * ```
 *
 * Provides ...
 */
// JustFilesProviderHelper module defines some helper types, funcs and docs
export class JustFilesProviderHelper { }

const empty = '' as const;
const sorted = "sorted" as const;
const heades = "heades" as const;
const hidden = "hidden" as const;

type VertexLike = { /// Serializable
  id: string;
  parent: string;
  item: FileItemLike
} & vscodes.Serializable;

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

  public async createChildren(): Promise<void> {
    const children = await manager.getChildrenNames(this.item || this.id);
    children.forEach((child) => this.childrenSet.add(child));
  };

  public removeChild(child: string) {
    this.childrenSet.delete(child);
  }

  public isRootOn(leaves: Map<string, Vertex>): boolean {
    return !leaves.has(this.parent);
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

export const real = (obj: any): obj is {} => obj !== undefined && obj !== null;

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
