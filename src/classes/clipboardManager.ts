import { brand } from "./extensionBrandResolver";
import { workspace } from "./fileSystemHelper";
import { getNicePath, getUri } from "./utilManager";

export const readFilePath = async (): Promise<vscode.Uri> => {
  const current = await vscode.env.clipboard.readText();
  await vscode.commands.executeCommand(brand.copyFilePath);
  const path = await vscode.env.clipboard.readText();
  await vscode.env.clipboard.writeText(current);

  return getUri(path);
};

export const writeFilePath = async (
  uri: vscode.Uri
): Promise<void> => {
  await vscode.env.clipboard.writeText(
    getNicePath(uri)
  );
};

export const writeFile = async (
  uri: vscode.Uri
): Promise<void> => {
  const array = await workspace.fs.readFile(uri);
  const content = new TextDecoder().decode(array);
  await vscode.env.clipboard.writeText(content);
};

export const writeText = async (
  value: string
): Promise<void> => {
  await vscode.env.clipboard.writeText(value);
};
