import * as vscodes from "../types/vscodes";
import * as marked from "marked";
import * as helper from "./previewProviderHelper";
import { brand } from "./extensionBrandResolver";
import { WebviewView } from "vscode";
import { KeybindingsService } from "./keybindingsService";
import { getNonce, getNicePath, getUri, hasNoName, extname
} from "./utilManager";
import {
  contentLoadedCommand,
  contextCommand,
  disableStateCommand,
  fileDropCommand,
  resetStateCommand
} from "./previewProviderHelper";
import { ExtensionStaticService } from "./extensionStaticService";

const empty = '' as const;
// eslint-disable-next-line @typescript-eslint/naming-convention
const PreviewType = {
  pdf:   "pdf",
  html:  "html",
  md:    "md",
  txt:   "txt",
  error: "error"    } as const;

const byId = ExtensionStaticService.withId;

type PreviewType = vscodes.EnumLike<typeof PreviewType>;

export class PreviewProvider
  implements vscode.WebviewViewProvider,
  vscodes.HasDefaults
{
  private readonly context: vscode.ExtensionContext;
  private readonly keybindings = new KeybindingsService();

  private view: WebviewView | undefined;
  private title: vscode.Uri | string = empty;
  private cspSourceDefault!: string;
  private lastViewVisibleValue: boolean = false;
  private lastWebviewLoaded: boolean = false;
  private toBeResolved: Promise<void>;
  private resolved!: () => void;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.toBeResolved = new Promise<void>((resolve) => {
      this.resolved = resolve;
    });
  }

  public async resolveWebviewView(
    webviewView: WebviewView,
    context: vscode.WebviewViewResolveContext<unknown>, 
    token: vscode.CancellationToken): Promise<void | undefined>
  {
    if (token.isCancellationRequested) { return; }

    const view = webviewView;
    this.view = view;
    this.cspSourceDefault = view.webview.cspSource;

    const visibilityTimeout = 100;

    view.onDidDispose(() => this.view = undefined,
      this, this.context.subscriptions
    );

    view.onDidChangeVisibility(() => {
      setTimeout(async () => {
        if (this.lastViewVisibleValue !== view.visible) {
          this.lastViewVisibleValue = view.visible;
          if (this.lastViewVisibleValue) {
            this.setTitle(getNicePath(this.title), true);
          }
        }
      }, visibilityTimeout);
    }, this, this.context.subscriptions);

    view.webview.onDidReceiveMessage(async (message) => {
      if (message.command === fileDropCommand && message.path) {
        const path = message.path as string;
        this.showAsWebView(vscode.Uri.parse(path)); }
      else if (message.command === contentLoadedCommand) {
        if (!this.lastWebviewLoaded) {
          this.lastWebviewLoaded = true;
          hasNoName(getNicePath(this.title)) ?
            view.webview.postMessage({ type: disableStateCommand })
          : view.webview.postMessage({ type: resetStateCommand });
        } }
      else if (message.command === contextCommand) {
        await this.handleContextMenu();
      }
    }, this, this.context.subscriptions);

    this.resolved();
    this.updateDefaults();

    context.state;
  }

  public canBeShownAsWebView(): boolean {
    return this.view !== undefined;
  }

  public async showAsWebView(uriOr: vscode.Uri | string): Promise<void>
  {
    await this.toBeResolved;

    const bad = empty;
    const ext = extname(uriOr) ?? bad;    
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

  public async setDefaults(): Promise<void> {
    await this.toBeResolved;

    this.updateDefaults();
  }

  private async updateDefaults(): Promise<void> {
    if (this.view) {
      await this.updateWebview();
      
      this.view.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "resources")
        ]
      };
    }
  }

  private setTitle(
    uriOr: vscode.Uri | string,
    asString: boolean = false
  ) { this.title = asString ? getNicePath(uriOr) : uriOr; }

  private async handleContextMenu() {
    const copy = "Copy";
    const tip = "Tip";
    const ok = "Ok";
    const pathe = getNicePath(this.title);
    const showSettings = hasNoName(pathe);
    let result: string | undefined;

    if (typeof this.title === "string") {
      result = showSettings ?
        await vscode.window.showInformationMessage(
          "Open extension settings?", ok, "No")
      : await vscode.window.showInformationMessage(
          `File name: ${pathe}`, ok, copy, tip, 
      );
    }

    if (result === copy) {
      await vscode.env.clipboard.writeText(pathe); }
    else {
      if (showSettings && result === ok) {
        await vscode.commands.executeCommand(
          brand.workbench.action.openSettings,
          byId(this.context?.extension?.id)
        );
        return;
      }
      if (result === tip) {
        const showHotKeys = "Show hot keys";
        const answer = await vscode.window.showInformationMessage(
          "You can hold CTRL to zoom in Preview\n" +
          "Holding SHIFT scrolls horizontally",
          { modal: true },
          "Ok", showHotKeys
        );
        answer === showHotKeys
          && await this.keybindings.showMessage(this.context);
      }
      this.setTitle(getUri(pathe));
    }
  }

  private setEmptyView(nonce: string, cspSource: string) {
    this.view!.webview.html = helper.getHtmlTemplate(
      helper.emptyFrame, nonce, cspSource
    );
    this.setTitle(empty, true);
  }

  private async updateWebview(
    uriOr: vscode.Uri | string  = empty, 
    type: PreviewType = PreviewType.error
  ): Promise<void> {
    if (!this.view) { return; }

    this.setTitle(uriOr, true);

    const non = getNonce();
    const csps = this.cspSourceDefault;

    if (type === PreviewType.error) {
      this.setEmptyView(non, csps);

      return;
    }
    if (type === PreviewType.md) {
      const raw = await vscode.workspace.fs.readFile(getUri(uriOr));
      const content = Buffer.from(raw).toString('utf8');
      const markedContent = await marked.parse(content);
      this.view.webview.html = helper.getHtmlTemplate(
        markedContent, non, csps
      );
      return;
    }
    else {
      try {
        const raw = await vscode.workspace.fs.readFile(getUri(uriOr));
        const content = Buffer.from(raw);
        if (!this.view) { return; }

        if (type === PreviewType.pdf) {
          const pdfContent = helper.getPdfTemplate(content,
            vscode.Uri.file(this.context.extensionPath),
            this.view.webview,
            non
          );
          this.view.webview.html = helper.getHtmlTemplate(pdfContent,
            non,
            csps
          );
          return;
        }

        const htmlContent = content.toString('utf8');
        if (type === PreviewType.txt) {
            this.view.webview.html = helper.getHtmlTemplate(
              `<h4>${htmlContent}</h4>`,
              non,
              csps
            );
            return;
          }
          this.view.webview.html = helper.getHtmlTemplate(
            htmlContent,
            non,
            csps
          );
        }
      catch (err) {
        this.showError(this.context.extension.id, err); }
    }
  }

  private showError(extensionId: string, err: unknown) {
    vscode.window.showErrorMessage(`${extensionId} error: ${err}`);
  }
}
