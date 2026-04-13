import * as vscode from "vscode";
import { ExtensionContext } from "vscode";
import { CommandRegistrator } from "./commandRegistrator";

const resolver = "just-files" as const;

const branch = "mergeFromMaxoiduss-fixes" as const;
const link176: string =
  "https://github.com/maxoiduss/just-files/"   +
  `blob/${branch}/src/classes/` +
  "extensionBrandResolver.ts#L176";
const link194: string =
  "https://github.com/maxoiduss/just-files/"   +
  `blob/${branch}/src/classes/` +
  "extensionBrandResolver.ts#L194";

type ViewX = "Files" | "Just Files" | "Preview";
type HasType = { type: string | undefined };
type HasId = { id: string };

interface Brand {
  show: string;
  hide: string;
  openFolder: string;
  closeFolder: string;
  closeFolderAction: string;
  getSelected: string;
  setSelected: string;
  addItemFromTabMenu: string;
  removeItemFromTabMenu: string;
  addItemFromCommand: string;
  removeItemFromCommand: string;
  addItemFromExplorer: string;
  revealInSidebar: string;
  revealInExplorer: string;
  collectMarked: string;
  collapseFolder: string;
  uncollapseAll: string;
  previewItem: string;
  removeAll: string;
  remark: string;
  ignore: string;
  showLogs: string;
  switch: string;
  switchback: string;
  searchListFiles: string;
  searchListJustFiles: string;
  refreshFiles: string;
  refreshJustFiles: string;
  refreshSortedJustFiles: string;
  setContext: string;
  isSorted: string;
  isPlain: string;
  restore: string;
  list: {
    find: string,
    closeFind: string
  };
  vscode: {
    open: string,
    openFolder: string
  };
  workbench: {
    action : {
      openSettings: string,
      closeFolder: string,
      closeActiveEditor: string,
      focusActiveEditorGroup: string
    },
    view: {
      extension: {
        webviewContainer: string,
        treeviewContainer: string
      }
    }
  };
  focus: (on: ViewX) => string;
}
export const brand = {} as Brand;

function validate(entries: string[], on: Set<string>): boolean {
  return entries.every(entry => on.has(entry));
}

export class ExtensionBrandResolver {
  public static readonly command: string;
  public static readonly webview: string;
  public static readonly treeview1: string;
  public static readonly treeview2: string;
  public static readonly configuration: string;
  public static readonly stringProperty: string;
  public static readonly number1Property: string;
  public static readonly number2Property: string;
  public static readonly number3Property: string;
  public static readonly boolean1Property: string;
  public static readonly boolean2Property: string;
  
  private static instance: ExtensionBrandResolver;

  private readonly filtration:
  (value: any, index: number, array: any[]) => unknown =
        value => typeof value === "string"
    &&  value.startsWith(ExtensionBrandResolver.command)
    && !value.includes(":");
  
  private commandsJSON: any;
  private configurationJSON: any;
  private viewsJSON: any;

  constructor(private readonly context: ExtensionContext) {
    if (ExtensionBrandResolver.instance) { throw Error("ALREADY RESOLVED"); }

    ExtensionBrandResolver.instance = this;
  }

