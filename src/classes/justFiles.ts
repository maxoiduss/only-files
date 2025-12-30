import * as vscode from "vscode";
import { FileItem, PlaceholderItem, RootFileItem } from "./fileItem";
import { brand, CommandRegistrator } from "./commandRegistrator";
import { JustFilesViewProvider } from "./justFilesViewProvider";
import { FoldersViewProvider } from "./foldersViewProvider";
import { PreviewProvider } from "./previewProvider";
import { FileItemManager, isProjectTooLarge } from "./fileItemManager";
import { JustFilesDragController } from "./justFilesDragController";
import { FoldersDragController } from "./foldersDragController";
import { FoldersReferenceProvider } from "./foldersReferenceProvider";

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
    this.filesDragController = new FoldersDragController(this.commandRegistrator);
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
    this.subscribeRevealInExplorer();
    this.subscribeCollapseToFolder();
    this.subscribeUncollapseAll();
    this.subscribeAndRegisterPreviewItem();
  }

  private async revealFilesTreeViewItem(element: FileItem, expand?: boolean) {
    try {
      expand ?
        await this.filesTreeView.reveal(element, { expand: true })
      : await this.filesTreeView.reveal(element, { focus: true });
    } catch (error) {
      console.log(error);
    }
    finally {
      this.foldersViewProvider.showItemInExplorerByUriOrTrySelect();
    }
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
    const disposableShow = vscode.commands.registerCommand(
      `${brand}.show`,
      (fileItem) => {
        const isFileItemInfilesSelectedItems = this.filesSelectedItems.some(
          (item) => item.resourceUri?.path === fileItem.resourceUri.path
        );
        if (
          this.filesSelectedItems.length > 0 &&
          isFileItemInfilesSelectedItems
        ) {
          this.filesSelectedItems.map((item) => {
            this.justFilesViewProvider.addFileItem(item as FileItem);
            this.justFilesViewProvider.refresh();
          });

          return;
        }

        this.justFilesViewProvider.addFileItem(fileItem);
        this.justFilesViewProvider.refresh();
      }
    );

    this.context.subscriptions.push(disposableShow);
  }

  subscribeHide() {
    const disposableHide = vscode.commands.registerCommand(
      `${brand}.hide`,
      (fileItem) => {
        const isFileItemInjustFilesSelectedItems =
          this.justFilesSelectedItems.some(
            (item) => item.resourceUri?.path === fileItem.resourceUri.path
          );
        if (
          this.justFilesSelectedItems.length > 0 &&
          isFileItemInjustFilesSelectedItems
        ) {
          this.justFilesSelectedItems.map(async (item) => {
            await this.justFilesViewProvider.addHideFileItem(item as FileItem);
            this.justFilesViewProvider.refresh();
          });

          return;
        }
        this.justFilesViewProvider.addHideFileItem(fileItem);
        this.justFilesViewProvider.refresh();
      }
    );
    this.context.subscriptions.push(disposableHide);
  }

  subscribeAddFromTab() {
    const addFromTabDisponsable = vscode.commands.registerCommand(
      `${brand}.addItemFromTabMenu`,
      (uri) => {
        const factory = new FileItemManager();
        const item = factory.createFileItem(uri);
        this.justFilesViewProvider.addFileItem(item);
        this.justFilesViewProvider.refresh();
      }
    );
    this.context.subscriptions.push(addFromTabDisponsable);
  }

  subscribeRemoveFromTab() {
    const removeFromTabDisponsable = vscode.commands.registerCommand(
      `${brand}.removeItemFromTabMenu`,
      async (uri) => {
        const factory = new FileItemManager();
        const item = factory.createFileItem(uri.path);
        this.justFilesViewProvider.addHideFileItem(item);
        this.justFilesViewProvider.refresh();
      }
    );
    this.context.subscriptions.push(removeFromTabDisponsable);
  }

  subscribeAddFromCommand() {
    const addFromCommand = vscode.commands.registerCommand(
      `${brand}.addTabFromCommand`,
      async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          const itemUri = activeEditor.document.uri;
          const factory = new FileItemManager();
          const item = factory.createFileItem(itemUri);
          await this.justFilesViewProvider.addFileItem(item);
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
    const disposableAddFromExplorer = vscode.commands.registerCommand(
      `${brand}.addItemFromExplorer`,
      (uri) => {
        const factory = new FileItemManager();
        const item = factory.createFileItem(uri.path);
        this.justFilesViewProvider.addFileItem(item);
        this.justFilesViewProvider.refresh();
      }
    );
    this.context.subscriptions.push(disposableAddFromExplorer);
  }

  subscribeRevealInExplorer() {
    var reveal = vscode.commands.registerCommand(`${brand}.revealInSidebar`,
      (fileItem) => {
        vscode.commands.executeCommand("revealInExplorer", fileItem.resourceUri);
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
        if (await isProjectTooLarge()) {
            const use = "Yes, use ignore file";
            const answer = await vscode.window.showWarningMessage(
              `You are switching to mode showing all files in the project.
              It could be very time-consuming to load.
              Didn't you forget to turn on skipping files
              by .gitignore in the project?`,
              use, "Cancel"
            );
            if (answer === use) {
              await this.fillIgnoredFiles();
            }
            this.foldersViewProvider.canUncollapseAll(true);
        } else {
          this.foldersViewProvider.canUncollapseAll(true);
        }
        this.foldersViewProvider.switchPlainModeTag();
      }
    );
    this.context.subscriptions.push(uncollapseAll);
  }


  subscribeAndRegisterPreviewItem() {
    vscode.window.registerWebviewViewProvider("preView", this.previewProvider);

    const preview = vscode.commands.registerCommand(
      `${brand}.previewItem`,
      async (uriOr) => {
        this.previewProvider.showAsWebView(
          uriOr instanceof FileItem ?
            uriOr.resourceUri?.fsPath
          : uriOr.fsPath);
        await vscode.commands.executeCommand("workbench.view.extension.preView-container");
        await vscode.commands.executeCommand('preView.focus');
      }
    );

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
    const refreshJustFilesView = vscode.commands.registerCommand(
      `${brand}.refreshJustFiles`,
      () => {
        this.justFilesViewProvider.removeNotFiles();
        this.justFilesViewProvider.refresh();
      }
    );
    this.context.subscriptions.push(refreshJustFilesView);
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
