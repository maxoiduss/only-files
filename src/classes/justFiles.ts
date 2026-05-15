import * as vscode from "vscode";
import * as vzcode from "../interfaces/vzcode";
import * as manager from "./fileItemManager";
import * as folders from "./foldersProviderHelper";
import { CommandRegistrator } from "./commandRegistrator";
import { FilesViewDecorator } from "./filesViewDecorator";
import { FoldersDragController } from "./foldersDragController";
import { FoldersReferenceProvider } from "./foldersReferenceProvider";
import { FoldersViewProvider } from "./foldersViewProvider";
import { JustFilesDragController } from "./justFilesDragController";
import { JustFilesViewProvider } from "./justFilesViewProvider";
import { PreviewProvider } from "./previewProvider";
import { brand, ExtensionBrandResolver } from "./extensionBrandResolver";
import { ExtensionStaticService } from "./extensionStaticService";
import { LogService } from "./logService";
import {
  EmptyFolderItem, FileItem, PlaceholderItem, RootFileItem
} from "./fileItem";
import {
  getNicePath, getUriFrom, isFolder, isProjectTooLarge, isValidUri, same, window 
} from "./utilManager";

export class JustFiles {
  private justFilesSelectedItems: readonly (FileItem | PlaceholderItem)[] = [];
  private filesSelectedItems: readonly FileItem[] = [];
  private readonly context: vscode.ExtensionContext;

  private commandRegistrator: CommandRegistrator;
  private referenceProvider: FoldersReferenceProvider;
  private previewProvider: PreviewProvider;
  private fileDecorator: FilesViewDecorator;
  
  private justFilesDragController: JustFilesDragController;
  private foldersDragController: FoldersDragController;

  public readonly justFilesViewProvider: JustFilesViewProvider;
  public readonly foldersViewProvider: FoldersViewProvider;
  public readonly justFilesTreeView: vscode.TreeView<FileItem |PlaceholderItem>;
  public readonly foldersTreeView: vscode.TreeView<FileItem>;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.justFilesViewProvider = new JustFilesViewProvider(context);
    this.foldersViewProvider = new FoldersViewProvider(context,
      this.revealFilesTreeViewItem.bind(this));
    this.commandRegistrator = new CommandRegistrator(context,
      this.refreshAllViews.bind(this),
      this.changeFileItem.bind(this)
    );
    this.previewProvider = new PreviewProvider(context);
    this.justFilesDragController = new JustFilesDragController();
    this.foldersDragController = new FoldersDragController(
      this.commandRegistrator,
      this.openUriOrRemoveFromView.bind(this)
    );
    this.referenceProvider = new FoldersReferenceProvider();
    this.fileDecorator = new FilesViewDecorator(context);
    ExtensionStaticService.justFilesInstance = this;

