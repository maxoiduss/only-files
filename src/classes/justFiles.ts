import * as vscode from "vscode";
import { CommandRegistrator } from "./commandRegistrator";
import { FileItem, PlaceholderItem, RootFileItem } from "./fileItem";
import { FileItemManager } from "./fileItemManager";
import { FilesViewDecorator } from "./filesViewDecorator";
import { FoldersDragController } from "./foldersDragController";
import { FoldersReferenceProvider } from "./foldersReferenceProvider";
import { FoldersViewProvider } from "./foldersViewProvider";
import { JustFilesDragController } from "./justFilesDragController";
import { JustFilesViewProvider } from "./justFilesViewProvider";
import { PreviewProvider } from "./previewProvider";
import { brand, ExtensionBrandResolver } from "./extensionBrandResolver";
import { LogService } from "./logService";
import { getUriFrom, initTypes, isFolder, isProjectTooLarge, same 
} from "./utilManager";

export class JustFiles {
  justFilesSelectedItems: readonly (FileItem | PlaceholderItem)[] = [];
  filesSelectedItems: readonly FileItem[] = [];

  commandRegistrator: CommandRegistrator;
  referenceProvider: FoldersReferenceProvider;
  justFilesViewProvider: JustFilesViewProvider;
  foldersViewProvider: FoldersViewProvider;
  previewProvider: PreviewProvider;
  fileDecorator: FilesViewDecorator;

  justFilesTreeView: vscode.TreeView<FileItem | PlaceholderItem>;
  foldersTreeView: vscode.TreeView<FileItem>;

  justFilesDragController: JustFilesDragController;
  foldersDragController: FoldersDragController;

  static { initTypes(); }

