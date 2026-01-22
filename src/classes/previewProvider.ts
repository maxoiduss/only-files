import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as marked from "marked";
import { WebviewView } from "vscode";
import { getString, hasNoName } from "./utilManager";

enum PreviewType {
  pdf   = "pdf",
  html  = "html",
  md    = "md",
  txt   = "txt",
  error = "error"
}

export function getNonce() {
  let text = '';
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export class PreviewProvider implements vscode.WebviewViewProvider {
  private view: WebviewView | undefined;
  private title: vscode.Uri | string = '';
  private cspSourceDefault!: string;
  private lastViewVisibleValue: boolean = false;
  private lastWebviewLoaded: boolean = false;
  private toBeResolved: Promise<void> = new Promise<void>(
    (resolved) => this.resolved = resolved
  );
  private resolved!: () => void;

  readonly dropAreaMask = 'dropzone';
  readonly contextCommand = 'contextMenu';
  readonly resetStateCommand = 'resetState';
  readonly disableStateCommand = 'disableState';
  readonly contentLoadedCommand = 'contentLoaded';
  readonly fileDropCommand = 'fileDropped';

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: WebviewView,
    _context: vscode.WebviewViewResolveContext<unknown>, 
    _token: vscode.CancellationToken): Thenable<void> | void
  {
    const view = webviewView;
    this.view = view;
    this.cspSourceDefault = view.webview.cspSource;

    const visibilityTimeout = 100;

    view.onDidChangeVisibility(() => {
      setTimeout(async () => {
        if (this.lastViewVisibleValue !== view.visible) {
          this.lastViewVisibleValue = view.visible;
          if (this.lastViewVisibleValue) {
            this.setTitle(getString(this.title), true);
          }
        }
      }, visibilityTimeout);
    });
    view.webview.onDidReceiveMessage(async (message) => {
      if (message.command === this.fileDropCommand && message.path) {
        const path = message.path as string;
        this.showAsWebView(vscode.Uri.parse(path).fsPath);
      } else
      if (message.command === this.contentLoadedCommand) {
        if (!this.lastWebviewLoaded) {
          this.lastWebviewLoaded = true;
          hasNoName(getString(this.title)) ?
            view.webview.postMessage({ type: this.disableStateCommand })
          : view.webview.postMessage({ type: this.resetStateCommand });
        }
      } else
      if (message.command === this.contextCommand) {
        await this.handleContextMenu();
      }
    });
    this.resolved();
  }

  async showAsWebView(uriOr: vscode.Uri | string): Promise<void> {
    await this.toBeResolved;

    const bad = '';
    const ext = getString(uriOr).split('.').pop()?.toLowerCase() ?? bad;    
    const getPreviewTypeBy: Record<string, PreviewType> = {
      pdf:  PreviewType.pdf,
      htm:  PreviewType.html,
      html: PreviewType.html,
      md:   PreviewType.md,
      md5:  PreviewType.md,
      txt:  PreviewType.txt,
      log:  PreviewType.txt,
      bad:  PreviewType.error
    };
    const type = getPreviewTypeBy[ext] ?? PreviewType.error;
    this.lastWebviewLoaded = false;

    await this.updateWebview(uriOr, type);
    this.view?.show(true);
  }

  async setDefaults(): Promise<void> {
    await this.toBeResolved;

    if (this.view) {
      await this.updateWebview();
      
      this.view.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, "resources"))
        ]
      };
    }
  }

  private setTitle(uriOr: vscode.Uri | string, asString: boolean = false) {
    this.title = asString ? getString(uriOr) : uriOr;
  }

  private async handleContextMenu() {
    const copy = "Copy";
    const tip = "Tip";
    const ok = "Ok";
    const path = getString(this.title);
    const showSettings = hasNoName(path);
    let result: string | undefined;

    if (typeof this.title === "string") {
      result = showSettings ?
        await vscode.window.showInformationMessage(
          "Open extension settings?", ok, "No")
      : await vscode.window.showInformationMessage(
          `File name: ${path}`, ok, copy, tip, 
      );
    }
    if (result === copy) {
      await vscode.env.clipboard.writeText(path);
    }
    else {
      if (showSettings && result === ok) {
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          `@ext:${this.context.extension.id}`
        );
        return;
      }
      if (result === tip) {
        await vscode.window.showInformationMessage(
          "You can hold CTRL to zoom in Preview",
          { modal: true }
        );
      }
      this.setTitle(vscode.Uri.file(path));
    }
  }

  private async updateWebview(
    uri: vscode.Uri | string  = '', 
    type: PreviewType = PreviewType.error
  ): Promise<void> {
    if (!this.view) { return; }

    this.setTitle(uri, true);

    const non = getNonce();
    const csps = this.cspSourceDefault;

    if (type === PreviewType.error) {
      const emptyFrame =
        `<div class="container">
          <h2>Drag-n-Shift Here</h2>
          <div class="placeholder"></div>
        </div>`;
      this.view.webview.html = this.getHtmlTemplate(emptyFrame, non, csps);
      this.setTitle('', true);
      return;
    }
    if (type === PreviewType.md) {
      const content = fs.readFileSync(
        vscode.Uri.file(uri.toString()).fsPath, 'utf-8'
      );
      const markedContent = await marked.parse(content);
      this.view.webview.html = this.getHtmlTemplate(markedContent, non, csps);
      return;
    }
    else {
      fs.readFile(vscode.Uri.file(uri.toString()).fsPath, (err, content) => {
        if (err) { this.showError(this.context.extension.id, err); }
        if (!this.view) { return; }

        if (type === PreviewType.pdf) {
          const pdfContent = this.getPdfTemplate(content,
            vscode.Uri.file(this.context.extensionPath), this.view.webview, non
          );
          this.view.webview.html = this.getHtmlTemplate(pdfContent, non, csps);
          return;
        }
        const htmlContent = content.toString('utf8');
        if (type === PreviewType.txt) {
          this.view.webview.html = this.getHtmlTemplate(
            `<h4>${htmlContent}</h4>`, non, csps
          );
          return;
        }
        this.view.webview.html = this.getHtmlTemplate(htmlContent, non, csps);
      });
    }
  }

  private showError(extensionId: string, err: NodeJS.ErrnoException) {
    vscode.window.showErrorMessage(`${extensionId} error: ${err}`);
  }

  private getHtmlTemplate(content: string, nonce: string, cspSource: string) {
    const csp = [
      `default-src 'none'`,
      `script-src 'nonce-${nonce}' ${cspSource}`,
      `style-src 'nonce-${nonce}' ${cspSource} 'unsafe-inline'`,
      `img-src ${cspSource} blob: data: https:`,
      `frame-src ${cspSource} blob: data:`,
      `worker-src blob: ${cspSource}`,
      `connect-src ${cspSource} https: http://localhost:* http://127.0.0.1:*`
    ].join("; ");

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8"/>
          <meta http-equiv="Content-Security-Policy" content="${csp}">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Preview</title>
          <style nonce="${nonce}">
            body {
              canvas { display: block; }
              color: var(--vscode-foreground);
              font-family: var(--vscode-font-family);
              font-size: var(--vscode-font-size);
              padding: lrem;
            }
            code {
              font-family: monospace;
            }
            ul {
              list-style: none;
              padding: 0;
            }
            .container {
              display: flex;
              flex-direction: column;
              height: 100vh;
            }
            .placeholder {
              flex: 1;
              background: rgba(0, 0, 0, 0.0);
            } 
          </style>
        </head>
        <body id="${this.dropAreaMask}">
          ${content}
          <script nonce="${nonce}" type="module">
            const vscode = acquireVsCodeApi();
            const dropZone = document.getElementById('${this.dropAreaMask}');
            const dropZoneColor = dropZone.style.backgroundColor;

            dropZone.addEventListener('contextmenu', (e) => {
              vscode.postMessage({
                command: '${this.contextCommand}'
              });
            });
            dropZone.addEventListener('dragover', (event) => {
              event.preventDefault();
              dropZone.style.border = '2px dashed var(--vscode-editor-background)';
              dropZone.style.backgroundColor = '#0051ff62';
            });
            dropZone.addEventListener('dragleave', (event) => {
              dropZone.style.border = '2px dashed var(--vscode-background)';
              dropZone.style.backgroundColor = dropZoneColor;
            });
            dropZone.addEventListener('drop', (event) => {
              event.preventDefault();
              dropZone.style.border = '2px dashed var(--vscode-background)';
              dropZone.style.backgroundColor = dropZoneColor;

              const uriList = event.dataTransfer.getData('text/uri-list');
              if (uriList && uriList.length > 0) {
                const uri = uriList.replace('\\n', ';').split(';')[0];
                vscode.postMessage({
                  command: '${this.fileDropCommand}',
                  path: uri
                });
              }
            });

            let state = vscode.getState();
            let scale = state?.scale;
            let center = state?.center;
            let saveTimer;
            const setState = () => vscode.setState({
              scale: scale,
              center: { x: center?.x, y: center?.y }
            });
            const resetState = (disable) => {
              scale = disable ? undefined : 1.0;
              center = disable ? undefined : { x: 0, y: 0 };
              setState();
            };
            const getContentCenter = () => {
              const centerX = (window.scrollX + window.innerWidth/2) / scale;
              const centerY = (window.scrollY + window.innerHeight/2) / scale;
              return { x: centerX, y: centerY };
            };
            const scheduleSave = () => {
              clearTimeout(saveTimer);
              saveTimer = setTimeout(() => {
                center = getContentCenter();
                setState();
              }, 333);
            };
            const waitForLayout = async () => {
              const imgs = Array.from(document.images || []);
              await Promise.all(imgs.map(i => i.decode().catch(() => {})));
              await new Promise(r =>
                requestAnimationFrame(() => requestAnimationFrame(r))
              );
              await new Promise(r => setTimeout(r, 50));
            }
            const transform = async (useScroll) => {
              if (!scale || !center) { return; }
              if (useScroll) {
                await waitForLayout();
                requestAnimationFrame(() => {
                  const targetX = center.x * scale - window.innerWidth/2;
                  const targetY = center.y * scale - window.innerHeight/2;
                  const doc = document.scrollingElement || document.documentElement;
                  doc.scrollTo({
                    left: Math.round(targetX),
                    top: Math.round(targetY),
                    behavior: 'auto'
                  });
                });
              }
              document.body.style.transform = 'scale(' + scale + ')';
              document.body.style.transformOrigin = 'top left';
            };

            window.addEventListener('scroll', scheduleSave, { passive: true });
            window.addEventListener('message', async (event) => {
              if (event.data?.type === '${this.resetStateCommand}') {
                resetState();
                transform(true);
              } else
              if (event.data?.type === '${this.disableStateCommand}') {
                resetState();
                await transform(true);
                resetState(true);
              }
            });
            window.addEventListener('wheel', (e) => {
              if (e.ctrlKey && scale) {
                e.preventDefault();
                scale += e.deltaY < 0 ? 0.1 : -0.1;
                scale = Math.max(0.5, Math.min(2.0, scale));
                setState();
                transform();
              }
            }, { passive: false });

            document.addEventListener(
              'DOMContentLoaded',
              async () => {
                await transform(true);
                vscode.postMessage({
                  command: '${this.contentLoadedCommand}'
                });
              }
            );
          </script>
        </body>
        </html>`;
  }

  private getPdfTemplate(
    pdfContent: string | Buffer,
    extensionPath: vscode.Uri,
    webview: vscode.Webview,
    nonce: string,
    useModernLoad: "yes" | "no" = "yes"
  ) {
    const tempLocalFolder = 'resources';
    const pdfjs = {
      folder: 'pdfjs',
      min: { mjs: 'pdf.min.mjs' },
      worker: { min: { mjs: 'pdf.worker.min.mjs' }}
    };
    const base64Content = (Buffer.isBuffer(pdfContent) ?
        pdfContent as Buffer
      : Buffer.from(pdfContent)
    ).toString('base64');
    const dataUri = `data:application/pdf;base64,${base64Content}`;
    const pdfjsUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(extensionPath.fsPath, tempLocalFolder,
          pdfjs.folder, pdfjs.min.mjs))
    );
    const workerUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(extensionPath.fsPath, tempLocalFolder,
          pdfjs.folder, pdfjs.worker.min.mjs))
    );

    return `<div id="drop-zone">
              <div id="pdf-viewer-container"/>
            </div>
        <script nonce="${nonce}" type="module">
          import { getDocument, GlobalWorkerOptions } from '${pdfjsUri}';

          if ('${useModernLoad}' === 'no') {
            GlobalWorkerOptions.workerSrc = '${workerUri}';
          } else {
            const res = await fetch('${workerUri}');
            const code = await res.text();
            const blob = new Blob([code], { type: 'application/javascript' });
            GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
          }
          const pdfDataUri = '${dataUri}';
          const [_, base64Content] = pdfDataUri.split(',');

          const pdfData = atob(base64Content);
          const pdfjsLib = getDocument({
            data: pdfData
          });
          
          pdfjsLib.promise.then(pdf => {
            const viewerContainer = document.getElementById('pdf-viewer-container');
            for(let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
              pdf.getPage(pageNum).then(page => {
                const scale = 1.5;
                const viewport = page.getViewport({ scale: scale });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                viewerContainer.appendChild(canvas);
                
                const renderContext = {
                  canvasContext: context,
                  viewport: viewport
                };
                page.render(renderContext);
              });
            }
          });
        </script>`;  
  }
}
