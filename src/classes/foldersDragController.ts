import * as vscode from "vscode";
import { TreeDragAndDropController } from "vscode";
import * as manager from "./fileItemManager";
import { CommandRegistrator } from "./commandRegistrator";
import { emptyItem, root, FileItem } from "./fileItem";
import { ExtensionBrandResolver } from "./extensionBrandResolver";

const URLS = "text/uri-list" as const;
const _ = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
    get MIME () {
      return `application/${ExtensionBrandResolver.command}.fileitem`;
  }
};
const empty = '' as const;

export class FoldersDragController
  implements TreeDragAndDropController<FileItem>
{
  readonly dropMimeTypes: string[] = [_.MIME, URLS];
  readonly dragMimeTypes: string[] = [_.MIME, URLS];

  constructor(
    private readonly commandRegistrator: CommandRegistrator,
    private readonly draggedFromJustFilesAction:
    (uri: vscode.Uri) => Promise<void>
  ) { }

  async handleDrag?(
    source: readonly FileItem[],
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) { return; }
    if (source.some((i) =>
         i.contextValue === emptyItem
      || i.contextValue === root))
    {
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

    const items: FileItem[] = [...source];
    await this.commandRegistrator.cutOrCopyItems(items);
  }

  async handleDrop?(
    target: FileItem | undefined,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) { return; }

    const urisFromDataTransfer = (): vscode.Uri[] => {
      let uris: vscode.Uri[] = [];
      const uriList = dataTransfer.get(URLS);

      if (typeof uriList?.value === "string") {
        uris = uriList.value
          .split(/[\r\n]+/)
          .map((path) => vscode.Uri.parse(path));
      }
      return uris;
    };

    const wsf = vscode.workspace.workspaceFolders?.[0];
    const where = target ?? 
      (wsf !== undefined ?
        manager.createFileItem(wsf.uri)
      : undefined);
    const transferItems = dataTransfer.get(_.MIME);
    if (transferItems) {
      const value = transferItems.value as string;

      if (value === empty) {
        const uris = urisFromDataTransfer();

        if (uris.length > 0) {
          await this.draggedFromJustFilesAction(uris[0]);
        }
        return;
      }
      await this.commandRegistrator.pasteItems(where);
      return;
    }
    const uris = urisFromDataTransfer();
    const items = await manager.createFileItems(uris);
    await this.commandRegistrator.copyItems(items);
    await this.commandRegistrator.pasteItems(where);
    return;
  }
}
