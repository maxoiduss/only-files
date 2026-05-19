const container = "container" as const;
const placeholder = "placeholder" as const;
const dropAreaMask = 'dropzone' as const;

export const contextCommand = 'contextMenu' as const;
export const resetStateCommand = 'resetState' as const;
export const disableStateCommand = 'disableState' as const;
export const contentLoadedCommand = 'contentLoaded' as const;
export const fileDropCommand = 'fileDropped' as const;

export const emptyFrame =
  `<div class="${container}">
    <h2>Drag-n-Shift Here</h2>
    <div class="${placeholder}"></div>
  </div>` as const;

export const getPdfTemplate = (
  pdfContent: string | Buffer,
  extensionUri: vscode.Uri,
  webview: vscode.Webview,
  nonce: string,
  useModernLoad: "yes" | "no" = "yes"
) => {
  const tempLocalFolder = 'resources';
  const viewerContainer = 'pdf-viewer-container';
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
    vscode.Uri.joinPath(extensionUri,
      tempLocalFolder, pdfjs.folder, pdfjs.min.mjs)
  );
  const workerUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri,
      tempLocalFolder, pdfjs.folder, pdfjs.worker.min.mjs)
  );

  return `<div id="drop-zone">
            <div id="${viewerContainer}"/>
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
          const viewerContainer = document.getElementById('${viewerContainer}');
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
};

export const getHtmlTemplate = (content: string, nonce: string, cspSource: string) => {
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
          .${container} {
            display: flex;
            flex-direction: column;
            height: 100vh;
          }
          .${placeholder} {
            flex: 1;
            background: rgba(0, 0, 0, 0.0);
          } 
        </style>
      </head>
      <body id="${dropAreaMask}">
        ${content}
        <script nonce="${nonce}" type="module">
          const vscode = acquireVsCodeApi();
          const dropZone = document.getElementById('${dropAreaMask}');
          const dropZoneColor = dropZone.style.backgroundColor;

          dropZone.addEventListener('contextmenu', (e) => {
            vscode.postMessage({
              command: '${contextCommand}'
            });
          }, { passive: true });
          dropZone.addEventListener('dragover', (event) => {
            event.preventDefault();
            dropZone.style.border = '2px dashed var(--vscode-editor-background)';
            dropZone.style.backgroundColor = '#0051FF62';
          }, { passive: true });
          dropZone.addEventListener('dragleave', (event) => {
            dropZone.style.border = '2px dashed var(--vscode-background)';
            dropZone.style.backgroundColor = dropZoneColor;
          }, { passive: true });
          dropZone.addEventListener('drop', (event) => {
            event.preventDefault();
            dropZone.style.border = '2px dashed var(--vscode-background)';
            dropZone.style.backgroundColor = dropZoneColor;

            const uriList = event.dataTransfer.getData('text/uri-list');
            if (uriList && uriList.length > 0) {
              const uri = uriList.replace('\\n', ';').split(';')[0];
              vscode.postMessage({
                command: '${fileDropCommand}',
                path: uri
              });
            }
          }, { passive: false });

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
            if (event.data?.type === '${resetStateCommand}') {
              resetState();
              transform(true);
            } else
            if (event.data?.type === '${disableStateCommand}') {
              resetState();
              await transform(true);
              resetState(true);
            }
          }, { passive: true });
          window.addEventListener('wheel', (e) => {
            if (e.ctrlKey && scale) {
              e.preventDefault();
              scale += e.deltaY < 0 ? 0.1 : -0.1;
              scale = Math.max(0.5, Math.min(2.0, scale));
              setState();
              transform();
            }
          }, { passive: false });

          document.addEventListener('DOMContentLoaded',
            async () => {
              await transform(true);
              vscode.postMessage({
                command: '${contentLoadedCommand}'
              });
            }, { passive: true }
          );
        </script>
      </body>
      </html>`;
};
