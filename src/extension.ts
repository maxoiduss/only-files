import "./types";
import { JustFiles } from "./classes/justFiles";
import { FileSystemWatcher } from "./classes/fileSystemWatcher";
import { ExtensionBrandResolver } from "./classes/extensionBrandResolver";
import { ExtensionStaticService } from "./classes/extensionStaticService";

export function activate(context: vscode.ExtensionContext) {
  const brandResolver = new ExtensionBrandResolver();
  brandResolver.resolve();
  
  const justFiles = new JustFiles(context);
  justFiles.subscribe();

  const fileSystem = new FileSystemWatcher(context);
  fileSystem.watch();
}

export function deactivate() {
  ExtensionBrandResolver.dispose();
  ExtensionStaticService.dispose();
}
