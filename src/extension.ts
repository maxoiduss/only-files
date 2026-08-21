import "./types/vscodes";
import { OnlyFiles } from "./classes/onlyFiles";
import { ExtensionBrandResolver } from "./classes/extensionBrandResolver";
import { ExtensionStaticService } from "./classes/extensionStaticService";

export function activate(context: vscode.ExtensionContext) {
  ExtensionStaticService.context = context;

  const brandResolver = new ExtensionBrandResolver();
  brandResolver.resolve();

  const onlyFiles = new OnlyFiles(context);
  onlyFiles.subscribe();

  return { // eslint-disable-next-line @typescript-eslint/naming-convention
    ExtensionBrandResolver, ExtensionStaticService
  };
}

export function deactivate() {
  ExtensionBrandResolver.dispose();
  ExtensionStaticService.dispose();
}

/**### Rules For The TOP Of SRC File Code Organization
 *#### The Order:
 *  1) Top Most Imports: there go crucial imports responsable system to work
 *  2) Wildcart Imports: '* as'
 *  3) Common Imports
 *  4) MultiItem Imports: than more items are - than lower import is
 *  5) Interfaces/Enums
 *  6) Constant Constants: preferred to use 'as const' - in one column
 *  7) Complex Constants: also with getters/setters
 *  8) EnumLike Constants
 *  9) Function Constants
 * 10) Complex Function Constants
 * 11) Type Definitions
 * 12) Exports: all exported items have the same order as items above
 * 13) Classes
*/