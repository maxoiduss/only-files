import * as vscode from "vscode";
import { TreeDragAndDropController } from "vscode";
import { placeholder, FileItem } from "./fileItem";
import { brand, ExtensionBrandResolver } from "./extensionBrandResolver";

const URLS = "text/uri-list";
const _ = {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    get MIME () {
      return `application/${ExtensionBrandResolver.command}.fileitem`;
  }
};
const empty = '';

export class JustFilesDragController
  implements TreeDragAndDropController<FileItem>
{
  readonly dropMimeTypes: string[] = [_.MIME, URLS];
  readonly dragMimeTypes: string[] = [_.MIME];

  async handleDrag?(
    source: readonly FileItem[],
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) { return; }
    if (source.some(i => i.contextValue === placeholder)) {
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
    target: FileItem | undefined,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) { return; }

    const pathList = dataTransfer.get(URLS);

    if (typeof pathList?.value === "string"
            && pathList?.value !== empty)
    {
      const uris = pathList.value
        .split(/[\r\n]+/)
        .map((path) => vscode.Uri.parse(path));
      uris.forEach((uri) =>
        vscode.commands.executeCommand(
          brand.addItemFromTabMenu,
          uri
        )
      );
      return;
    }
  }
}
