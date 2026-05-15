import * as vscode from "vscode";
import { ExtensionBrandResolver } from "./extensionBrandResolver";
import { JustFiles } from "./justFiles";

const configuration = () => ExtensionBrandResolver.configuration;
const number1Property = () => ExtensionBrandResolver.number1Property;
const number2Property = () => ExtensionBrandResolver.number2Property;

export class ExtensionStaticService {
  public static clickTolerance: number;
  public static renameTolerance: number;

  public static plainMode: boolean = false;

  public static showEmptyUncollapsedFolders: boolean = true;
  public static showUncollapsedPlainFolders: boolean = true;

  public static justFilesInstance: JustFiles | undefined;

  public static updateTolerances() {
    const config = vscode.workspace.getConfiguration(configuration());
    ExtensionStaticService.clickTolerance = config.get(number1Property(), 500);
    ExtensionStaticService.renameTolerance = config.get(number2Property(), 1500);
  }

  public static dispose() {
    ExtensionStaticService.justFilesInstance?.foldersTreeView.dispose();
    ExtensionStaticService.justFilesInstance?.justFilesTreeView.dispose();
    ExtensionStaticService.justFilesInstance?.foldersViewProvider.dispose();
    ExtensionStaticService.justFilesInstance?.justFilesViewProvider.dispose();
  }
}
