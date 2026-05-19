import * as manager from "./fileItemManager";
import { TreeDragAndDropController } from "vscode";
import { CommandRegistrator } from "./commandRegistrator";
import { emptyItem, root, FileItem } from "./fileItem";
import { ExtensionBrandResolver } from "./extensionBrandResolver";
import { getPathDepth, getUri } from "./utilManager";

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
  public readonly dropMimeTypes: string[] = [_.MIME, URLS];
  public readonly dragMimeTypes: string[] = [_.MIME, URLS];

  private get workspaceFolders() {
    return vscode.workspace.workspaceFolders ?? [];
  }

  constructor(
    private readonly commandRegistrator: CommandRegistrator,
    private readonly draggedFromJustFilesAction:
    (uri: vscode.Uri) => Promise<void>
  ) { }

  public async handleDrag?(
    source: readonly FileItem[],
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) { return; }
    if (source.some((i) =>
         i.contextValue === emptyItem
      || i.contextValue === root))     { return; }

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

  public async handleDrop?(
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
          .map((path) => getUri(path));
      }
      return uris;
    };

    const wsf = this.workspaceFolders.length > 1 ?
      undefined : this.workspaceFolders[0];
    const where = target ?? 
      (wsf ? await manager.createFileItem(wsf.uri) : undefined);
    if (!where) { return; }
    
    const transferItems = dataTransfer.get(_.MIME);
    if (transferItems) {
      const value = transferItems.value as string;

      if (value === empty) {
        const uris = urisFromDataTransfer();

        if (uris.length > 0) {
          const pairs = uris.map((u) =>
            [u, getPathDepth(u.toString())] as const);
          const removing = pairs
            .sort((a, b) => b[1] - a[1])
            .map(([uri]) => uri);
          for (const uri of removing) {
            await this.draggedFromJustFilesAction(uri);
          }
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
