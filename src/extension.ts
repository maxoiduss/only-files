import * as vscode from "vscode";
import { JustFiles } from "./classes/justFiles";
import { ExtensionBrandResolver } from "./classes/extensionBrandResolver";

export function activate(context: vscode.ExtensionContext) {
  const brandResolver = new ExtensionBrandResolver(context);
  brandResolver.resolve();
  
  const justFiles = new JustFiles(context);
  justFiles.subscribe();
}

export function deactivate(context: vscode.ExtensionContext) {
  context?.workspaceState?.update("displayed", undefined);
  context?.workspaceState?.update("hidden", undefined);
  context?.workspaceState?.update("subDisplayed", undefined);
  context?.workspaceState?.update("subHidden", undefined);
}
