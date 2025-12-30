import * as vscode from "vscode";
import { TreeDragAndDropController } from "vscode";
import { FileItemManager } from "./fileItemManager";
import { brand, CommandRegistrator } from "./commandRegistrator";
import { empty, root, FileItem } from "./fileItem";

const URLS = "text/uri-list";
const MIME = `application/vnd.${brand}.fileitem`;

export class FoldersDragController
  implements TreeDragAndDropController<FileItem>
{
  readonly dropMimeTypes: string[] = [MIME, URLS];
  readonly dragMimeTypes: string[] = [MIME, URLS];

  private readonly commandRegistrator: CommandRegistrator;
  private readonly fileItemManager = new FileItemManager();

  constructor(registrator: CommandRegistrator) {
    this.commandRegistrator = registrator;
  }

  async handleDrag?(
    source: readonly FileItem[],
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (source.some((i) => i.contextValue === empty || i.contextValue === root)) {
      return;
    }
    const dataAll = new vscode.DataTransferItem(
      source.map((f) => f.resourceUri?.path).join(";")
    );
    const dataFirst = new vscode.DataTransferItem(
      source.length > 0 ? source[0].resourceUri!.path : ''
    );
    dataTransfer.set(MIME, dataAll);
    dataTransfer.set(URLS, dataFirst);

    const items: FileItem[] = [...source];
    await this.commandRegistrator.cutItems(items);
  }

  async handleDrop?(
    target: FileItem | undefined,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    const where =
      target ??
      this.fileItemManager.createFileItem(
        vscode.workspace.workspaceFolders![0].uri
      );
    const transferItems = dataTransfer.get(MIME);
    if (transferItems) {
      const items: FileItem[] = (transferItems.value as string)
        .split(";")
        .map((f) => this.fileItemManager.createFileItem(f));
      await this.commandRegistrator.pasteItems(where);
      return;
    }
    const uriList = dataTransfer.get(URLS);
    if (typeof uriList?.value === "string") {
      const uris = uriList.value
        .split(/[\r\n]+/)
        .map((path) => vscode.Uri.parse(path));
      const items: FileItem[] = uris.map((u) =>
        this.fileItemManager.createFileItem(u)
      );
      await this.commandRegistrator.copyItems(items);
      await this.commandRegistrator.pasteItems(where);
      return;
    }
  }
}
