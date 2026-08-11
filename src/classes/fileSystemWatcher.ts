import * as vscodes from "../types/vscodes";
import * as manager from "./fileItemManager";
import { FileItemOr } from "./fileItem";
import { ExtensionStaticService } from "./extensionStaticService";
import { basename, getKeyByValue } from "./utilManager";

interface Event {
  uri: vscode.Uri;
  action: Action;
}
// eslint-disable-next-line @typescript-eslint/naming-convention
const Action = {
  created: 1,
  deleted: 2   } as const;

const throttling = () => ExtensionStaticService.fsThrottling;
const key = (item: Event) => item.uri.toString();
const form = (item: Event) => item.action;
const group = (items: Queue<Event>) => [
  items.get(Action.deleted) ?? new Map<string, Event>(),
  items.get(Action.created) ?? new Map<string, Event>()
];
export const name = (item: Action) => getKeyByValue(Action, item);

type Action = vscodes.EnumLike<typeof Action>;
type WSF = vscode.WorkspaceFoldersChangeEvent;
type Or<T> = T | undefined;

class Queue<T extends Object> {
  private readonly queue: Map<string, T> = new Map();
  private readonly forms: Map<number, Map<string, T> > = new Map();
  private listener: ((self: Queue<T>) => void) | undefined;
  private timeoutId: any = undefined;
  private asKey: (item: T) => string;
  private asForm: (item: T) => number;

  constructor(getKey: (item: T) => string, getForm: (item: T) => number) {
    this.asKey = getKey;
    this.asForm = getForm; }

  private emit() {
    if (!this.listener) { return; }
    if (this.timeoutId !== undefined) { return; }

    this.timeoutId = setTimeout(() => {
      this.timeoutId = undefined;
      if (this.listener) { this.listener(this); }
    }, throttling());
  }

  public get size(): number { return this.queue.size; }
  public get uniformal(): boolean { return this.forms.size <= 1; }

  public subscribe(listen: (self: Queue<T>) => void) { this.listener = listen; }

  public push(item: T) {
    const [key, form] = [this.asKey(item), this.asForm(item)];
    this.queue.set(key, item);
    const   forms = this.forms.get(form);
    forms ? forms.set(key, item) : this.forms.set(form, new Map([[key, item]]));
    this.emit(); }
  
  public pop(): Map<string, Or<T> >;
  public pop(key: string): Or<T>;
  public pop(item: T): Or<T>;
  public pop(obj?: T | string): Or<T> | Map<string, Or<T> > {
    if (obj){
      const key = typeof obj === 'string' ? obj : this.asKey(obj);
      const  it = this.queue.get(key);
                  this.queue.delete(key);
             it ? this.forms.get(this.asForm(it))?.delete(key) : {};
      return it;
    }
    const  items = new Map(this.queue);
           this.clear();
    return items; }
  
  public clear() { this.queue.clear(); this.forms.clear(); }

  public all(): T[] { return [...this.queue.values()]; }

  public any(key: string): Or<T> { return this.queue.get(key); }

  public get(): Map<string, T>;
  public get(form: number): Or<Map<string, T> >;
  public get(form?: number): Or<Map<string, T> > {
    return form ? this.forms.get(form) : this.queue; }

  public dispose() {
    clearTimeout(this.timeoutId);
    this.listener = undefined;
    this.timeoutId = undefined;
    this.queue.clear();
    this.forms.clear();
  }
}

export class FileSystemWatcher implements vscodes.Disposable {
  public didChangeWorkspaceFolders: ((event: WSF) => Promise<any>) | undefined =
  async (event: WSF) => {
    const added = event.added;
    if (added.length > 0) { added.forEach((f) => this.addQueueFor(f)); }
    
    const removed = event.removed;
    if (removed.length > 0) { removed.forEach((f) => this.removeQueueOf(f)); }
  };
  
  public isDisposed: boolean | undefined;

  private readonly context: vscode.ExtensionContext;
  private readonly disposables: Map<string, vscode.Disposable[]> = new Map();
  private readonly queues: Map<string, Queue<Event> > = new Map();
  private readonly exclusions = {
    pushed: new Set<string>(),
    popped: new Set<string>(),
    values: new Set<string>()   };
  private readonly refresh: (item?: FileItemOr) => void;
  private readonly changes: (uri: vscode.Uri, oldUri: vscode.Uri) => void;
  private readonly deletes: (uri: vscode.Uri) => void;
  
  private get workspaceFolders() {
    return vscode.workspace.workspaceFolders ?? []; }

  constructor(
    context: vscode.ExtensionContext,
    refresh: (item?: FileItemOr) => void,
    changes: (uri: vscode.Uri, oldUri: vscode.Uri) => void,
    deletes: (uri: vscode.Uri) => void
  ) {
    this.context = context;
    this.refresh = refresh;
    this.changes = changes;
    this.deletes = deletes;
  }

  private acceptExclusions() {
    this.exclusions.popped.forEach((uri) => this.exclusions.values.delete(uri));
    this.exclusions.popped.clear();
    this.exclusions.pushed.forEach((uri) => this.exclusions.values.add(uri));
    this.exclusions.pushed.clear();
  }
  
  private watchFolder(folder: vscode.WorkspaceFolder) {
    const setup = [false, true, false];
    const pattern = new vscode.RelativePattern(folder, '**/*');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern, ...setup);
    const root = folder.uri.toString();
    const dis = new Array<vscode.Disposable>();
    this.addQueueFor(folder);

