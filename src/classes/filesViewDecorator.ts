import { ThemeColor } from 'vscode';
import { ExtensionBrandResolver } from './extensionBrandResolver';
import { getConfigurationsFor, getPathDepth, getUri, isValidUri, same
} from './utilManager';

const decorMap   = "decorations" as const;
const colorMain  = "justFilesViewColor" as const;
const colorMinor = "foldersViewColor" as const;
const colorModif = "list.focusHighlightForeground" as const;

const configuration = () => ExtensionBrandResolver.configuration;
const highlightProperty = () => ExtensionBrandResolver.boolean5Property;
const hasHighlighing = (): boolean => {
  const config = vscode.workspace.getConfiguration(configuration());

  return config.get<boolean>(highlightProperty(), true);
};

type UriOr  = undefined | vscode.Uri;
type UrisOr = undefined | vscode.Uri | vscode.Uri[];

export class FilesViewDecorator
  implements vscode.FileDecorationProvider,
  vscode.Disposable
{
  private itDidChangeFileDecorations: vscode.EventEmitter<UrisOr> =
    new vscode.EventEmitter<UrisOr>();
  readonly onDidChangeFileDecorations: vscode.Event<UrisOr> =
    this.itDidChangeFileDecorations.event;
  
  private readonly context: vscode.ExtensionContext;
  private readonly decorations: Map<string, vscode.Uri> = new Map();
  private readonly highlighting: Set<string> = new Set();
  private readonly color: ThemeColor = new ThemeColor(colorMain);
  private readonly tone: ThemeColor = new ThemeColor(colorMinor);
  
  private targeted: [UriOr, ThemeColor] = [
    undefined, new ThemeColor(colorModif)
  ];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;

    const decorations =
      getConfigurationsFor<vscode.Uri>(this.context, decorMap);

    decorations.forEach(([path, uri]) => this.decorations.set(path, uri));
    this.validateDecorations();
  }

  public dispose() {
    this.itDidChangeFileDecorations.dispose();
  }

  public provideFileDecoration(
    uri: vscode.Uri
  ): vscode.FileDecoration | undefined {
    if (this.decorations.has(uri.toString())) {
      return {
        color: this.color,
        propagate: false
      };
    }
    if (hasHighlighing()) {
      if (this.highlighting.has(uri.toString())) {
        return {
          color: this.tone,
          propagate: false
        };
      }
    }
    if (this.targeted[0]) {
      if (same(this.targeted[0], uri)) {
        return {
          color: this.targeted[1],
          propagate: false
        };
      }
    }
    return undefined;
  }

  public handleUri(uri: vscode.Uri, oldUri?: vscode.Uri) {
    if (oldUri) {
      if (this.decorations.has(oldUri.toString())) {
        this.deleteUri(oldUri);
        this.decorations.set(uri.toString(), uri);
        this.refresh(uri);
      }
      
      return;
    }
    
    if (this.decorations.has(uri.toString())) {
      this.deleteUri(uri);
      this.refresh(uri);

      return;
    }

    this.decorations.set(uri.toString(), uri);
    this.refresh(uri);
  }

  public hasHighlight(uri: UriOr | string) {
    return uri ? this.highlighting.has(uri.toString()) : false;
  }

  public addHighlights(uris: (vscode.Uri | string)[] | undefined) {
    if (uris) {
      uris.forEach((uri) => this.highlighting.add(uri.toString()));
      this.refresh(undefined, true);
    }
  }

  public removeHighlight(uri: UriOr | string, refresh: boolean = true)
  { if (!uri) { return; }

    this.highlighting.delete(uri.toString());

    if (refresh) {
      this.refresh(undefined, true); }
  }

  public clearHighlights() {
    this.highlighting.clear();
    this.refresh(undefined, true);
  }

  public setTargeted(uri: UriOr) {
    this.targeted[0] = uri;
    this.refresh(undefined, true);
  }

  public resetTargeted() {
    this.targeted[0] = undefined;
    this.refresh(undefined, true);
  }
  
  public refuse() {
    this.decorations.clear();
    this.refresh();
  }

  public async getDecorationsAsUris(): Promise<vscode.Uri[]> {
    await this.validateDecorations();

    const uris = [...this.decorations.values()];
    const pairs = uris.map((uri) => [uri, getPathDepth(uri.path)] as const);
    const sorted = pairs.sort((a, b) => a[1] - b[1]);

    return sorted.map(([uri]) => uri);
  }

  private async validateDecorations(): Promise<void> {
    for (const [key, uri] of this.decorations) {
      if (!(uri instanceof vscode.Uri)) {
        this.decorations.set(key, getUri(uri));
      }
    }
    const invalid = await Promise.all(
      Array.from(this.decorations.entries())
           .flatMap(async ([path, uri]) =>
              await isValidUri(uri) ? [] : [path] 
            )
      );
    invalid.flat().forEach((key) => this.decorations.delete(key));

    const wrong = await Promise.all(
      Array.from(this.highlighting)
           .flatMap(async (path) =>
              await isValidUri(getUri(path)) ? [] : [path] 
            )
      );
    wrong.flat().forEach((key) => this.highlighting.delete(key));

    this.updateConfiguration();
  }

  private deleteUri(uri: vscode.Uri) {
    this.decorations.delete(uri.toString());
    this.refresh(uri);
  }

  private updateConfiguration() {
    const map = Object.fromEntries(this.decorations);
    this.context.workspaceState.update(decorMap, map);
  }

  private refresh(uriOr?: UriOr, update: boolean = true) {
    if (update) {
      this.updateConfiguration();
    }
    this.itDidChangeFileDecorations.fire(uriOr);
  }
}
