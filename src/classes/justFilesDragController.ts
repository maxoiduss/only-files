import * as vscode from "vscode";
import { TreeDragAndDropController } from "vscode";
import { empty, FileItem } from "./fileItem";
import { brand } from "./commandRegistrator";

const URLS = "text/uri-list";
const MIME = `application/vnd.${brand}.fileitem`;

export class JustFilesDragController
  implements TreeDragAndDropController<FileItem>
{
  readonly dropMimeTypes: string[] = [MIME, URLS];
  readonly dragMimeTypes: string[] = [MIME];

  handleDrag?(
    source: readonly FileItem[],
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Thenable<void> | void {
    if (source.some(i => i.contextValue === empty)) {
      return;
    }
  }

  async handleDrop?(
    target: FileItem | undefined,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    const pathList = dataTransfer.get(URLS);
    if (typeof pathList?.value === "string"
      && pathList?.value !== '') {
      const uris = pathList.value
        .split(/[\r\n]+/)
        .map((path) => vscode.Uri.parse(path));
      uris.forEach((uri) =>
        vscode.commands.executeCommand(`${brand}.addItemFromTabMenu`, uri)
      );
      return;
    }
  }
}
