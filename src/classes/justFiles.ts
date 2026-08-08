import * as vscodes from "../types/vscodes";
import * as manager from "./fileItemManager";
import * as folders from "./foldersProviderHelper";
import { KeybindingsService } from "./keybindingsService";
import { CommandRegistrator } from "./commandRegistrator";
import { FilesViewDecorator } from "./filesViewDecorator";
import { JustFilesDragController } from "./justFilesDragController";
import { FoldersDragController } from "./foldersDragController";
import { FoldersReferenceProvider } from "./foldersReferenceProvider";
import { FoldersViewProvider } from "./foldersViewProvider";
import { FileWatcherExcluder } from "./fileWatcherExcluder";
import { FileSystemWatcher } from "./fileSystemWatcher";
import { PreviewProvider } from "./previewProvider";
import { brand, ExtensionBrandResolver } from "./extensionBrandResolver";
import { ExtensionStaticService } from "./extensionStaticService";
import { LogService } from "./logService";
import { JustFilesViewProvider, small } from "./justFilesViewProvider";
import {
  EmptyFolderItem, FileItem, FileItemOrUriOr, JustFilesItem,
  PlaceholderItem, RootFileItem
} from "./fileItem";
import {
  getNicePath, getProjectName, getUriFrom, isFolder, isProjectTooLarge, isValidUri, same, 
  sleep
} from "./utilManager";

export class JustFiles {
  private readonly context: vscode.ExtensionContext;
  private readonly justFilesViewProvider: JustFilesViewProvider;
  private readonly foldersViewProvider: FoldersViewProvider;
  private readonly justFilesTreeView: vscode.TreeView<JustFilesItem>;
  private readonly foldersTreeView: vscode.TreeView<FileItem>;
  private readonly commandRegistrator: CommandRegistrator;
  private readonly referenceProvider: FoldersReferenceProvider;
  private readonly previewProvider: PreviewProvider;
  private readonly fileDecorator: FilesViewDecorator;
  private readonly fileExcluder: FileWatcherExcluder;
  private readonly fileWatcher: FileSystemWatcher;

  private readonly justFilesDragController: JustFilesDragController;
  private readonly foldersDragController: FoldersDragController;
  private readonly keybindingsService: KeybindingsService;

  private justFilesSelectedItems: readonly (JustFilesItem)[] = [];
  private filesSelectedItems: readonly FileItem[] = [];
  private lastSelectedView: vscodes.ViewX = "Preview";
  

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.keybindingsService = new KeybindingsService();
    this.justFilesViewProvider = new JustFilesViewProvider(context,
      this.revealJustFilesViewFileItem.bind(this));
    this.foldersViewProvider = new FoldersViewProvider(context,
      this.revealFoldersViewFileItem.bind(this));
    this.fileWatcher = new FileSystemWatcher(context,
      this.refreshTreeViews.bind(this),
      this.changeItemInTreeViews.bind(this),
      this.justFilesViewProvider.deleteItem.bind(this.justFilesViewProvider)
    );
    this.commandRegistrator = new CommandRegistrator(context,
      this.refreshTreeViews.bind(this),
      this.changeFileItem.bind(this),
      this.fileWatcher.excludeUri.bind(this.fileWatcher),
      this.fileWatcher.unexcludeUri.bind(this.fileWatcher)
    );
    this.previewProvider = new PreviewProvider(context);
    this.justFilesDragController = new JustFilesDragController(
      this.commandRegistrator
    );
    this.foldersDragController = new FoldersDragController(
      this.commandRegistrator,
      this.openUriOrRemoveFromView.bind(this)
    );
    this.referenceProvider = new FoldersReferenceProvider();
    this.fileExcluder = new FileWatcherExcluder(context);
    this.fileDecorator = new FilesViewDecorator(context);

