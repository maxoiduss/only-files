import * as vscode from "vscode";
import { brand, CommandRegistrator } from "./commandRegistrator";
import { FileItem, PlaceholderItem, RootFileItem } from "./fileItem";
import { FileItemManager } from "./fileItemManager";
import { FoldersDragController } from "./foldersDragController";
import { FoldersReferenceProvider } from "./foldersReferenceProvider";
import { FoldersViewProvider } from "./foldersViewProvider";
import { JustFilesDragController } from "./justFilesDragController";
import { JustFilesViewProvider } from "./justFilesViewProvider";
import { PreviewProvider } from "./previewProvider";
import { getUriFrom, initTypes, isProjectTooLarge } from "./utilManager";

export class JustFiles {
  private context: vscode.ExtensionContext;
  private refreshAllViews: Function;

  justFilesSelectedItems: readonly (FileItem | PlaceholderItem)[] = [];
  filesSelectedItems: readonly FileItem[] = [];

  commandRegistrator: CommandRegistrator;
  referenceProvider: FoldersReferenceProvider;
  justFilesViewProvider: JustFilesViewProvider;
  foldersViewProvider: FoldersViewProvider;
  previewProvider: PreviewProvider;

  justFilesTreeView: vscode.TreeView<FileItem | PlaceholderItem>;
  filesTreeView: vscode.TreeView<FileItem>;

  justFilesDragController: JustFilesDragController;
  filesDragController: FoldersDragController;

  static { initTypes(); }

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.refreshAllViews = () => {
      this.foldersViewProvider.refresh();
      this.justFilesViewProvider.refresh();
    };
    this.justFilesViewProvider = new JustFilesViewProvider(context);
    this.foldersViewProvider = new FoldersViewProvider(context,
      this.revealFilesTreeViewItem.bind(this));
    this.commandRegistrator = new CommandRegistrator(context,
      this.refreshAllViews);
    this.previewProvider = new PreviewProvider(context);
    this.justFilesDragController = new JustFilesDragController();
    this.filesDragController = new FoldersDragController(
      this.commandRegistrator,
      this.openUriIfFolderViewEmpty.bind(this)
    );
    this.referenceProvider = new FoldersReferenceProvider();

