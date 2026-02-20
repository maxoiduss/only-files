import * as vscode from "vscode";
import { ExtensionContext } from "vscode";
import { CommandRegistrator } from "./commandRegistrator";

const resolver = "just-files";

const branch: string = "mergeFromMaxoiduss-fixes";
const link153: string =
  "https://github.com/maxoiduss/just-files/"   +
  `blob/${branch}/src/classes/` +
  "extensionBrandResolver.ts#L153";
const link172: string =
  "https://github.com/maxoiduss/just-files/"   +
  `blob/${branch}/src/classes/` +
  "extensionBrandResolver.ts#L172";

type TreeViewX = "Files" | "Just Files";
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
  collapseFolder: string;
  uncollapseAll: string;
  previewItem: string;
  removeAll: string;
  ignore: string;
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
      closeFolder: string,
      focusActiveEditorGroup: string
    }
  };
  focus: (on: TreeViewX) => string;
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
  public static readonly booleanProperty: string;
  
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
    if (ExtensionBrandResolver.instance) { return; }

    ExtensionBrandResolver.instance = this;
  }

  private setupBrand() {
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
    brand.collapseFolder = `${name}.collapseFolder`;
    brand.uncollapseAll = `${name}.uncollapseAll`;
    brand.previewItem = `${name}.previewItem`;
    brand.removeAll = `${name}.removeAll`;
    brand.ignore = `${name}.ignore`;
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
        closeFolder: "workbench.action.closeFolder",
        focusActiveEditorGroup:
          "workbench.action.focusActiveEditorGroup"
      }
    };
    brand.focus = (on) => on === "Files" ?
      `${ExtensionBrandResolver.treeview1}.focus`
    : `${ExtensionBrandResolver.treeview2}.focus`;
    
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
      this.showError("validateSetup failed", link153);
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
      this.showError("validateCommandRegistration failed", link172);
      throw new Error("PACKAGE.JSON DOESN'T CONTAIN REGISTRATION");
    }
  }

  private showError(detail: string, link: string) {
    const jf: TreeViewX = "Just Files";
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
    if (number2Prop && number1Prop && hasClick(number2Prop)) {
      const temp = number1Prop;
      number1Prop = number2Prop;
      number2Prop = temp;
    }

    const stringProp = stringProps.length > 0 ?
      stringProps[0] : undefined;

    const booleanProp = booleanProps.length > 0 ?
      booleanProps[0] : undefined;
    
    const config = new Set<string>(
      [number1Prop, number2Prop, booleanProp].map((prop) =>
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
    self.booleanProperty = afterDot(booleanProp);
    
    this.setupBrand();
  }
}