    this.foldersTreeView = vscode.window.createTreeView(
      ExtensionBrandResolver.treeview1, {
        treeDataProvider: this.foldersViewProvider,
        canSelectMany: true,
        showCollapseAll: true,
        dragAndDropController: this.foldersDragController
    });
    this.justFilesTreeView = vscode.window.createTreeView(
      ExtensionBrandResolver.treeview2, {
        treeDataProvider: this.justFilesViewProvider,
        canSelectMany: true,
        showCollapseAll: true,
        dragAndDropController: this.justFilesDragController
    });    
    this.foldersTreeView.title = undefined;
    this.justFilesTreeView.title = undefined;

    ExtensionStaticService.addDisposablesOnce(
      this.fileDecorator,
      this.fileExcluder,
      this.fileWatcher,
      this.justFilesTreeView,
      this.foldersTreeView,
      this.foldersViewProvider,
      this.justFilesViewProvider
    );
    this.commandRegistrator.targeting = {
      on:  this.fileDecorator.setTargeted.bind(this.fileDecorator),
      off: this.fileDecorator.resetTargeted.bind(this.fileDecorator),
    };
    this.justFilesViewProvider.highlighting = {
      add: this.fileDecorator.addHighlights.bind(this.fileDecorator),
      rem: this.fileDecorator.removeHighlight.bind(this.fileDecorator),
      clr: this.fileDecorator.clearHighlights.bind(this.fileDecorator),
      has: this.fileDecorator.hasHighlight.bind(this.fileDecorator)
    };
    const didExpand1 = this.foldersTreeView.onDidExpandElement((event) =>
      this.foldersViewProvider.addCollapsingElement(event.element)
    );
    const didCollapse1 = this.foldersTreeView.onDidCollapseElement((event) =>
      this.foldersViewProvider.removeCollapsingElement(event.element)
    );
    const didExpand2 = this.justFilesTreeView.onDidExpandElement((event) =>
      this.justFilesViewProvider.expandElement(event.element as FileItem)
    );
    const didCollapse2 = this.justFilesTreeView.onDidCollapseElement((event) =>
      this.justFilesViewProvider.collapseElement(event.element as FileItem)
    );
    const didShow1 = this.foldersTreeView.onDidChangeVisibility((event) =>
      event.visible && this.renameTreeViews()
    );
    const didShow2 = this.justFilesTreeView.onDidChangeVisibility((event) =>
      event.visible && this.renameTreeViews()
    );
    context.subscriptions.push(
      didExpand1, didCollapse1, didExpand2, didCollapse2, didShow1, didShow2
    );
  }

  public subscribe() {
    
    this.subscribeWatcher();
    this.subscribeKeybindings();
    this.subscribeDecoratorAndRegister();
    this.subscribeDidChangedTextEditor();
    this.subscribeRegistrator();
    this.subscribeRestore();
    this.subscribeShowLogs();
    this.subscribeShowAll();
    this.subscribeShowExact();
    this.subscribeShow();
    this.subscribeHide();
    this.subscribeAddFromTab();
    this.subscribeRemoveFromTab();
    this.subscribeAddFromCommand();
    this.subscribeRemoveFromCommand();
    this.subscribeAddFromExplorer();
    this.subscribeCleanJustView();
    this.subscribeChanges();
    this.subscribeConfigurationChanges();
    this.subscribeSwitchView();
    this.subscribeSwitchIgnore();
    this.subscribeRefreshFilesView();
    this.subscribeRefreshJustFilesView();
    this.subscribeSearchList();
    this.subscribeRevealInExplorer();
    this.subscribeCollapseToFolder();
    this.subscribeUncollapseAll();
    this.subscribeCollectAllMarked();
    this.subscribeRefuseAllMarked();
    this.subscribeOpenFolder();
    this.subscribeCloseFolder();
    this.subscribePreviewItemAndRegister();
  }

  private renameTreeViews() {
    if (this.foldersTreeView.title || this.justFilesTreeView.title) {
      return; }

    const projectName = getProjectName();
    if (projectName) {
      this.foldersTreeView.title = this.justFilesTreeView.title = projectName;
    }
  }
  
  private refreshTreeViews(item?: FileItem) {
    this.foldersViewProvider.refresh(item);
    this.justFilesViewProvider.refresh(item);
  };

  private changeItemInTreeViews(item: FileItemOrUriOr, onUri: vscode.Uri) {
    if (item) {
      this.foldersViewProvider.changeTreeItem(item, onUri).then(() =>
      this.justFilesViewProvider.changeTreeItem(item, onUri)).catch();
    }
  }

  private changeFileItem(item: FileItemOrUriOr, onUri: vscode.Uri) { 
    let changed = (item as any)?.resourceUri || (item as vscode.Uri);
    if (changed instanceof vscode.Uri) {
      this.fileDecorator.handleUri(changed, onUri);
      this.justFilesViewProvider.updateHighlighting(
        changed.toString(), onUri.toString()
      );
    }
    this.changeItemInTreeViews(item, onUri);
  
    if (this.foldersTreeView.visible) {
      this.foldersViewProvider.trySelectByUri(changed || onUri); }
    else if (!item) {
      this.foldersViewProvider.refresh();
    }
  }
    
  private async restoreFileItem(item: FileItem): Promise<void> {
    if (item.resourceUri && await isValidUri(item.resourceUri)) {
      vscode.window.showInformationMessage(
        `File is valid: ${getNicePath(item.resourceUri)}`
      );
      return;
    }
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      canSelectFolders: false,
      defaultUri: item.resourceUri
    });
    if (uris && uris.length > 0) {
      const uri = uris[0];
      await this.addOrHideOnJustFiles(getUriFrom(item), false);
      await this.addOrHideOnJustFiles(uri, true);

      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && same(activeEditor.document.uri, uri)) {
        await vscode.commands.executeCommand(
          brand.workbench.action.closeActiveEditor
        );
      }
    }
  }

  private revealFoldersViewFileItem(item: FileItem, expand?: boolean) {
    Promise.resolve(this.foldersTreeView.reveal(item, { expand: expand }))
           .catch((errors) => { LogService.error(errors);
         }).finally(() => { this.foldersViewProvider.releaseSelection();
         });
  }

  private revealJustFilesViewFileItem(item: FileItem, exp?: boolean) {
    Promise.resolve(sleep(small[1]))
           .then(() => this.justFilesTreeView.reveal(item, { expand: exp }))
           .catch((error) => { LogService.console.warn(error); });
  }

  private async openUriIfFolderViewEmpty(uri: vscode.Uri): Promise<boolean> {
    if (this.foldersViewProvider.isEmpty) {
      try {
        const yes = "Ok";
        const folder = await isFolder(uri);
        const answer = await vscode.window.showInformationMessage(
          `Open ${getNicePath(uri)} as a ${folder ? "folder" : "file"}?`,
          { modal: true },
          yes
        );
        if (answer === yes) {
          await vscode.commands.executeCommand(
            folder ? brand.vscode.openFolder : brand.vscode.open,
            uri
          );
        } }
      catch (error) {
        LogService.log(error);
      }
      return true;
    }
    return false;
  }

  private async openUriOrRemoveFromView(uri: vscode.Uri): Promise<void> {
    const opened = await this.openUriIfFolderViewEmpty(uri);
    if (!opened) {
      await vscode.commands.executeCommand(brand.removeItemFromTabMenu, uri);
    }
  }

  private async fillIgnoredFiles(): Promise<void> {
    const file = await this.referenceProvider.readIgnoreFile({
      showDialog: true
    });
    const antipattern = await this.referenceProvider.createRegexFrom(file);
    this.foldersViewProvider.setIgnoredItems(antipattern);
  }

  private async addOrHideOnJustFilesByUris(
    uris: vscode.Uri[],
    add: boolean
  ): Promise<void> {
    const allowed = add ? uris.filter((uri) =>
      this.foldersViewProvider.canBeCreated(uri)) : uris;
    const all = Promise.all(allowed.map((uri) => manager.createFileItem(uri)));
    const items = await all;
    const hide = add !== true;
    for (const item of items) {
      this.foldersViewProvider.prepareState(item);
      this.foldersViewProvider.prepareLabel(item);
      hide ? await this.justFilesViewProvider.removeFileItem(item)
           : await this.justFilesViewProvider.addFileItem(item);
    }
    const selected = !hide && items.length === 1 ? items[0] : undefined;
    this.justFilesViewProvider.refresh(selected);
  }
  
  private async addOrHideOnJustFiles<T extends FileItem>(
    it: vscode.Uri | T,
    add: boolean
  ): Promise<void> {
    if (add && it instanceof EmptyFolderItem) { return; }
    if (add && !this.foldersViewProvider.canBeCreated(it as vscode.Uri)) {
      return;
    }
    const item = it instanceof FileItem ? it : await manager.createFileItem(it);
    {
      this.foldersViewProvider.prepareState(item); 
      this.foldersViewProvider.prepareLabel(item);
      add === true ?
        await this.justFilesViewProvider.addFileItem(item)
      : await this.justFilesViewProvider.removeFileItem(item);
    }
    const selected = add ? item : undefined;
    this.justFilesViewProvider.refresh(selected);
  }
  /*-------------------------------subscribes---------------------------------*/
  private subscribeWatcher() { this.fileWatcher.watch(); }

  private subscribeKeybindings() { this.keybindingsService.initialized(); }

  private subscribeDecoratorAndRegister() {
    const registered = vscode.window.registerFileDecorationProvider(
      this.fileDecorator
    );
    const remark = vscode.commands.registerCommand(brand.remark, (item) => {
      const items = this.justFilesSelectedItems.some(
        (it) => item instanceof FileItem && item.like(it)
      ) ? this.justFilesSelectedItems : item;
      const array = Array.isArray(items) ? items : [items];
      array.forEach((it) => this.fileDecorator.handleUri(getUriFrom(it)));

      if  (this.justFilesSelectedItems.length === 1
        && this.justFilesSelectedItems[0] === item) {
        this.revealFoldersViewFileItem(item);
      }
    });
    this.context.subscriptions.push(registered, remark);
  }
 
  private subscribeDidChangedTextEditor() {
    const did = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor || !this.foldersTreeView.visible) { return; }

      const uri = editor.document.uri;
      if (!this.commandRegistrator.onRenaming()) {
        this.foldersViewProvider.trySelectByUri(uri);
      }
    });
    this.context.subscriptions.push(did);
  }

  private subscribeConfigurationChanges() {
    const did = vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration(ExtensionBrandResolver.configuration)) {
        await this.fileExcluder.didChangeConfiguration?.(event);

        ExtensionStaticService.updateCopyFileContentOnSingleCopy();
        ExtensionStaticService.updateTolerances(event);
        folders.setShowEmptyUncollapsedFolders();
        folders.setShowUncollapsedPlainFolders();
      }
    });
    this.context.subscriptions.push(did);
  }

  private subscribeRegistrator() {
    this.commandRegistrator.registerCommands();
    this.commandRegistrator.registerEditor();

    const getSelection = vscode.commands.registerCommand(brand.getSelected,
      async () => {
        await vscode.commands.executeCommand(brand.setSelected,
           this.lastSelectedView === "Files"
        && this.filesSelectedItems.length > 0 ?
            this.filesSelectedItems
          : this.justFilesSelectedItems.length > 0 ?
              this.justFilesSelectedItems
            : undefined
        );
    });
    this.context.subscriptions.push(getSelection);
  }

  private subscribeRestore() {
    const restore = vscode.commands.registerCommand(brand.restore,
      (fileItem: FileItem) => this.restoreFileItem(fileItem)
    );
    this.context.subscriptions.push(restore);
  }

  private subscribeShowLogs() {
    const print = vscode.commands.registerCommand(brand.showLogs,
      () => LogService.print()
    );
    this.context.subscriptions.push(print);
  }

  private subscribeShowAll() {
    const showAll = vscode.commands.registerCommand(brand.showAll,
      () => {
        this.justFilesViewProvider.removeAllHidden();
        this.justFilesViewProvider.refreshOnReload();
      });
    this.context.subscriptions.push(showAll);
  }

  private subscribeShowExact() {
    const showExact = vscode.commands.registerCommand(brand.showExact,
      async (fileItem) => {
        await this.justFilesViewProvider.removeAllParents(fileItem);
        this.justFilesViewProvider.refreshOnReload(fileItem);
      });
    this.context.subscriptions.push(showExact);
  }

  private subscribeShow() {
    const show = vscode.commands.registerCommand(brand.show,
      async (fileItem) => {
        const isFileItemContainedInFilesSelectedItems =
          this.filesSelectedItems.some((item) => item.like(fileItem));

        if (!fileItem || isFileItemContainedInFilesSelectedItems) {
          for (const item of this.filesSelectedItems) {
            await this.addOrHideOnJustFiles(item, true);
          } }
        else {
          await this.addOrHideOnJustFiles(fileItem, true); }
      });
    this.context.subscriptions.push(show);
  }

  private subscribeHide() {
    const hide = vscode.commands.registerCommand(brand.hide,
      async (fileItem) => {
        const isFileItemContainedInJustFilesSelectedItems =
          this.justFilesSelectedItems.some((item) =>
            item instanceof FileItem && item.like(fileItem)
          );

        if (!fileItem || isFileItemContainedInJustFilesSelectedItems) {
          const items = this.justFilesSelectedItems.filter(
                (item) => item instanceof FileItem).map(
                (item) => item.getUri());
          const uris = await Promise.all(items);
          await this.addOrHideOnJustFilesByUris(uris, false); }
        else if (fileItem instanceof FileItem) {
          await this.addOrHideOnJustFiles(fileItem, false);
        }
      });
    this.context.subscriptions.push(hide);
  }

  private subscribeAddFromTab() {
    const addFromTab = vscode.commands.registerCommand(
      brand.addItemFromTabMenu,
      async (uri) => await this.addOrHideOnJustFiles(getUriFrom(uri), true));
    this.context.subscriptions.push(addFromTab);
  }

  private subscribeRemoveFromTab() {
    const removeFromTab = vscode.commands.registerCommand(
      brand.removeItemFromTabMenu,
      async (uri) => await this.addOrHideOnJustFiles(getUriFrom(uri), false));
    this.context.subscriptions.push(removeFromTab);
  }

  private subscribeAddFromCommand() {
    const addFromCommand = vscode.commands.registerCommand(
      brand.addItemFromCommand, async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          await this.addOrHideOnJustFiles(activeEditor.document.uri, true);
        }
      });
    this.context.subscriptions.push(addFromCommand);
  }

  private subscribeRemoveFromCommand() {
    const removeFromCommand = vscode.commands.registerCommand(
      brand.removeItemFromCommand, async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          await this.addOrHideOnJustFiles(activeEditor.document.uri, false);
        }
      });
    this.context.subscriptions.push(removeFromCommand);
  }

  private subscribeAddFromExplorer() {
    const addFromExplorer = vscode.commands.registerCommand(
      brand.addItemFromExplorer, async (uri) =>
        await this.addOrHideOnJustFiles(getUriFrom(uri), true));
    this.context.subscriptions.push(addFromExplorer);
  }

  private subscribeOpenFolder() {
    const openFolder = vscode.commands.registerCommand(brand.openFolder,
      () => vscode.commands.executeCommand(brand.vscode.openFolder));
    this.context.subscriptions.push(openFolder);
  }
  
  private subscribeCloseFolder() {
    const closeFolder = vscode.commands.registerCommand(brand.closeFolder,
      () => vscode.commands.executeCommand(brand.workbench.action.closeFolder)
    );
    this.context.subscriptions.push(closeFolder);
  }

  private subscribeRevealInExplorer() {
    const reveal = vscode.commands.registerCommand(brand.revealInSidebar,
      async (fileItem) => {
        const uri: vscode.Uri = getUriFrom(fileItem);
        const isViewEmpty = await this.openUriIfFolderViewEmpty(uri);

        if (!isViewEmpty) {
          vscode.commands.executeCommand(brand.revealInExplorer, uri);
        }
    });
    this.context.subscriptions.push(reveal);
  }

  private subscribeRefuseAllMarked() {
    const refuse = vscode.commands.registerCommand(brand.refuseMarked,
      () => this.fileDecorator.refuse());
    this.context.subscriptions.push(refuse);
  }

  private subscribeCollectAllMarked() {
    const collect = vscode.commands.registerCommand(brand.collectMarked,
      async () => {
        this.justFilesViewProvider.populateHighlightings();

        const uris = await this.fileDecorator.getDecorationsAsUris();
        await this.addOrHideOnJustFilesByUris(uris, true);
      });
    this.context.subscriptions.push(collect);
  }

  private subscribeCollapseToFolder() {
    const collapseToFolder = vscode.commands.registerCommand(
      brand.collapseFolder, async (item) => {
        if (item instanceof FileItem) {
          await this.foldersViewProvider.collapseOrUncollapseItem(item);
        }
      });
    this.context.subscriptions.push(collapseToFolder);
  }

  private subscribeUncollapseAll() {
    const uncollapseAll = vscode.commands.registerCommand(brand.uncollapseAll,
      async (folderItem) => {
        if (await isProjectTooLarge(folderItem)) {
          const yes = "Yes, use ignore file";
          const answer = await vscode.window.showWarningMessage(
            `You are switching to mode showing all files in the project.
            It could be very time-consuming to load.
            Didn't you forget to turn on skipping files
            by .gitignore in the project?`,
            yes, "No"
          );
          if (answer === yes) {
            this.foldersViewProvider.resetOrNotIgnoredItems();
            await this.fillIgnoredFiles();
          }
        }
        this.foldersViewProvider.setWorkspaceFolderFrom(folderItem);
        this.foldersViewProvider.couldUncollapseAll(true);
      }
    );
    this.context.subscriptions.push(uncollapseAll);
  }

  private subscribePreviewItemAndRegister() {
    const provider = vscodes.window.registerWebviewViewProvider(
      ExtensionBrandResolver.webview,
      this.previewProvider
    );
    const preview = vscode.commands.registerCommand(brand.previewItem,
      async (uriOr) => {
        const uri: vscode.Uri = getUriFrom(uriOr);
        if (!this.previewProvider.canBeShownAsWebView()) {
          await vscode.commands.executeCommand(
            brand.workbench.view.extension.webviewContainer);
          await vscode.commands.executeCommand(brand.focus("Preview"));
        }
        await this.previewProvider.showAsWebView(uri);
        if (this.foldersTreeView.visible) {
          await vscode.commands.executeCommand(
            brand.workbench.view.extension.treeviewContainer);
          await vscode.commands.executeCommand(brand.focus("Files"));

          this.foldersViewProvider.trySelectByUri(uri);
        }
      });
    this.context.subscriptions.push(provider, preview);
  }

  private subscribeCleanJustView() {
    const cleanJustView = vscode.commands.registerCommand(brand.removeAll,
      () => this.justFilesViewProvider.clean());
    this.context.subscriptions.push(cleanJustView);
  }

  private subscribeSwitchIgnore() {
    const switchIgnore = (command: string) => vscode.commands.registerCommand(
      command, async () => {
        const wasReset = this.foldersViewProvider.resetOrNotIgnoredItems();
        if  (!wasReset) {
          await this.fillIgnoredFiles();
        }
        this.foldersViewProvider.refresh();
      });
    this.context.subscriptions.push(switchIgnore(brand.ignore));
    this.context.subscriptions.push(switchIgnore(brand.ignoreback));
  }

  private subscribeSwitchView() {
    const switchView = (command: string) => vscode.commands.registerCommand(
      command, () => {
        this.foldersViewProvider.plainMode =
          !this.foldersViewProvider.plainMode;

        if (!this.foldersViewProvider.plainMode) {
          this.foldersViewProvider.couldUncollapseAll(false);
        } else {
          this.foldersViewProvider.refresh();
        }
      }
    );
    this.context.subscriptions.push(switchView(brand.switch));
    this.context.subscriptions.push(switchView(brand.switchback));
  }
    
  private subscribeSearchList() {
    const search = async (list: vscodes.Searchable, exec: ()=> Promise<void>) =>
    { await exec();

      list.onSearch = !list.onSearch;
      await vscode.commands.executeCommand(
        list.onSearch ? brand.list.find : brand.list.closeFind
      );
    };
    const searchList = {
      folders: () => search(this.foldersViewProvider,
        async () => vscode.commands.executeCommand(brand.focus("Files"))
      ),
      justfiles: () => search(this.justFilesViewProvider,
        async () => vscode.commands.executeCommand(brand.focus("Just Files"))
      ) 
    };
    const searchListFiles = vscode.commands.registerCommand(
      brand.searchListFiles, searchList.folders);
    const searchListJustFiles = vscode.commands.registerCommand(
      brand.searchListJustFiles, searchList.justfiles);
    const searchListActiveFiles = vscode.commands.registerCommand(
      brand.searchListActiveFiles, searchList.folders);
    const searchListActiveJustFiles = vscode.commands.registerCommand(
      brand.searchListActiveJustFiles, searchList.justfiles);
    this.context.subscriptions.push(
      searchListFiles,       searchListJustFiles,
      searchListActiveFiles, searchListActiveJustFiles
    );
  }

  private subscribeRefreshFilesView() {
    const refreshFilesView = vscode.commands.registerCommand(
      brand.refreshFiles, () => {
        if (this.foldersViewProvider.isEmpty) {
          vscode.commands.executeCommand(brand.closeFolder); }
        else {
          this.foldersViewProvider.focusRoot();
          this.justFilesViewProvider.populateHighlightings();
        }
      }
    );
    this.context.subscriptions.push(refreshFilesView);
  }

  private subscribeRefreshJustFilesView() {
    const refreshAndSwitchSortedMode = () => {
      this.justFilesViewProvider.sortedMode =
        !this.justFilesViewProvider.sortedMode;

      this.justFilesViewProvider.refresh();
    };
    const refreshJustFilesView = vscode.commands.registerCommand(
      brand.refreshJustFiles, () => refreshAndSwitchSortedMode()
    );
    const refreshSortedJustFilesView = vscode.commands.registerCommand(
      brand.refreshSortedJustFiles, () => refreshAndSwitchSortedMode()
    );
    this.context.subscriptions.push(refreshJustFilesView);
    this.context.subscriptions.push(refreshSortedJustFilesView);
  }

  private subscribeChanges() {
    const did1 = this.justFilesTreeView.onDidChangeSelection(async (e) => {
      if (!e.selection.some((i) => i instanceof PlaceholderItem)) {
        this.justFilesSelectedItems = e.selection;
        this.lastSelectedView = "Just Files";
        await vscode.commands.executeCommand(brand.setContext,
          brand.isActive, true);
      } else {
        await vscode.commands.executeCommand(
          brand.workbench.action.focusActiveEditorGroup
        );
      }
    });
    const did2 = this.foldersTreeView.onDidChangeSelection(async (event) => {
      if (!event.selection.some((i) => i instanceof RootFileItem)) {
        this.filesSelectedItems = event.selection;
        this.lastSelectedView = "Files";

        await vscode.commands.executeCommand(brand.setContext,
          brand.isActive, false);
        if (!this.foldersViewProvider.rootIsShown()) {
          this.foldersViewProvider.rootIsShown(true);
        } }
      else {
        this.foldersViewProvider.rootIsShown(false);
      }
    });
    const did3 = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      this.foldersViewProvider.didChangeWorkspaceFolders?.().then(() =>
        this.fileExcluder.didChangeWorkspaceFolders?.(event).then(() =>
          this.fileWatcher.didChangeWorkspaceFolders?.(event).then(() =>
            this.refreshTreeViews()
      )));
    });
    this.context.subscriptions.push(did1, did2, did3);
  }
}