    this.justFilesTreeView = vscode.window.createTreeView("justFilesView", {
      treeDataProvider: this.justFilesViewProvider,
      canSelectMany: true,
      showCollapseAll: true,
      dragAndDropController: this.justFilesDragController
    });
    this.filesTreeView = vscode.window.createTreeView("filesView", {
      treeDataProvider: this.foldersViewProvider,
      canSelectMany: true,
      showCollapseAll: true,
      dragAndDropController: this.filesDragController
    });
    this.filesTreeView.onDidExpandElement(event =>
      this.foldersViewProvider.addCollapsingElement(event.element)
    );
    this.filesTreeView.onDidCollapseElement(event =>
      this.foldersViewProvider.removeCollapsingElement(event.element)
    );
  }

  subscribe() {
    this.subscribeDidChangedTextEditor();
    this.subscribeRegistrator();
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
    this.subscribeAndRegisterPreviewItem();
  }

  private async revealFilesTreeViewItem(element: FileItem, expand?: boolean) {
    try { await this.filesTreeView.reveal(element, { expand: expand }); }
    catch (error) {
      console.log(error);
    }
    finally {
      this.foldersViewProvider.showItemInExplorerByUriOrTrySelect();
    }
  }

  private async openUriIfFolderViewEmpty(uri: vscode.Uri): Promise<boolean> {
    if (this.foldersViewProvider.isEmpty) {
      try {
        const itemStat = await vscode.workspace.fs.stat(uri);
        const isFolder = (itemStat.type & vscode.FileType.Directory) === 
          vscode.FileType.Directory;
        const yes = "Ok";
        const answer = await vscode.window.showInformationMessage(
          `Open ${uri.fsPath} as a ${isFolder ? "folder" : "file"}?`,
          { modal: true },
          yes
        );
        if (answer === yes) {
          await vscode.commands.executeCommand(
            isFolder ? "vscode.openFolder" : "vscode.open",
            uri
          );
        }
      } catch (error) {
        console.log(error);
      }
      return true;
    }
    return false;
  }

  private async fillIgnoredFiles(): Promise<void> {
    const file = await this.referenceProvider.readIgnoreFile({
      showDialog: true
    });
    const antipattern = await this.referenceProvider.createRegexFrom(file);
    this.foldersViewProvider.setIgnoreItems(antipattern);
  }
 
  subscribeDidChangedTextEditor() {
    vscode.window.onDidChangeActiveTextEditor(async editor => {
      if (!editor || !this.filesTreeView.visible) { return; }

      const uri = editor.document.uri;
      this.foldersViewProvider.showItemInExplorerByUriOrTrySelect(uri);
    });
  }

  subscribeConfigurationChanges() {
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(`${brand}`)) {
        this.commandRegistrator.updateTolerances();
        this.foldersViewProvider.setShowEmptyUncollapsedFolders();
      }
    });
  }

  subscribeRegistrator() {
    this.commandRegistrator.registerCommands();

    const getSelection = vscode.commands.registerCommand(`${brand}.getSelected`,
      async () => {
      await vscode.commands.executeCommand(
        `${brand}.setSelected`,
        this.filesSelectedItems.length > 0 ?
          this.filesSelectedItems
        : this.justFilesSelectedItems.length > 0 ?
            this.justFilesSelectedItems
          : undefined
      );
    });
    this.context.subscriptions.push(getSelection);
  }

  subscribeShow() {
    const show = vscode.commands.registerCommand(
      `${brand}.show`,
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
    const hide = vscode.commands.registerCommand(
      `${brand}.hide`,
      (fileItem) => {
        const isFileItemContainedInJustFilesSelectedItems =
          this.justFilesSelectedItems.some(
            (item) => item instanceof FileItem && item.like(fileItem)
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
      `${brand}.addItemFromTabMenu`,
      (uri) => {
        const factory = new FileItemManager();
        const item = factory.createFileItem(uri);
        this.justFilesViewProvider.addFileItem(item);
        this.justFilesViewProvider.refresh();
      }
    );
    this.context.subscriptions.push(addFromTab);
  }

  subscribeRemoveFromTab() {
    const removeFromTab = vscode.commands.registerCommand(
      `${brand}.removeItemFromTabMenu`,
      async (uri) => {
        const factory = new FileItemManager();
        const item = factory.createFileItem(uri.path);
        this.justFilesViewProvider.addHideFileItem(item);
        this.justFilesViewProvider.refresh();
      }
    );
    this.context.subscriptions.push(removeFromTab);
  }

  subscribeAddFromCommand() {
    const addFromCommand = vscode.commands.registerCommand(
      `${brand}.addTabFromCommand`,
      () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          const itemUri = activeEditor.document.uri;
          const factory = new FileItemManager();
          const item = factory.createFileItem(itemUri);
          this.justFilesViewProvider.addFileItem(item);
          this.justFilesViewProvider.refresh();
        }
      }
    );
    this.context.subscriptions.push(addFromCommand);
  }

  subscribeRemoveFromCommand() {
    const removeFromCommand = vscode.commands.registerCommand(
      `${brand}.removeTabFromCommand`,
      async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          const itemUri = activeEditor.document.uri;
          const factory = new FileItemManager();
          const item = factory.createFileItem(itemUri);
          this.justFilesViewProvider.addHideFileItem(item);
          this.justFilesViewProvider.refresh();
        }
      }
    );
    this.context.subscriptions.push(removeFromCommand);
  }

  subscribeAddFromExplorer() {
    const addFromExplorer = vscode.commands.registerCommand(
      `${brand}.addItemFromExplorer`,
      (uri) => {
        const factory = new FileItemManager();
        const item = factory.createFileItem(uri.path);
        this.justFilesViewProvider.addFileItem(item);
        this.justFilesViewProvider.refresh();
      }
    );
    this.context.subscriptions.push(addFromExplorer);
  }

  subscribeOpenFolder() {
    const openFolder = vscode.commands.registerCommand(`${brand}.openFolder`,
      () => vscode.commands.executeCommand("vscode.openFolder")
    );
    this.context.subscriptions.push(openFolder);
  }
  
  subscribeCloseFolder() {
    const closeFolder = vscode.commands.registerCommand(`${brand}.closeFolder`,
      () => vscode.commands.executeCommand("workbench.action.closeFolder")
    );
    this.context.subscriptions.push(closeFolder);
  }

  subscribeRevealInExplorer() {
    const reveal = vscode.commands.registerCommand(`${brand}.revealInSidebar`,
      async (fileItem) => {
        const uri: vscode.Uri = getUriFrom(fileItem);
        const isViewEmpty = await this.openUriIfFolderViewEmpty(uri);

        if (!isViewEmpty) {
          vscode.commands.executeCommand("revealInExplorer", uri);
        }
    });
    this.context.subscriptions.push(reveal);
  }

  subscribeCollapseToFolder() {
    const collapseToFolder = vscode.commands.registerCommand(
      `${brand}.collapseFolder`,
      async (item) => {
        if (item instanceof FileItem) {
          await this.foldersViewProvider.collapseOrUncollapseItem(item);
        }
      }
    );
    this.context.subscriptions.push(collapseToFolder);
  }

  subscribeUncollapseAll() {
    const uncollapseAll = vscode.commands.registerCommand(
      `${brand}.uncollapseAll`,
      async () => {
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

  subscribeAndRegisterPreviewItem() {
    const provider = vscode.window.registerWebviewViewProviderWithDefaults(
      "preView", this.previewProvider
    );
    const preview = vscode.commands.registerCommand(
      `${brand}.previewItem`,
      async (uriOr) => {
        const uri: vscode.Uri = getUriFrom(uriOr);

        await this.previewProvider.showAsWebView(uri.fsPath);
        this.foldersViewProvider.showItemInExplorerByUriOrTrySelect(uri);
      }
    );
    this.context.subscriptions.push(provider);
    this.context.subscriptions.push(preview);
  }

  subscribeCleanJustView() {
    const cleanJustView = vscode.commands.registerCommand(
      `${brand}.removeAll`,
      () => {
        this.justFilesViewProvider.clean();
        this.justFilesViewProvider.refresh();
      }
    );
    this.context.subscriptions.push(cleanJustView);
  }

  subscribeSwitchIgnore() {
    const switchIgnore = vscode.commands.registerCommand(
      `${brand}.ignore`,
      async () => {
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
    const switchView = (comm: string) => vscode.commands.registerCommand(
      comm,
      () => {
        this.foldersViewProvider.plainMode =
          !this.foldersViewProvider.plainMode;
        
        this.foldersViewProvider.switchPlainModeTag();
        
        if (!this.foldersViewProvider.plainMode) {
          this.foldersViewProvider.canUncollapseAll(false);
        }
        this.foldersViewProvider.refresh();
      }
    );
    this.context.subscriptions.push(switchView(`${brand}.switch`));
    this.context.subscriptions.push(switchView(`${brand}.switchback`));
  }
    
  subscribeSearchList() {
    const searchListFiles = vscode.commands.registerCommand(
      `${brand}.searchListFiles`,
      async () => {
        await vscode.commands.executeCommand("filesView.focus");

        this.foldersViewProvider.onSearch =
          !this.foldersViewProvider.onSearch;
        if (this.foldersViewProvider.onSearch) {
          await vscode.commands.executeCommand("list.closeFind");
          return;
        }
        await vscode.commands.executeCommand("list.find");
      }
    );
    const searchListJustFiles = vscode.commands.registerCommand(
      `${brand}.searchListJustFiles`,
      async () => {
        await vscode.commands.executeCommand("justFilesView.focus");

        this.justFilesViewProvider.onSearch =
          !this.justFilesViewProvider.onSearch;
        if (this.justFilesViewProvider.onSearch) {
          await vscode.commands.executeCommand("list.closeFind");
          return;
        }
        await vscode.commands.executeCommand("list.find");
      }
    );
    this.context.subscriptions.push(searchListFiles, searchListJustFiles);
  }

  subscribeRefreshFilesView() {
    const refreshFilesView = vscode.commands.registerCommand(
      `${brand}.refreshFiles`,
      async () => {
        this.foldersViewProvider.refresh();
        await this.revealFilesTreeViewItem(this.foldersViewProvider.root, true);
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
      `${brand}.refreshJustFiles`, () => refreshAndSwitchSortedMode()
    );
    const refreshSortedJustFilesView = vscode.commands.registerCommand(
      `${brand}.refreshSortedJustFiles`, () => refreshAndSwitchSortedMode()
    );
    this.context.subscriptions.push(refreshJustFilesView);
    this.context.subscriptions.push(refreshSortedJustFilesView);
  }

  subscribeChanges() {
    this.justFilesTreeView.onDidChangeSelection(async (event) => {
      if (!event.selection.some((i) => i instanceof PlaceholderItem)) {
        this.justFilesSelectedItems = event.selection;
      } else {
        await vscode.commands.executeCommand(
          "workbench.action.focusActiveEditorGroup"
        );
      }
    });

    this.filesTreeView.onDidChangeSelection(async (event) => {
      if (!event.selection.some((i) => i instanceof RootFileItem)) {
        this.filesSelectedItems = event.selection;
        
        if (!this.foldersViewProvider.rootIsShown()) {
          this.foldersViewProvider.rootIsShown(true);
        }
      } else {
        this.foldersViewProvider.rootIsShown(false);
      }
    });

    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.refreshAllViews();
    });

    vscode.workspace.onDidRenameFiles(() => {
      this.refreshAllViews();
    });

    vscode.workspace.onDidChangeTextDocument(() => {
      this.refreshAllViews();
    });

    vscode.workspace.onDidCreateFiles(() => {
      this.refreshAllViews();
    });

    vscode.workspace.onDidDeleteFiles((item) => {
      const factory = new FileItemManager();
      item.files.map((file) => {
        const removedItem = factory.createFileItem(file.path);
        this.justFilesViewProvider.removeItemFromJustFiles(removedItem);
      });

      this.refreshAllViews();
    });
  }
}