    this.justFilesTreeView = vscode.window.createTreeView(
      ExtensionBrandResolver.treeview2, {
      treeDataProvider: this.justFilesViewProvider,
      canSelectMany: true,
      showCollapseAll: true,
      dragAndDropController: this.justFilesDragController
    });
    this.foldersTreeView = vscode.window.createTreeView(
      ExtensionBrandResolver.treeview1, {
      treeDataProvider: this.foldersViewProvider,
      canSelectMany: true,
      showCollapseAll: true,
      dragAndDropController: this.foldersDragController
    });
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
    context.subscriptions.push(
      didExpand1, didCollapse1, didExpand2, didCollapse2
    );
  }

  private changeFileItem(changed: FileItem | undefined, onUri: vscode.Uri) {
    if (this.foldersTreeView.visible) {
      this.foldersViewProvider.trySelectByUri(changed?.resourceUri || onUri);
      if (changed) { this.foldersViewProvider.refresh(changed); }
    } else {
      this.foldersViewProvider.refresh();
    }
    if (changed) {
      changed.resourceUri ?
        this.fileDecorator.handleUri(changed.resourceUri, onUri) : {};
      this.justFilesViewProvider.changeTreeItem(changed, onUri);
    } else {
      this.justFilesViewProvider.refreshIfExistsFileItemByUri(onUri);
    }
  }

  private revealFilesTreeViewItem(element: FileItem, expand?: boolean) {
    Promise.resolve(this.foldersTreeView.reveal(element, { expand: expand }))
           .then(() => {
         }).catch((errors) => { LogService.error(errors);
         }).finally(() => { this.foldersViewProvider.releaseSelection();
         });
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
        }
      } catch (error) {
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
  ) {
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
    this.justFilesViewProvider.refresh();
  }
  
  private async addOrHideOnJustFiles<T extends FileItem>(
    it: vscode.Uri | T,
    add: boolean
  ) {
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
    this.justFilesViewProvider.refresh();
  }

  private refreshAllViews(item?: FileItem) {
    this.foldersViewProvider.refresh(item);
    this.justFilesViewProvider.refresh(item);
  };
  
  subscribe() {
    this.subscribeDecoratorAndRegister();
    this.subscribeDidChangedTextEditor();
    this.subscribeRegistrator();
    this.subscribeRestore();
    this.subscribeShowLogs();
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

  subscribeDecoratorAndRegister() {
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
        this.revealFilesTreeViewItem(item);
      }
    });
    this.context.subscriptions.push(registered, remark);
  }
 
  subscribeDidChangedTextEditor() {
    const did = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor || !this.foldersTreeView.visible) { return; }

      const uri = editor.document.uri;
      if (!this.commandRegistrator.onRenaming()) {
        this.foldersViewProvider.trySelectByUri(uri);
      }
    });
    this.context.subscriptions.push(did);
  }

  subscribeConfigurationChanges() {
    const did = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(ExtensionBrandResolver.configuration)) {
        ExtensionStaticService.updateTolerances();
        folders.setShowEmptyUncollapsedFolders();
        folders.setShowUncollapsedPlainFolders();
      }
    });
    this.context.subscriptions.push(did);
  }

  subscribeRegistrator() {
    this.commandRegistrator.registerCommands();
    this.commandRegistrator.registerEditor();

    const getSelection = vscode.commands.registerCommand(brand.getSelected,
      async () => {
        await vscode.commands.executeCommand(brand.setSelected,
          this.filesSelectedItems.length > 0 ?
            this.filesSelectedItems
          : this.justFilesSelectedItems.length > 0 ?
              this.justFilesSelectedItems
            : undefined
        );
    });
    this.context.subscriptions.push(getSelection);
  }

  subscribeRestore() {
    const restore = vscode.commands.registerCommand(brand.restore,
      (fileItem: FileItem) => this.restoreFileItem(fileItem)
    );
    this.context.subscriptions.push(restore);
  }

  subscribeShowLogs() {
    const print = vscode.commands.registerCommand(brand.showLogs,
      () => LogService.print()
    );
    this.context.subscriptions.push(print);
  }

  subscribeShow() {
    const show = vscode.commands.registerCommand(brand.show,
      async (fileItem) => {
        const isFileItemContainedInFilesSelectedItems =
          this.filesSelectedItems.some((item) => item.like(fileItem));

        if (!fileItem || isFileItemContainedInFilesSelectedItems)
        {
          for (const item of this.filesSelectedItems) {
            await this.addOrHideOnJustFiles(item, true);
          }
        } else {
          await this.addOrHideOnJustFiles(fileItem, true);
        }
      }
    );
    this.context.subscriptions.push(show);
  }

  subscribeHide() {
    const hide = vscode.commands.registerCommand(brand.hide,
      async (fileItem) => {
        const isFileItemContainedInJustFilesSelectedItems =
          this.justFilesSelectedItems.some((item) =>
            item instanceof FileItem && item.like(fileItem)
          );

        if (!fileItem || isFileItemContainedInJustFilesSelectedItems)
        {
          this.justFilesSelectedItems.forEach((item) => {
            if (item instanceof FileItem) {
              this.addOrHideOnJustFiles(item, false);
            }
          });
        } else if (fileItem instanceof FileItem) {
          await this.addOrHideOnJustFiles(fileItem, false);
        }
      }
    );
    this.context.subscriptions.push(hide);
  }

  subscribeAddFromTab() {
    const addFromTab = vscode.commands.registerCommand(
      brand.addItemFromTabMenu, async (uri) =>
        await this.addOrHideOnJustFiles(getUriFrom(uri), true)
    );
    this.context.subscriptions.push(addFromTab);
  }

  subscribeRemoveFromTab() {
    const removeFromTab = vscode.commands.registerCommand(
      brand.removeItemFromTabMenu, async (uri) =>
        await this.addOrHideOnJustFiles(getUriFrom(uri), false)
    );
    this.context.subscriptions.push(removeFromTab);
  }

  subscribeAddFromCommand() {
    const addFromCommand = vscode.commands.registerCommand(
      brand.addItemFromCommand, async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          await this.addOrHideOnJustFiles(activeEditor.document.uri, true);
        }
      }
    );
    this.context.subscriptions.push(addFromCommand);
  }

  subscribeRemoveFromCommand() {
    const removeFromCommand = vscode.commands.registerCommand(
      brand.removeItemFromCommand, async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          await this.addOrHideOnJustFiles(activeEditor.document.uri, false);
        }
      }
    );
    this.context.subscriptions.push(removeFromCommand);
  }

  subscribeAddFromExplorer() {
    const addFromExplorer = vscode.commands.registerCommand(
      brand.addItemFromExplorer, async (uri) =>
        await this.addOrHideOnJustFiles(getUriFrom(uri), true)
    );
    this.context.subscriptions.push(addFromExplorer);
  }

  subscribeOpenFolder() {
    const openFolder = vscode.commands.registerCommand(brand.openFolder,
      () => vscode.commands.executeCommand(brand.vscode.openFolder)
    );
    this.context.subscriptions.push(openFolder);
  }
  
  subscribeCloseFolder() {
    const closeFolder = vscode.commands.registerCommand(brand.closeFolder,
      () => vscode.commands.executeCommand(brand.workbench.action.closeFolder)
    );
    this.context.subscriptions.push(closeFolder);
  }

  subscribeRevealInExplorer() {
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

  subscribeRefuseAllMarked() {
    const refuse = vscode.commands.registerCommand(brand.refuseMarked,
      () => this.fileDecorator.refuse()
    );
    this.context.subscriptions.push(refuse);
  }

  subscribeCollectAllMarked() {
    const collect = vscode.commands.registerCommand(brand.collectMarked,
      async () => {
        const uris = await this.fileDecorator.getDecorationsAsUris();
        await this.addOrHideOnJustFilesByUris(uris, true);
      }
    );
    this.context.subscriptions.push(collect);
  }

  subscribeCollapseToFolder() {
    const collapseToFolder = vscode.commands.registerCommand(
      brand.collapseFolder, async (item) => {
        if (item instanceof FileItem) {
          await this.foldersViewProvider.collapseOrUncollapseItem(item);
        }
      }
    );
    this.context.subscriptions.push(collapseToFolder);
  }

  subscribeUncollapseAll() {
    const uncollapseAll = vscode.commands.registerCommand(
      brand.uncollapseAll, async (folderItem) => {
        const projTooLarge = await isProjectTooLarge();
        if (projTooLarge) {
          const yes = "Yes, use ignore file";
          const answer = await vscode.window.showWarningMessage(
            `You are switching to mode showing all files in the project.
            It could be very time-consuming to load.
            Didn't you forget to turn on skipping files
            by .gitignore in the project?`,
            yes, "Cancel"
          );
          if (answer === yes) {
            await this.fillIgnoredFiles();
          }
        }
        this.foldersViewProvider.setWorkspaceFolderFrom(folderItem);
        this.foldersViewProvider.couldUncollapseAll(true);
        this.foldersViewProvider.switchPlainModeTag();
      }
    );
    this.context.subscriptions.push(uncollapseAll);
  }

  subscribePreviewItemAndRegister() {
    const provider = window.registerWebviewViewProvider(
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
        await vscode.commands.executeCommand(
          brand.workbench.view.extension.treeviewContainer);
        await vscode.commands.executeCommand(brand.focus("Files"));
        this.foldersViewProvider.trySelectByUri(uri);
      }
    );
    this.context.subscriptions.push(provider, preview);
  }

  subscribeCleanJustView() {
    const cleanJustView = vscode.commands.registerCommand(brand.removeAll,
      () => {
        this.justFilesViewProvider.clean();
        this.justFilesViewProvider.refresh();
      }
    );
    this.context.subscriptions.push(cleanJustView);
  }

  subscribeSwitchIgnore() {
    const switchIgnore = vscode.commands.registerCommand(
      brand.ignore, async () => {
        const wasSet = this.foldersViewProvider.resetIgnoredItems();
        if (!wasSet) {
          await this.fillIgnoredFiles();
        }
        this.foldersViewProvider.refresh();
      }
    );
    this.context.subscriptions.push(switchIgnore);
  }

  subscribeSwitchView() {
    const switchView = (command: string) => vscode.commands.registerCommand(
      command, () => {
        this.foldersViewProvider.plainMode =
          !this.foldersViewProvider.plainMode;
        
        this.foldersViewProvider.switchPlainModeTag();
        
        if (!this.foldersViewProvider.plainMode) {
          this.foldersViewProvider.couldUncollapseAll(false);
        }
        this.foldersViewProvider.refresh();
      }
    );
    this.context.subscriptions.push(switchView(brand.switch));
    this.context.subscriptions.push(switchView(brand.switchback));
  }
    
  subscribeSearchList() {
    const search = async (list: vzcode.Searchable, exec: () => Promise<void>) =>
    { await exec();

      list.onSearch = !list.onSearch;
      await vscode.commands.executeCommand(
        list.onSearch ? brand.list.find : brand.list.closeFind
      );
    };
    const searchListFiles = vscode.commands.registerCommand(
      brand.searchListFiles, () => search(this.foldersViewProvider,
          async () => vscode.commands.executeCommand(brand.focus("Files"))
        )
      );
    const searchListJustFiles = vscode.commands.registerCommand(
      brand.searchListJustFiles, () => search(this.justFilesViewProvider,
          async () => vscode.commands.executeCommand(brand.focus("Just Files"))
        )
      );
    this.context.subscriptions.push(searchListFiles, searchListJustFiles);
  }

  subscribeRefreshFilesView() {
    const refreshFilesView = vscode.commands.registerCommand(
      brand.refreshFiles, () => {
        if (this.foldersViewProvider.isEmpty) {
          vscode.commands.executeCommand(brand.closeFolder);
        } else {
          this.foldersViewProvider.refresh();
          this.foldersViewProvider.revealRoot();
        }
      }
    );
    this.context.subscriptions.push(refreshFilesView);
  }

  subscribeRefreshJustFilesView() {
    const refreshAndSwitchSortedMode = () => {
      this.justFilesViewProvider.sortedMode =
        !this.justFilesViewProvider.sortedMode;
        
      this.justFilesViewProvider.switchSortedModeTag();
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

  subscribeChanges() {
    const did1 = this.justFilesTreeView.onDidChangeSelection(async (e) => {
      if (!e.selection.some((i) => i instanceof PlaceholderItem)) {
        this.justFilesSelectedItems = e.selection;
      } else {
        await vscode.commands.executeCommand(
          brand.workbench.action.focusActiveEditorGroup
        );
      }
    });
    const did2 = this.foldersTreeView.onDidChangeSelection(async (event) => {
      if (!event.selection.some((i) => i instanceof RootFileItem)) {
        this.filesSelectedItems = event.selection;
        
        if (!this.foldersViewProvider.rootIsShown()) {
          this.foldersViewProvider.rootIsShown(true);
        }
      } else {
        this.foldersViewProvider.rootIsShown(false);
      }
    });
    this.context.subscriptions.push(did1, did2);

    const change1 = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.refreshAllViews();
    });
    const rename = vscode.workspace.onDidRenameFiles(() => {
      this.refreshAllViews();
    });
    const change2 = vscode.workspace.onDidChangeTextDocument(() => {
      this.refreshAllViews();
    });
    const create = vscode.workspace.onDidCreateFiles(() => {
      this.refreshAllViews();
    });
    const remove = vscode.workspace.onDidDeleteFiles(async (item) => {
      for (const uri of item.files) {
        await this.justFilesViewProvider.deleteItem(uri);
      }
      this.refreshAllViews();
    });
    this.context.subscriptions.push(
      change1, change2, rename, remove, create
    );
  }
}
