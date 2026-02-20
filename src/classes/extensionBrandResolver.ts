import * as vscode from "vscode";
import { exec } from 'child_process';
import { ExtensionContext } from "vscode";
import { CommandRegistrator } from "./commandRegistrator";
import { rootDir } from "./utilManager";

const resolver = "just-files";

const gitexec: string = "git rev-parse --abbrev-ref HEAD";
const branch: string = "<branch>";
const link152: string =
  "https://github.com/maxoiduss/just-files/"   +
  `blob/${branch}/src/classes/` +
  "extensionBrandResolver.ts#L152";
const link171: string =
  "https://github.com/maxoiduss/just-files/"   +
  `blob/${branch}/src/classes/` +
  "extensionBrandResolver.ts#L171";

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
  public static readonly brand: string;
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
    &&  value.startsWith(ExtensionBrandResolver.brand)
    && !value.includes(":");

  constructor(private readonly context: ExtensionContext) {
    if (ExtensionBrandResolver.instance) { return; }

    ExtensionBrandResolver.instance = this;
  }

  private setupBrand() {
    const name = ExtensionBrandResolver.brand;
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
    brand.getSelected = `${name}.getSelected`;
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
    const fromPackageJson = this.readConfigThenCommandsAndViews();
    if (!fromPackageJson) { return; }

    const commands = fromPackageJson.commands.map(
      (rec: { command: string; }) => rec.command
    ) as string[];
    const on = new Set(commands.sort());
    const branding = new Set<string>(
      Object.values(brand).filter(this.filtration).sort()
    );
    const validated = validate([...branding], on);
    if (!validated) {
      this.showError("validateSetup failed", link152);
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
      this.showError("validateCommandRegistration failed", link171);
      throw new Error("PACKAGE.JSON DOESN'T CONTAIN REGISTRATION");
    }
  }

  private showError(detail: string, link: string) {
    const jf: TreeViewX = "Just Files";
    const open = "Check on Github";
    const title = `Source: ${jf}`;
    exec(gitexec, { cwd: rootDir }, (err: any, stdout: string) => {
      const branchName = stdout.trim();
      link = link.replace(branch, branchName);
      vscode.window.showErrorMessage(title, {
          modal: true,
          detail: `${detail} \nvisit: ${link}`
        }, open
      ).then((answer) => {
        if (answer === open) {
          vscode.env.openExternal(vscode.Uri.parse(link));
      }});
    });
  }

  private readConfigThenCommandsAndViews() {
    const extensions = vscode.extensions.all
      .filter(ext => ext.id.includes(resolver))
      .map(ext => {
        const packageJSON: any = ext.packageJSON;
        return {
          configuration: packageJSON.contributes?.configuration || [],
          commands: packageJSON.contributes?.commands || [],
          views: packageJSON.contributes?.views || {}
        };
      });
    return extensions.length > 0 ? extensions[0] : undefined;
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
    
    const fromPackageJson = this.readConfigThenCommandsAndViews();
    if (!fromPackageJson) { return; }

    const configs = fromPackageJson.configuration.map(
      (rec: { properties: { _: HasType } }) => rec.properties
    ) as { _: HasType }[];
    const commands = fromPackageJson.commands.map(
      (rec: { command: string; }) => rec.command
    ) as string[];
    const webviews = Object.values(fromPackageJson.views).find(
      (v) => Array.isArray(v) && v.some(item => isWebview(item))
    ) as Array<HasId>;
    const treeviews = Object.values(fromPackageJson.views).find(
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
    self.brand = command;
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
