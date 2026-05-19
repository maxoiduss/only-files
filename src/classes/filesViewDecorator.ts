import { ThemeColor } from 'vscode';
import { getConfigurationsFor, getPathDepth, getUri, isValidUri
} from './utilManager';

const decorMap = "decorations" as const;

type UrisOr = undefined | vscode.Uri | vscode.Uri[];

export class FilesViewDecorator
implements vscode.FileDecorationProvider, vscode.Disposable {
  private itDidChangeFileDecorations: vscode.EventEmitter<UrisOr> =
    new vscode.EventEmitter<UrisOr>();
  readonly onDidChangeFileDecorations: vscode.Event<UrisOr> =
    this.itDidChangeFileDecorations.event;
  
  private readonly context: vscode.ExtensionContext;
  private readonly decorations: Map<string, vscode.Uri> = new Map();
  private readonly color: ThemeColor = new ThemeColor("justFilesViewColor");

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    const decorations =
      getConfigurationsFor<vscode.Uri>(this.context, decorMap);

    decorations.forEach(([path, uri]) => this.decorations.set(path, uri));
    this.validateDecorations();
  }

  public dispose() { this.itDidChangeFileDecorations.dispose(); }

  public provideFileDecoration(
    uri: vscode.Uri
  ): vscode.FileDecoration | undefined {
    if (this.decorations.has(uri.toString())) {
      return {
        color: this.color,
        propagate: false
      };
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

  private refresh(uriOr?: vscode.Uri | undefined) {
    this.updateConfiguration();
    this.itDidChangeFileDecorations.fire(uriOr);
  }
}