  private static instance: JustFiles | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
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
    JustFiles.instance = this;

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
    const didExpand = this.foldersTreeView.onDidExpandElement((event) =>
      this.foldersViewProvider.addCollapsingElement(event.element)
    );
    const didCollapse = this.foldersTreeView.onDidCollapseElement((event) =>
      this.foldersViewProvider.removeCollapsingElement(event.element)
    );
    context.subscriptions.push(didExpand, didCollapse);
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
      this.justFilesViewProvider.changeFileItem(changed, onUri);
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
          `Open ${uri.fsPath} as a ${folder ? "folder" : "file"}?`,
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
    if (item.resourceUri && await isFolder(item.resourceUri) !== undefined) {
      vscode.window.showInformationMessage(
        `File is valid: ${item.resourceUri.fsPath}`
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
      this.addOrHideOnJustFiles(getUriFrom(item), false);
      this.addOrHideOnJustFiles(uri, true);

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
    this.foldersViewProvider.setIgnoreItems(antipattern);
  }
  
  private addOrHideOnJustFiles(uriOr: string | vscode.Uri, add: boolean) {
    const factory = new FileItemManager();
    const item = factory.createFileItem(uriOr);
    add === true ?
      this.justFilesViewProvider.addFileItem(item)
    : this.justFilesViewProvider.addHideFileItem(item);
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
        CommandRegistrator.updateTolerances();
        this.foldersViewProvider.setShowEmptyUncollapsedFolders();
      }
    });
    this.context.subscriptions.push(did);
  }

  subscribeRegistrator() {
    this.commandRegistrator.registerCommands();
    this.commandRegistrator.registerEditor();

    const getSelection = vscode.commands.registerCommand(brand.getSelected,
      async () => {
        await vscode.commands.executeCommand(
          brand.setSelected,
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
      (fileItem) => {
        const isFileItemContainedInFilesSelectedItems =
          this.filesSelectedItems.some((item) => item.like(fileItem));

        if (!fileItem || isFileItemContainedInFilesSelectedItems)
        {
          this.filesSelectedItems.map((item) => {
            this.justFilesViewProvider.addFileItem(item as FileItem);
            this.justFilesViewProvider.refresh();
          });
        } else {
          this.justFilesViewProvider.addFileItem(fileItem);
          this.justFilesViewProvider.refresh();
        }
      }
    );
    this.context.subscriptions.push(show);
  }

  subscribeHide() {
    const hide = vscode.commands.registerCommand(brand.hide,
      (fileItem) => {
        const isFileItemContainedInJustFilesSelectedItems =
          this.justFilesSelectedItems.some((item) =>
            item instanceof FileItem && item.like(fileItem)
          );

        if (!fileItem || isFileItemContainedInJustFilesSelectedItems)
        {
          this.justFilesSelectedItems.map(async (item) => {
            this.justFilesViewProvider.addHideFileItem(item as FileItem);
            this.justFilesViewProvider.refresh();
          });
        } else {
          this.justFilesViewProvider.addHideFileItem(fileItem);
          this.justFilesViewProvider.refresh();
        }
      }
    );
    this.context.subscriptions.push(hide);
  }

  subscribeAddFromTab() {
    const addFromTab = vscode.commands.registerCommand(
      brand.addItemFromTabMenu, (uri) =>
        this.addOrHideOnJustFiles(uri, true)
    );
    this.context.subscriptions.push(addFromTab);
  }

  subscribeRemoveFromTab() {
    const removeFromTab = vscode.commands.registerCommand(
      brand.removeItemFromTabMenu, async (uri) =>
        this.addOrHideOnJustFiles(uri.path, false)
    );
    this.context.subscriptions.push(removeFromTab);
  }

  subscribeAddFromCommand() {
    const addFromCommand = vscode.commands.registerCommand(
      brand.addItemFromCommand, () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          this.addOrHideOnJustFiles(activeEditor.document.uri, true);
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
          this.addOrHideOnJustFiles(activeEditor.document.uri, false);
        }
      }
    );
    this.context.subscriptions.push(removeFromCommand);
  }

  subscribeAddFromExplorer() {
    const addFromExplorer = vscode.commands.registerCommand(
      brand.addItemFromExplorer, (uri) =>
        this.addOrHideOnJustFiles(uri.path, true)
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
      brand.uncollapseAll, async () => {
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
        this.foldersViewProvider.canUncollapseAll(true);
        this.foldersViewProvider.switchPlainModeTag();
      }
    );
    this.context.subscriptions.push(uncollapseAll);
  }

  subscribePreviewItemAndRegister() {
    const provider = vscode.window.registerWebviewViewProviderWithDefaults(
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
        await this.previewProvider.showAsWebView(uri.fsPath);
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
        const wasSet = this.foldersViewProvider.resetIgnoreItems();
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
          this.foldersViewProvider.canUncollapseAll(false);
        }
        this.foldersViewProvider.refresh();
      }
    );
    this.context.subscriptions.push(switchView(brand.switch));
    this.context.subscriptions.push(switchView(brand.switchback));
  }
    
  subscribeSearchList() {
    const searchListFiles = vscode.commands.registerCommand(
      brand.searchListFiles, async () => {
        await vscode.commands.executeCommand(brand.focus("Files"));

        this.foldersViewProvider.onSearch =
          !this.foldersViewProvider.onSearch;
        if (this.foldersViewProvider.onSearch) {
          await vscode.commands.executeCommand(brand.list.closeFind);
          return;
        }
        await vscode.commands.executeCommand(brand.list.find);
      }
    );
    const searchListJustFiles = vscode.commands.registerCommand(
      brand.searchListJustFiles, async () => {
        await vscode.commands.executeCommand(brand.focus("Just Files"));

        this.justFilesViewProvider.onSearch =
          !this.justFilesViewProvider.onSearch;
        if (this.justFilesViewProvider.onSearch) {
          await vscode.commands.executeCommand(brand.list.closeFind);
          return;
        }
        await vscode.commands.executeCommand(brand.list.find);
      }
    );
    this.context.subscriptions.push(searchListFiles, searchListJustFiles);
  }

  subscribeRefreshFilesView() {
    const refreshFilesView = vscode.commands.registerCommand(
      brand.refreshFiles, () => {
        this.foldersViewProvider.refresh();
        this.foldersViewProvider.revealRoot();
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
    const remove = vscode.workspace.onDidDeleteFiles((item) => {
      const factory = new FileItemManager();
      item.files.map((file) => {
        const removedItem = factory.createFileItem(file.path);
        this.justFilesViewProvider.removeItemFromJustFiles(removedItem);
      });
      this.refreshAllViews();
    });
    this.context.subscriptions.push(
      change1, change2, rename, remove, create
    );
  }

  static dispose() {
    JustFiles.instance?.foldersTreeView.dispose();
    JustFiles.instance?.justFilesTreeView.dispose();
    JustFiles.instance?.foldersViewProvider.dispose();
    JustFiles.instance?.justFilesViewProvider.dispose();
  }
}