  private setupBrand() {
    const focus = "focus";
    const name = ExtensionBrandResolver.command;
    brand.setContext = "setContext";
    brand.show = `${name}.show`;
    brand.hide = `${name}.hide`;
    brand.addItemFromTabMenu = `${name}.addItemFromTabMenu`;
    brand.removeItemFromTabMenu = `${name}.removeItemFromTabMenu`;
    brand.addItemFromCommand = `${name}.addItemFromCommand`;
    brand.removeItemFromCommand = `${name}.removeItemFromCommand`;
    brand.addItemFromExplorer = `${name}.addItemFromExplorer`;
    brand.openFolder = `${name}.openFolder`;
    brand.closeFolder = `${name}.closeFolder`;
    brand.revealInSidebar = `${name}.revealInSidebar`;
    brand.revealInExplorer = "revealInExplorer";
    brand.collectMarked = `${name}.collect`;
    brand.collapseFolder = `${name}.collapseFolder`;
    brand.uncollapseAll = `${name}.uncollapseAll`;
    brand.previewItem = `${name}.previewItem`;
    brand.removeAll = `${name}.removeAll`;
    brand.remark = `${name}.remark`;
    brand.ignore = `${name}.ignore`;
    brand.showLogs = `${name}.showLogs`;
    brand.switch = `${name}.switch`;
    brand.switchback = `${name}.switchback`;
    brand.searchListFiles = `${name}.searchListFiles`;
    brand.searchListJustFiles = `${name}.searchListJustFiles`;
    brand.refreshFiles = `${name}.refreshFiles`;
    brand.refreshJustFiles = `${name}.refreshJustFiles`;
    brand.refreshSortedJustFiles = `${name}.refreshSortedJustFiles`;
    brand.getSelected = `${name}:getSelected`;
    brand.setSelected = `${name}:setSelected`;
    brand.isSorted = `${name}:isSorted`;
    brand.isPlain = `${name}:isPlain`;
    brand.restore = `${name}.restore`;
    brand.list = {
      find: "list.find",
      closeFind: "list.closeFind"
    };
    brand.vscode = {
      open: "vscode.open",
      openFolder: "vscode.openFolder"
    };
    brand.workbench = {
      action: {
        openSettings: "workbench.action.openSettings",
        closeFolder: "workbench.action.closeFolder",
        closeActiveEditor: "workbench.action.closeActiveEditor",
        focusActiveEditorGroup:
          "workbench.action.focusActiveEditorGroup"
      },
      view: {
        extension: {
          webviewContainer:
            "workbench.view.extension.pre-view-container",
          treeviewContainer:
            "workbench.view.extension.just-files-explorer"
        }
      }
    };
    brand.focus = (on) => on === "Files" ?
      `${ExtensionBrandResolver.treeview1}.${focus}`
    : on === "Just Files" ?
        `${ExtensionBrandResolver.treeview2}.${focus}`
      : `${ExtensionBrandResolver.webview}.${focus}`;
    
    this.validateSetup();
  }

  private validateSetup() {
    if (!Array.isArray(this.commandsJSON)) { return; }

    const commands = this.commandsJSON.map(
      (rec: { command: string; }) => rec.command
    ) as string[];
    const on = new Set(commands.sort());
    const branding = new Set<string>(
      Object.values(brand).filter(this.filtration).sort()
    );
    const validated = validate([...branding], on);
    if (!validated) {
      this.showError("validateSetup failed", link176);
      throw new Error("PACKAGE.JSON DOESN'T CONTAIN BRANDING");
    }
    this.validateCommandRegistration(on);
  }

  private validateCommandRegistration(on: Set<string>) {
    const commands = CommandRegistrator.getCommands();
    const registration = new Set<string>(
      Object.values(commands).filter(this.filtration).sort()
    );
    const validated = validate([...registration], on);
    if (!validated) {
      this.showError("validateCommandRegistration failed", link194);
      throw new Error("PACKAGE.JSON DOESN'T CONTAIN REGISTRATION");
    }
  }

  private showError(detail: string, link: string) {
    const jf: ViewX = "Just Files";
    const open = "Check on Github";
    const title = `Source: ${jf}`;
    vscode.window.showErrorMessage(title, {
        modal: true,
        detail: `${detail} \nvisit: ${link}`
      }, open
    ).then((answer) => {
      if (answer === open) {
        vscode.env.openExternal(vscode.Uri.parse(link));
    }});
  }

  private readFromPackageJSON() {
    const extensions = vscode.extensions.all
      .filter(ext => ext.id.includes(resolver));
    if (extensions.length <= 0) {
      throw new Error("PACKAGE.JSON NOT FOUND");
    }
    const packageJSON: any = extensions[0].packageJSON;
    this.configurationJSON
      = packageJSON.contributes?.configuration || [];
    this.commandsJSON = packageJSON.contributes?.commands || [];
    this.viewsJSON = packageJSON.contributes?.views || {};
  }

