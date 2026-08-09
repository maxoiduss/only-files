import * as manager from "./fileItemManager";
import { TreeDragAndDropController } from "vscode";
import { CommandRegistrator } from "./commandRegistrator";
import { placeholder, FileItem, FileItemOr } from "./fileItem";
import { brand, ExtensionBrandResolver } from "./extensionBrandResolver";
import { delimeters, getUri } from "./utilManager";

const empty = '' as const;

const URLS = "text/uri-list" as const;
const _ = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  get MIME () {
    return `application/${ExtensionBrandResolver.command}.fileitem`;
  }
};

export class JustFilesDragController
  implements TreeDragAndDropController<FileItem>
{
  private readonly commandRegistrator: CommandRegistrator;

  private get workspaceFolders() {
    return vscode.workspace.workspaceFolders ?? [];
  }
  
  readonly dropMimeTypes: string[] = [_.MIME, URLS];
  readonly dragMimeTypes: string[] = [_.MIME];

  constructor(commandRegistrator: CommandRegistrator) {
    this.commandRegistrator = commandRegistrator;
  }

  async handleDrag?(
    source: readonly FileItem[],
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) { return; }
    if (source.some((i) => i.contextValue === placeholder)) {
      return;
    }

    const dataAll = new vscode.DataTransferItem(
      source.map((f) => f.resourceUri?.path).join(';')
    );
    const dataFirst = new vscode.DataTransferItem(
      source.length > 0 ?
        source[0].resourceUri ?
          source[0].resourceUri.path
        : empty : empty
    );
    dataTransfer.set(_.MIME, dataAll);
    dataTransfer.set(URLS, dataFirst);
  }

  async handleDrop?(
    target: FileItemOr,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) { return; }

    const transferItems = dataTransfer.get(_.MIME);
    if   (transferItems && transferItems.value !== empty) {
      const wsf = this.workspaceFolders.length > 1 ?
          undefined : this.workspaceFolders[0];
      const where = target ?? 
        (wsf ? await manager.createFileItem(wsf.uri) : undefined);
      if (where) {
        const value = transferItems.value as string;
        const uris = value
          .split(delimeters)
          .map((path) => getUri(path));
        const items = await manager.createFileItems(uris);

        await this.commandRegistrator.cutOrCopyItems(items);
        await this.commandRegistrator.pasteItems(where);

        return;
      }
    }

    const pathList = dataTransfer.get(URLS);

    if (typeof pathList?.value === 'string'
            && pathList?.value !== empty)
    { const uris = pathList.value
        .split(delimeters)
        .map((path) => getUri(path));
      uris.forEach((uri) =>
        vscode.commands.executeCommand(brand.addItemFromTabMenu, uri)
      );
      return;
    }
  }
}
