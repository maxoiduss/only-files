/// <reference types="vscode" />
import { getPathDepth } from "./utilManager";

//import * as vscode from 'vscode';

class A {
  private watchFolder(folder: vscode.WorkspaceFolder, context: vscode.ExtensionContext) {
    // RelativePattern ensures it monitors the correct root sub-tree
    const pattern = new vscode.RelativePattern(folder, '**/*');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidCreate(uri => console.log(`Created: ${uri.fsPath}`));
    watcher.onDidDelete(uri => console.log(`Deleted: ${uri.fsPath}`));
    
    // Rename Fallback: A rename triggers a Delete event followed immediately by a Create event
    watcher.onDidChange(uri => console.log(`Changed: ${uri.fsPath}`));

    context.subscriptions.push(watcher);
}
}