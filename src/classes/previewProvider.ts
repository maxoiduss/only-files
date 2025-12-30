import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as marked from "marked";
import { WebviewView } from "vscode";

export function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

enum PreviewType {
  pdf = 'pdf',
  html = 'html',
  md = 'md',
  txt = 'txt',
  error = 'error'
}

export class PreviewProvider implements vscode.WebviewViewProvider {
  private view: WebviewView | undefined;
  private title: string | undefined;
  private context: vscode.ExtensionContext;

  readonly dropAreaMask = 'dropzone';
  readonly fileDropCommand = 'fileDropped';
  readonly contextCommand = 'contextMenu';

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.view = undefined;
    this.updateWebview();
  }

  private showError(extensionId: string, err: NodeJS.ErrnoException) {
    vscode.window.showErrorMessage(`${extensionId} error: ${err}`);
  }

  resolveWebviewView(webviewView: WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>, 
        token: vscode.CancellationToken): void | Thenable<void> {
    webviewView.webview.options = {
      enableScripts: true,
      enableForms: true,
      enableCommandUris: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'resources'))]
    };
    this.view = webviewView;
    this.updateWebview();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === this.fileDropCommand && message.path) {
        const path = message.path as string;
        this.showAsWebView(vscode.Uri.parse(path).fsPath);
      } else
      if (message.command === this.contextCommand && message.path) {
        const path = message.path as string;
        const copy = "Copy";
        let result: string | undefined;

        if (this.title) {
          result = await vscode.window.showInformationMessage(
            `File name: ${this.title}`, "Ok", copy
          );
        }
        if (result === copy) {
          await vscode.env.clipboard.writeText(this.title ?? path);
        }
        else {
          this.title = undefined;
        }
      }
    });
  }

  showAsWebView(uri: vscode.Uri | string) {
    if (!this.view) { return; }

    const pathTo = typeof uri === 'string' ? uri : uri.fsPath;
    const ext = pathTo.split('.').pop()?.toLowerCase();

    let type = PreviewType.error;
    switch (ext) {
      case 'pdf':
        type = PreviewType.pdf; break;
      case 'md': case 'md5':
        type = PreviewType.md; break;
      case 'txt': case 'log':
        type = PreviewType.txt; break;
      case 'html': case 'htm':
        type = PreviewType.html; break;
      default: break;
    }
    this.updateWebview(uri, type);
  }

  private async updateWebview(uri: vscode.Uri | string  = '', type: PreviewType = PreviewType.error) {
    if (!this.view) { return; }

    this.title = typeof uri === 'string' ? uri : uri.fsPath;

    if (type === PreviewType.error) {
      const emptyFrame = `<div class="container"><h2>Drag-n-Shift Here</h2><div class="placeholder"></div></div>`;
      this.view.webview.html = this.getHtmlTemplate(emptyFrame);
      return;
    }
    if (type === PreviewType.md) {
      const content = fs.readFileSync(vscode.Uri.file(uri.toString()).fsPath, 'utf-8');
      const markedContent = await marked.parse(content);
      this.view.webview.html = this.getHtmlTemplate(markedContent);
      return;
    }
    else {
      fs.readFile(vscode.Uri.file(uri.toString()).fsPath, (err, content) => {
        if (err) { this.showError(this.context.extension.id, err); }
        if (!this.view) { return; }
        if (type === PreviewType.pdf) {
          const pdfContent = this.getPdfTemplate(content);
          this.view.webview.html = this.getHtmlTemplate(pdfContent);
          return;
        }
        const htmlContent = content.toString('utf8');
        if (type === PreviewType.txt) {
          this.view.webview.html = this.getHtmlTemplate(`<h4>${htmlContent}</h4>`);
          return;
        }
        this.view.webview.html = this.getHtmlTemplate(htmlContent);
      });
      return;
    }
  }

  private getHtmlTemplate(content: string) {
    const nonce = getNonce();
    const csp = `default-src 'none'; img-src ${this.view?.webview.cspSource} blob:;
      style-src 'nonce-${nonce}' ${this.view?.webview.cspSource}; script-src 'nonce-${nonce}';`;

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta http-equiv="Content-Security-Policy" content="${csp}">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Preview</title>
          <style>
            <style nonce="${nonce}"/>
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
        <body id='${this.dropAreaMask}'>
          ${content}
          <script nonce='${nonce}' type='module'>
            const vscode = acquireVsCodeApi();
            const dropZone = document.getElementById('${this.dropAreaMask}');
            const dropZoneColor = dropZone.style.backgroundColor;
            let docName = '${this.title}';

            dropZone.addEventListener("contextmenu", (e) => {
              vscode.postMessage({
                command: '${this.contextCommand}',
                path: docName ?? '${this.title}'
              });
            });

            dropZone.addEventListener('dragover', (event) => {
              event.preventDefault();
              dropZone.style.border = '2px dashed var(--vscode-editor-background)';
              dropZone.style.backgroundColor = "#0051ff62";
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
                docName = uri;
                vscode.postMessage({
                  command: '${this.fileDropCommand}',
                  path: uri
                });
              }
            });
            
            let scale = 1.0;
            window.addEventListener('wheel', (e) => {
              if (e.ctrlKey) {
                e.preventDefault();
                scale += e.deltaY < 0 ? 0.1 : -0.1;
                scale = Math.max(0.5, Math.min(2.0, scale));
                document.body.style.transform = "scale(" + scale + ")";
                document.body.style.transformOrigin = 'top left';
              }
            }, { passive: false });
          </script>
        </body>
        </html>`;
  }

  private getPdfTemplate(pdfContent: string | Buffer) {
    if (!this.view) { return ''; }
    const tempLocalFolder = 'resources';
    const pdfjsFolder = 'pdfjs';
    const extensionPath = vscode.Uri.file(this.context.extensionPath);

    const base64Content = (Buffer.isBuffer(pdfContent) ?
        pdfContent as Buffer
      :   Buffer.from(pdfContent)).toString('base64');

    const dataUri = `data:application/pdf;base64,${base64Content}`;
    const pdfjsUri = this.view.webview.asWebviewUri(
      vscode.Uri.file(
        path.join(extensionPath.fsPath, tempLocalFolder, pdfjsFolder, 'pdf.min.mjs'))
    );
    const workerUri = this.view.webview.asWebviewUri(
      vscode.Uri.file(
        path.join(extensionPath.fsPath, tempLocalFolder, pdfjsFolder, 'pdf.worker.min.mjs'))
    );
    const nonce = getNonce();

    return `<div id='drop-zone'>
              <div id='pdf-viewer-container' />
            </div>
        <script nonce='${nonce}' type="module">
          import { getDocument, GlobalWorkerOptions } from '${pdfjsUri}';
          GlobalWorkerOptions.workerSrc = '${workerUri}';

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