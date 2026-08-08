import { ExtensionBrandResolver } from "./extensionBrandResolver";

const configuration    = () => ExtensionBrandResolver.configuration;
const number1Property  = () => ExtensionBrandResolver.number1Property;
const number2Property  = () => ExtensionBrandResolver.number2Property;
const boolean4Property = () => ExtensionBrandResolver.boolean4Property;

const names: {
  clickTolerance?:  string,
  renameTolerance?: string,
  copyFileContentOnSingleCopy?: string
} = {};

const c = 500  as const;
const r = 1500 as const;

/// application/workspace level configurations
export class ExtensionStaticService {
  private static readonly disposables: vscode.Disposable[] = [];

  public static clickTolerance:  number;
  public static renameTolerance: number;

  public static plainMode: boolean = false;

  public static readonly fsThrottling: number = 180;
  public static readonly fsExclusion: string = "**/.git/**";

  public static showExtensionExtraWarnings:  boolean = true;

  public static copyFileContentOnSingleCopy: boolean = true;
  
  public static showEmptyUncollapsedFolders: boolean = true;
  public static showUncollapsedPlainFolders: boolean = true;

  public static cacheRemoval: (id: string) => void;

  public static withId = (id: unknown) => `@ext:${id}`;

  public static updateTolerances(event?: vscode.ConfigurationChangeEvent) {
    names.clickTolerance  ??= `${configuration()}.${number1Property()}`;
    names.renameTolerance ??= `${configuration()}.${number2Property()}`;

    let cfg: vscode.WorkspaceConfiguration | undefined;
    if (!event || event?.affectsConfiguration(names.clickTolerance)) {
      cfg ??= vscode.workspace.getConfiguration(configuration());
      ExtensionStaticService.clickTolerance  = cfg.get(number1Property(), c);
    }
    if (!event || event?.affectsConfiguration(names.renameTolerance)) {
      cfg ??= vscode.workspace.getConfiguration(configuration());
      ExtensionStaticService.renameTolerance = cfg.get(number2Property(), r);
    }
  }

  public static updateCopyFileContentOnSingleCopy(
    event?: vscode.ConfigurationChangeEvent
  ) {
    names.copyFileContentOnSingleCopy ??=
      `${configuration()}.${boolean4Property()}`;
    if (!event
      || event?.affectsConfiguration(names.copyFileContentOnSingleCopy)) {
      const cfg = vscode.workspace.getConfiguration(configuration());
      ExtensionStaticService.copyFileContentOnSingleCopy =
        cfg.get(boolean4Property(), true);
    }
  }

  public static addDisposablesOnce(...disposables: vscode.Disposable[]) {
    if (ExtensionStaticService.disposables.length === 0) {
      ExtensionStaticService.disposables.push(...disposables);
    }
  }

  public static dispose() {
    ExtensionStaticService.disposables.forEach((obj) => obj.dispose());
  }
}
