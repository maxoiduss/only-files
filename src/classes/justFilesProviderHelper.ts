import * as manager from "./fileItemManager";
import { TreeItemCollapsibleState } from "vscode";
import { FileItem } from "./fileItem";
import { getUri, isFolder, same } from "./utilManager";

const dot = '.' as const;
const empty = '' as const;

export class Leaf {
  private id!: string;
  private state: TreeItemCollapsibleState = TreeItemCollapsibleState.None;
  private readonly childrenSet: Set<string> = new Set();
  
  public parent!: string;
  public opened: number = 0;
  public item: FileItem | undefined;
  
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
  
  public async validateState(): Promise<void> {
    if (!this.item) { await this.createItem(); }

    let amFolder = this.isFolder();
    if (amFolder === undefined) { amFolder = await isFolder(getUri(this.id)); }
    if (!amFolder) { return; }
    if (this.getState() === TreeItemCollapsibleState.None && amFolder) {
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
    this.item ??= await manager.createFileItem(uri,
      this.state === TreeItemCollapsibleState.Expanded
    );
  }

  public async createChildren(): Promise<void> {
    const children = await manager.getChildrenNames(this.item || this.id);
    children.forEach((child) => this.childrenSet.add(child));
  };

  public isRootOn(leaves: Map<string, Leaf>): boolean {
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
