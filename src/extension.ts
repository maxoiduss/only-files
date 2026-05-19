/// <reference types="vscode" />
import * as vscode from "vscode";
import { JustFiles } from "./classes/justFiles";
import { ExtensionBrandResolver } from "./classes/extensionBrandResolver";
import { ExtensionStaticService } from "./classes/extensionStaticService";

export function activate(context: vscode.ExtensionContext) {
  const brandResolver = new ExtensionBrandResolver();
  brandResolver.resolve();
  
  const justFiles = new JustFiles(context);
  justFiles.subscribe();
}

export function deactivate() {
  ExtensionBrandResolver.dispose();
  ExtensionStaticService.dispose();
}
