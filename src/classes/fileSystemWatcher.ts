export class FileSystemWatcher {
  private readonly context: vscode.ExtensionContext;

  private get workspaceFolders() {
    return vscode.workspace.workspaceFolders ?? [];
  }

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }
  
  private watchFolder(folder: vscode.WorkspaceFolder) {
    const pattern = new vscode.RelativePattern(folder, '**/*');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidCreate(uri => console.log(`Created: ${uri.fsPath}`));
    watcher.onDidDelete(uri => console.log(`Deleted: ${uri.fsPath}`));

    this.context.subscriptions.push(watcher);
  }

  public watch() {
    this.workspaceFolders.forEach((f) => this.watchFolder(f));
  }
}