  public resolve() {
    const dot = ".";
    const isTreeview = (it: HasType) => it.type ?? "tree" === "tree";
    const isWebview = (it: HasType) => it.type === "webview";
    const isBoolean = (it: HasType) => it.type === "boolean";
    const isString = (it: HasType) => it.type === "string";
    const isNumber = (it: HasType) => it.type === "number";
    const hasClick = (s: string) => s.toLowerCase().includes("click");
    const hasPick = (s: string) => s.toLowerCase().includes("pick");
    const hasShow = (s: string) => s.toLowerCase().includes("show");
    const afterDot = (s?: string) => s?.split(dot)?.slice(1)?.join(dot);
    
    this.readFromPackageJSON();

    const configs = this.configurationJSON.map(
      (rec: { properties: { _: HasType } }) => rec.properties
    ) as { _: HasType }[];
    const commands = this.commandsJSON.map(
      (rec: { command: string; }) => rec.command
    ) as string[];
    const webviews = Object.values(this.viewsJSON).find(
      (v) => Array.isArray(v) && v.some(item => isWebview(item))
    ) as Array<HasId>;
    const treeviews = Object.values(this.viewsJSON).find(
      (v) => Array.isArray(v) && v.some(item => isTreeview(item))
    ) as Array<HasId>;

    const properties = configs.length > 0 ?
      configs[0] : undefined;
    
    const numberProps = properties ?
      Object.entries<HasType>(properties).flatMap(
        ([name, property]) => isNumber(property) ? [name]: []
      ) : [];
    const booleanProps = properties ?
      Object.entries<HasType>(properties).flatMap(
        ([name, property]) => isBoolean(property) ? [name]: []
      ) : [];
    const stringProps = properties ?
      Object.entries<HasType>(properties).flatMap(
        ([name, property]) => isString(property) ? [name]: []
      ) : [];
    
    let number1Prop = numberProps.length > 1 ?
      numberProps[0] : undefined;
    let number2Prop = numberProps.length > 1 ?
      numberProps[1]: undefined;
    let number3Prop = numberProps.length > 1 ?
      numberProps[2]: undefined;
    if (number1Prop && number2Prop && number3Prop) {
      const numbers = [number1Prop, number2Prop, number3Prop];
      const clicks = numbers.findIndex((num) => hasClick(num));
      const picks = numbers.findIndex((num) => hasPick(num));
      const all = (numbers.length - 1) * numbers.length / 2;
      if (clicks > 0 && picks > 0) {
        number1Prop = numbers[clicks];
        number3Prop = numbers[picks];
        number2Prop = numbers[all - clicks - picks];
      }
    }

    let stringProp = stringProps.length > 0 ?
      stringProps[0] : undefined;

    const boolean1Prop = booleanProps.length > 1 && !hasShow(booleanProps[0]) ?
      booleanProps[0]
    : booleanProps.length > 1 ? booleanProps[1] : undefined;
    
    const boolean2Prop = booleanProps.length > 1 && hasShow(booleanProps[1]) ?
      booleanProps[1]
    : booleanProps.length > 0 ? booleanProps[0] : undefined;
    
    const config = new Set<string>(
      [number1Prop, boolean1Prop].map((prop) =>
        prop ? prop.split(dot)[0] : dot
      )
    ).keys().next().value;

    const command = new Set<string>(
      commands.map((c) => c.split(dot)[0])
    ).keys().next().value;

    const webview = webviews.length > 0 ?
      webviews[0].id
    : undefined;

    let treeview1 = treeviews.length > 1 ?
      treeviews[0].id : undefined;
    let treeview2 = treeviews.length > 1 ?
      treeviews[1].id : undefined;
    if  (treeview1 && treeview2
      && treeview1.length > treeview2?.length) {
      const temp = treeview1;
      treeview1 = treeview2;
      treeview2 = temp;
    }

    const self = ExtensionBrandResolver as any;
    self.command = command;
    self.webview = webview;
    self.treeview1 = treeview1;
    self.treeview2 = treeview2;
    self.configuration = config;
    self.stringProperty = afterDot(stringProp);
    self.number1Property = afterDot(number1Prop);
    self.number2Property = afterDot(number2Prop);
    self.number3Property = afterDot(number3Prop);
    self.boolean1Property = afterDot(boolean1Prop);
    self.boolean2Property = afterDot(boolean2Prop);
    
    this.setupBrand();
  }

  static dispose() {
    ExtensionBrandResolver.instance.configurationJSON = undefined;
    ExtensionBrandResolver.instance.commandsJSON = undefined;
    ExtensionBrandResolver.instance.viewsJSON = undefined;
  }
}
