import { ExtensionBrandResolver } from "./extensionBrandResolver";

const configuration           = () => ExtensionBrandResolver.configuration;
const clickToleranceProperty  = () => ExtensionBrandResolver.number1Property;
const renameToleranceProperty = () => ExtensionBrandResolver.number2Property;
const copyFileContentProperty = () => ExtensionBrandResolver.boolean4Property;

const defaults = {
  clickTolerance: 500,
  renameTolerance: 1500
} as const;

const names: {
  clickTolerance?:  string,
  renameTolerance?: string,
  copyFileContentOnSingleCopy?: string
} = {};

/// application/workspace level configurations
export class ExtensionStaticService {
  private static readonly disposables: vscode.Disposable[] = [];

  public static readonly id: number = Date.now();

  public static readonly normalize: boolean = true             as const;
  public static readonly fsThrottling: number = 180            as const;
  public static readonly fsExclusion: string  = "**/.git/**"   as const;
  public static readonly resourcesFolder: string = 'resources' as const;
  public static readonly placeholderText = 'Drag-n-Shift Here' as const;
  public static readonly pdfjs = {
    folder: 'pdfjs',
    min: { mjs: 'pdf.min.mjs' },
    worker: { min: { mjs: 'pdf.worker.min.mjs' } }           } as const;

  public static clickTolerance:  number;
  public static renameTolerance: number;
  public static plainMode: boolean = false;

  public static context: vscode.ExtensionContext;

  public static showExtensionExtraWarnings:  boolean = true;
  public static copyFileContentOnSingleCopy: boolean = true;
  public static showEmptyUncollapsedFolders: boolean = true;
  public static showUncollapsedPlainFolders: boolean = true;

  public static process =
    (typeof process !== 'undefined' && process.platform) ? process : {
      platform: "web",
      cwd: () => "/"
    };

  public static cacheRemoval: (id: string) => void;

  public static withId = (id: unknown) => `@ext:${id}` as const;

  public static updateTolerances(event?: vscode.ConfigurationChangeEvent) {
    names.clickTolerance ??=`${configuration()}.${clickToleranceProperty()}`;
    names.renameTolerance??=`${configuration()}.${renameToleranceProperty()}`;

    let cfg: vscode.WorkspaceConfiguration | undefined;
    if (!event || event?.affectsConfiguration(names.clickTolerance)) {
      cfg ??= vscode.workspace.getConfiguration(configuration());
      ExtensionStaticService.clickTolerance =
        cfg.get(clickToleranceProperty(), defaults.clickTolerance);
    }
    if (!event || event?.affectsConfiguration(names.renameTolerance)) {
      cfg ??= vscode.workspace.getConfiguration(configuration());
      ExtensionStaticService.renameTolerance =
        cfg.get(renameToleranceProperty(), defaults.renameTolerance);
    }
  }

  public static updateCopyFileContentOnSingleCopy(
    event?: vscode.ConfigurationChangeEvent
  ) {
    names.copyFileContentOnSingleCopy ??=
      `${configuration()}.${copyFileContentProperty()}`;
    if (!event
      || event?.affectsConfiguration(names.copyFileContentOnSingleCopy)) {
      const cfg = vscode.workspace.getConfiguration(configuration());
      ExtensionStaticService.copyFileContentOnSingleCopy =
        cfg.get(copyFileContentProperty(), true);
    }
  }

  public static addDisposablesOnce(...disposables: vscode.Disposable[]) {
    ExtensionStaticService.disposables.length = 0;
    ExtensionStaticService.disposables.push(...disposables);
  }

  public static dispose() {
    ExtensionStaticService.disposables.forEach((obj) => obj.dispose());
    ExtensionStaticService.disposables.length = 0;
  }
}
