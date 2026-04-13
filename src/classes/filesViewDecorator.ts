import * as vscode from 'vscode';
import { ThemeColor } from 'vscode';
import { getConfigurationsFor, isValidUri } from './utilManager';

const decorMap = "decorations" as const;

type UrisOr = undefined | vscode.Uri | vscode.Uri[];

export class FilesViewDecorator
implements vscode.FileDecorationProvider, vscode.Disposable {
  private _onDidChangeFileDecorations: vscode.EventEmitter<UrisOr> =
    new vscode.EventEmitter<UrisOr>();
  readonly onDidChangeFileDecorations: vscode.Event<UrisOr> =
    this._onDidChangeFileDecorations.event;
  
  private readonly decorations: Map<string, vscode.Uri> = new Map();
  private readonly color: ThemeColor = new ThemeColor("justFilesViewColor");

  constructor(private readonly context: vscode.ExtensionContext) {
    const decorations =
      getConfigurationsFor<vscode.Uri>(this.context, decorMap);

    decorations.forEach(([path, uri]) => this.decorations.set(path, uri));
    this.validateDecorations();
  }

  dispose() { this._onDidChangeFileDecorations.dispose(); }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (this.decorations.has(uri.fsPath)) {
      return {
        color: this.color,
        propagate: false
      };
    }
    
    return undefined;
  }

  handleUri(uri: vscode.Uri, oldUri?: vscode.Uri) {
    if (oldUri) {
      if (this.decorations.has(oldUri.fsPath)) {
        this.deleteUri(oldUri);
        this.decorations.set(uri.fsPath, uri);
        this.refresh(uri);
      }
      
      return;
    }
    
    if (this.decorations.has(uri.fsPath)) {
      this.deleteUri(uri);
      this.refresh(uri);

      return;
    }

    this.decorations.set(uri.fsPath, uri);
    this.refresh(uri);
  }

  async getDecorationsAsUris(): Promise<vscode.Uri[]> {
    await this.validateDecorations();

    return [...this.decorations.values()].map((val) => vscode.Uri.from(val));
  }

  private async validateDecorations(): Promise<void> {
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
    this.decorations.delete(uri.fsPath);
    this.refresh(uri);
  }

  private updateConfiguration() {
    const map = Object.fromEntries(this.decorations);
    this.context.workspaceState.update(decorMap, map);
  }

  private refresh(uriOr: vscode.Uri | undefined) {
    this.updateConfiguration();
    this._onDidChangeFileDecorations.fire(uriOr);
  }
}