    watcher.onDidCreate((uri) => this.addEvent(root, Action.created, uri), dis);
    watcher.onDidDelete((uri) => this.addEvent(root, Action.deleted, uri), dis);
    this.disposables.set(root, [watcher, ...dis]);
    this.context.subscriptions.push(watcher);
  }

  private subscribeRefresh(folder: vscode.WorkspaceFolder) {
    const root = folder.uri.toString();
    const queue = this.queues.get(root);
    if (queue) { queue.subscribe((q) => this.handleEventsOf(q)); }
  }

  private removeQueueOf(folder: vscode.WorkspaceFolder) {
    const root = folder.uri.toString();
    const queue = this.queues.get(root);
    if (queue) {
      queue.dispose(); this.queues.delete(root);
    }
    this.disposables.get(root)?.forEach((obj) => obj.dispose());
  }

  private addQueueFor(folder: vscode.WorkspaceFolder) {
    this.queues.set(folder.uri.toString(), new Queue(key, form));
    this.subscribeRefresh(folder);
  }

  private addEvent(where: string, action: Action, uri: vscode.Uri) {
    const queue = this.queues.get(where);
    if (queue) {
      queue.push({ action, uri }); }
  }

  private handleEvent(event: Event) {
    if (event.action === Action.deleted) { this.deletes(event.uri); }
  }

  private handleEvents(...events: Or<Event>[]) {
    events.forEach((event) => event && this.handleEvent(event));
    if (events.length > 0) {
      this.refresh();
    }
  }

  private handleEventsOf(queue: Queue<Event>) {
    this.acceptExclusions();

    const all = queue.get();
    for (const [key] of all) {
      if (this.exclusions.values.has(key)) { queue.pop(key); }
    }
    if (!queue.uniformal) {
      this.handleEventPairs(queue); }

    this.handleEvents(...queue.pop().values());
  }

  private handleEventPairs(queue: Queue<Event>) {
    this.handleRenames(queue);
    this.handleMoves(queue);

    const [deleted, created] = group(queue);
    const delIterator = deleted.entries();
    const creIterator = created.entries();
    while (true) {
      const nextDeleted = delIterator.next();
      const nextCreated = creIterator.next();
      if (nextDeleted.done || nextCreated.done) { break; }

      const [_,  delEvent] = nextDeleted.value;
      const [__, creEvent] = nextCreated.value;
      this.releasePair(delEvent, creEvent, queue, deleted, created);
    }
  }

  private handleRenames(queue: Queue<Event>) {
    const [deleted, created] = group(queue);
    const createdByParent = new Map<string, Map<string, Event> >();
    this.populateMultiMapBy(createdByParent, created, ([key]) =>
         manager.getParent(key));
    this.checkByMultiMap(deleted, created, createdByParent, queue, ([key]) =>
         manager.getParent(key), (pool) => pool.size === 1);
    createdByParent.clear();
  }

  private handleMoves(queue: Queue<Event>) {
    const [deleted, created] = group(queue);
    const createdByFileName = new Map<string, Map<string, Event> >();
    this.populateMultiMapBy(createdByFileName, created, ([_, event]) =>
         basename(event.uri));
    this.checkByMultiMap(deleted, created, createdByFileName, queue, ([_, e]) =>
         basename(e.uri), (pool) => pool.size > 0);
    createdByFileName.clear();
  }

  private populateMultiMapBy(
    multimap: Map<string, Map<string, Event> >,
    bymap: Map<string, Event>,
    method: (entry: [string, Event]) => string
  ) {
    for (const [key, event] of bymap) {
      const fileName = method([key, event]);
      if (!multimap.has(fileName)) {
          multimap.set(fileName, new Map());
      }  multimap.get(fileName)!.set(key, event);
    }
  }

  private checkByMultiMap(
    what: Map<string, Event>,
    bymap: Map<string, Event>,
    multimap: Map<string, Map<string, Event> >,
    maintainer: Queue<Event>,
    method: (entry: [string, Event]) => string,
    shouldMakePairOn: (pool: Map<string, Event>) => boolean
  ) {
    for (const [key, event] of what) {
      const fileName = method([key, event]);
      const pool = multimap.get(fileName);
      if (pool && shouldMakePairOn(pool)) {
        const [_, onEvent] = pool.entries().next().value!;
        this.releasePair(event, onEvent, maintainer, what, bymap, pool);
      }
    }
  }

  private releasePair(
    deletedEvent: Event,
    createdEvent: Event,
    allEvents: Queue<Event>,
    deleted:  Map<string, Event>,
    created:  Map<string, Event>,
    subPool?: Map<string, Event>
  ) {
    this.changes(createdEvent.uri, deletedEvent.uri);

    const [delKey, creKey] = [key(deletedEvent), key(createdEvent)];
    allEvents.pop(delKey);   allEvents.pop(creKey);
    deleted.delete(delKey); created.delete(creKey);

    if (subPool) { subPool.delete(creKey); }
  }

  public excludeUri(uri: vscode.Uri | undefined) {
    uri && this.exclusions.pushed.add(uri.toString());
  }

  public unexcludeUri(uri: vscode.Uri | undefined) {
    uri && this.exclusions.popped.add(uri.toString());
  }

  public watch() {
    this.workspaceFolders.forEach((f) => this.watchFolder(f));
  }

  dispose() {
    if (this.isDisposed) { return; } else { this.isDisposed = true; }
    this.didChangeWorkspaceFolders = undefined;
    for (const queue of this.queues.values()) { queue.dispose(); }

    this.queues.clear();
    this.disposables.forEach((arr) => arr.forEach((obj) => obj.dispose()));
  }
}
