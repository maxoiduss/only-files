import * as vscode from "vscode";
import { JustFiles } from "./classes/justFiles";
import { ExtensionBrandResolver } from "./classes/extensionBrandResolver";

export function activate(context: vscode.ExtensionContext) {
  const brandResolver = new ExtensionBrandResolver(context);
  brandResolver.resolve();
  
  const justFiles = new JustFiles(context);
  justFiles.subscribe();
}

export function deactivate() {
  ExtensionBrandResolver.dispose();
  JustFiles.dispose();
}
