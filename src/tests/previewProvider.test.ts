import * as vscode from "vscode";
import { assert, expect } from "chai";
import { extension } from "./helpers/name";
import { sleep } from "../classes/utilManager";
import type { PreviewProvider } from "../classes/previewProvider";

const viewNotDefined = "Preview view is still undefined" as const;

describe("PreviewProvider (integration)", function () {
  this.timeout(20000);

  let api: {
    ExtensionBrandResolver: { webview: string };
    ExtensionStaticService: { context: vscode.ExtensionContext };
    PreviewProvider: PreviewProvider;
  };
  let provider: PreviewProvider;
  let previewHelper: typeof import("../classes/previewProviderHelper");

  before(async () => {
    const ext = vscode.extensions.getExtension(extension);
    assert.isDefined(ext, "extension is not installed");
    api = await ext.activate() as typeof api;
    assert.isDefined(api, "extension does not provide api");

    provider = api.PreviewProvider;
    previewHelper = await import("../classes/previewProviderHelper");
  });

  beforeEach(async () => {
    const viewName = api.ExtensionBrandResolver.webview;
    await vscode.commands.executeCommand(`${viewName}.focus`);
    await sleep(200);
  });

  it("is resolved by VS Code when the Preview view is focused", () => {
    const view = provider.getView();

    assert.isDefined(view, viewNotDefined);
    expect(provider.canBeShownAsWebView()).to.equal(true);
  });

  it("does not replace the resolved view for a cancelled resolution", async () => {
    const view = provider.getView();
    assert.isDefined(view, viewNotDefined);

    await provider.resolveWebviewView(view,
      {} as vscode.WebviewViewResolveContext<unknown>,
      { isCancellationRequested: true } as vscode.CancellationToken
    );

    expect(provider.getView()).to.equal(view);
  });

  it("configures the real webview with defaults", () => {
    const view = provider.getView();
    assert.isDefined(view, viewNotDefined);

    expect(view.webview.options?.enableScripts).to.equal(true);
    expect(view.webview.options?.localResourceRoots).to.have.lengthOf(3);
    expect(view.webview.html).to.contain("Drag-n-Shift Here");
  });

  it("renders an unsupported file as the empty preview", async () => {
    const view = provider.getView();
    assert.isDefined(view, viewNotDefined);

    await provider.showAsWebView(vscode.Uri.file("/workspace/unsupported.bad"));

    expect(view.webview.html).to.contain("Drag-n-Shift Here");
  });

  it("uses the real helper to generate CSP-protected HTML", () => {
    const html = previewHelper.getHtmlTemplate(
      "<h1>Preview</h1>", "nonce-value", "vscode-resource:"
    );
    expect(html).to.contain("<h1>Preview</h1>");
    expect(html).to.contain("nonce-value");
    expect(html).to.contain("default-src 'none'");
    expect(html).to.contain("vscode-resource:");
  });
});
