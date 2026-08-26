import { Brand, ViewX } from "../types/vscodes";
import { getRegistratorCommands } from "./commandRegistrator";
import { LogService } from "./logService";

const resolver  = "only-files"       as const;
const resolved  = "ALREADY RESOLVED" as const;
const container = "files-explorer"   as const;

const branch = "redesign" as const;
const link183: string =
  "https://github.com/maxoiduss/only-files/" +
  `blob/${branch}/src/classes/`              +
  "extensionBrandResolver.ts#L183";
const link201: string =
  "https://github.com/maxoiduss/only-files/" +
  `blob/${branch}/src/classes/`              +
  "extensionBrandResolver.ts#L201";

const validate = (entries: string[], on: Set<string>): boolean => {
  return entries.every((entry) => on.has(entry));
};

type HasType = { type: string | undefined };
type HasId = { id: string };
// eslint-disable-next-line @typescript-eslint/naming-convention
type array = Array<unknown>;

export const brand = {} as Brand;
/**
 * ```
 * class ExtensionBrandResolver {
    public static readonly command: string;
    ...
 * ```
 * Resolves all properties and commands from parsed package.json.
 * 
 * Provides public static readonly properties as properies and views 
 * declared in package.json file. Uses *command* as main name 
 * (before the dot) for every command.
 * 
 * All commands declared in package.json are provided by *brand*. It 
 * is populated and tested inside the class.
 * 
 * *validateSetup* checks the common command names for correctness.
 * 
 * *validateCommandRegistration* checks commands of CommandRegistrator.
 */
export class ExtensionBrandResolver {
  public static readonly command: string;
  public static readonly webview: string;
  public static readonly treeview1: string;
  public static readonly treeview2: string;
  public static readonly keybindings: array;
  public static readonly configuration: string;
  public static readonly stringProperty: string;
  public static readonly number1Property: string;
  public static readonly number2Property: string;
  public static readonly number3Property: string;
  public static readonly number4Property: string;
  public static readonly boolean1Property: string;
  public static readonly boolean2Property: string;
  public static readonly boolean3Property: string;
  public static readonly boolean4Property: string;
  public static readonly boolean5Property: string;
  public static readonly boolean3DefaultValue: boolean;
  
  private static instance: ExtensionBrandResolver;

  private readonly filtration:
  (value: unknown, index: number, array: unknown[]) => unknown =
       (value) => typeof value === 'string'
    &&  value.startsWith(ExtensionBrandResolver.command)
    && !value.includes(":");
  
  private commandsJSON: Array<any> = new Array();
  private configurationJSON: Array<any> = new Array();
  private viewsJSON: any;

  private initialized: boolean = false;

  public get tag(): string {
    return this.initialized ? resolved : "NOT INITIALIZED" as const;
  }

  constructor() {
    if (ExtensionBrandResolver.instance) {
      LogService.error(`${ExtensionBrandResolver.name} - ${resolved}`);
    }
    ExtensionBrandResolver.instance = this;
  }

  private setupBrand() {
    /// all names are duplication from its values
    const focus = "focus";
    const name = ExtensionBrandResolver.command;
    brand.show = `${name}.show`;
    brand.hide = `${name}.hide`;
    brand.openFolder = `${name}.openFolder`;
    brand.closeFolder = `${name}.closeFolder`;
    brand.getSelected = `${name}:getSelected`;
    brand.setSelected = `${name}:setSelected`;
    brand.addItemFromTabMenu = `${name}.addItemFromTabMenu`;
    brand.removeItemFromTabMenu = `${name}.removeItemFromTabMenu`;
    brand.addItemFromCommand = `${name}.addItemFromCommand`;
    brand.removeItemFromCommand = `${name}.removeItemFromCommand`;
    brand.addItemFromExplorer = `${name}.addItemFromExplorer`;
    brand.previewItemFromTab = `${name}.previewItemFromTab`;
    brand.previewItem = `${name}.previewItem`;
    brand.revealInSidebar = `${name}.revealInSidebar`;
    brand.revealInExplorer = "revealInExplorer";
    brand.refuseMarked = `${name}.refuse`;
    brand.collectMarked = `${name}.collect`;
    brand.collapseFolder = `${name}.collapseFolder`;
    brand.uncollapseAll = `${name}.uncollapseAll`;
    brand.removeAll = `${name}.removeAll`;
    brand.remark = `${name}.remark`;
    brand.ignore = `${name}.ignore`;
    brand.ignoreback = `${name}.ignoreback`;
    brand.showAll = `${name}.showAll`;
    brand.showLogs = `${name}.showLogs`;
    brand.showExact = `${name}.showExact`;
    brand.showWarnings = `${name}.showWarnings`;
    brand.switch = `${name}.switch`;
    brand.switchback = `${name}.switchback`;
    brand.searchListFiles = `${name}.searchListFiles`;
    brand.searchListOnlyFiles = `${name}.searchListOnlyFiles`;
    brand.searchListActiveFiles = `${name}.searchListActiveFiles`;
    brand.searchListActiveOnlyFiles = `${name}.searchListActiveOnlyFiles`;
    brand.refreshFiles = `${name}.refreshFiles`;
    brand.refreshOnlyFiles = `${name}.refreshOnlyFiles`;
    brand.refreshSortedOnlyFiles = `${name}.refreshSortedOnlyFiles`;
    brand.manageWatcherExclude = `${name}.manageWatcherExclude`;
    brand.copyFilePath = "copyFilePath";
    brand.setContext = "setContext";
    brand.restore = `${name}.restore`;
    brand.isActive = `${name}:isActive`;
    brand.isIgnored = `${name}:isIgnored`;
    brand.isSorted = `${name}:isSorted`;
    brand.isPlain = `${name}:isPlain`;
    brand.actions = {
      find: "actions.find"
    };
    brand.files = {
      watcherExclude: "files.watcherExclude"
    };
    brand.list = {
      find: "list.find",
      closeFind: "list.closeFind"
    };
    brand.settings = {
      switchToJSON: "settings.switchToJSON"
    };
    brand.vscode = {
      open: "vscode.open",
      openFolder: "vscode.openFolder"
    };
    brand.workbench = {
      action: {
        files: {
          openFolderViaWorkspace:
            "workbench.action.files.openFolderViaWorkspace"
        },
        openSettings: "workbench.action.openSettings",
        openGlobalKeybindings: "workbench.action.openGlobalKeybindings",
        closeFolder: "workbench.action.closeFolder",
        closeActiveEditor: "workbench.action.closeActiveEditor",
        focusActiveEditorGroup: "workbench.action.focusActiveEditorGroup",
        
      },
      view: {
        extension: {
          webviewContainer:
            "workbench.view.extension.pre-view-explorer",
          treeviewContainer:
            `workbench.view.extension.${container}`
        }
      }
    };
    brand.focus = (on) => on === "Files" ?
      `${ExtensionBrandResolver.treeview1}.${focus}`
    : on === "Only Files" ?
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
    if  (!validated) {
      this.showError("validateSetup failed", link183);
      throw new Error("PACKAGE.JSON DOESN'T CONTAIN BRANDING");
    }
    this.validateCommandRegistration(on);
  }

  private validateCommandRegistration(on: Set<string>) {
    const commands = getRegistratorCommands();
    const registration = new Set<string>(
      Object.values(commands).filter(this.filtration).sort()
    );
    const validated = validate([...registration], on);
    if  (!validated) {
      this.showError("validateCommandRegistration failed", link201);
      throw new Error("PACKAGE.JSON DOESN'T CONTAIN REGISTRATION");
    }
  }

  private showError(detail: string, link: string) {
    const jf: ViewX = "Only Files";
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
    const arr = (value: unknown): Array<unknown> => {
      return Array.isArray(value) ? value : [];
    };
    const extensions = vscode.extensions.all.filter(
      (ext) => ext.id.includes(resolver)
    );
    if (extensions.length <= 0 || !extensions[0].packageJSON) {
      throw new Error("PACKAGE.JSON NOT FOUND"); }

    const packageJSON = Object.freeze<{}>(extensions[0].packageJSON);
    if (typeof packageJSON === 'object' 
      && 'contributes' in packageJSON
      && packageJSON.contributes
      && typeof packageJSON.contributes === 'object'
      && 'configuration' in packageJSON.contributes
      && 'keybindings' in packageJSON.contributes
      && 'commands' in packageJSON.contributes
      && 'views' in packageJSON.contributes)
    {
      this.configurationJSON = arr(packageJSON.contributes.configuration);
      this.commandsJSON      = arr(packageJSON.contributes.commands);
      this.viewsJSON         = packageJSON.contributes.views;

      if (packageJSON.contributes.keybindings) {
        const self = ExtensionBrandResolver as any;
        self.keybindings = arr(packageJSON.contributes.keybindings);
      }
    } else {
      throw new Error("PACKAGE.JSON CORRUPTED");
    }
    this.initialized = true;
  }

  public resolve() {
    /// there are settings parts you should use to identify each in json
    const dot = '.'; /// common interactions with human analyzis is here
    const isTreeview = (it: HasType) => it.type === "tree";
    const isWebview = (it: HasType) => it.type === "webview";
    const isBoolean = (it: HasType) => it.type === "boolean";
    const isString = (it: HasType) => it.type === "string";
    const isNumber = (it: HasType) => it.type === "number";
    const hasDefault = (s: string) => s.toLowerCase().includes("default");
    const hasWatcher = (s: string) => s.toLowerCase().includes("watcher");
    const hasHidden = (s: string) => s.toLowerCase().includes("hidden");
    const hasClick = (s: string) => s.toLowerCase().includes("click");
    const hasCopy = (s: string) => s.toLowerCase().includes("copy");
    const hasPick = (s: string) => s.toLowerCase().includes("pick");
    const hasShow = (s: string) => s.toLowerCase().includes("show");
    const hasWait = (s: string) => s.toLowerCase().includes("wait");

    const numSum = (array: any[]) => (array.length - 1) * array.length/2;

    const afterDot = (s?: string) => s?.split(dot)?.slice(1)?.join(dot);
    
    this.readFromPackageJSON();

    const configs = this.configurationJSON.map(
      (rec: { properties: { _: HasType } }) => rec.properties
    ) as { _: HasType }[];
    const commands = this.commandsJSON.map(
      (rec: { command: string; }) => rec.command
    ) as string[];

    const webviews  = Object.values(this.viewsJSON).filter(Array.isArray)
      .flatMap((array) => array).filter(isWebview)  as Array<HasId>;
    const treeviews = Object.values(this.viewsJSON).filter(Array.isArray)
      .flatMap((array) => array).filter(isTreeview) as Array<HasId>;

    const properties = configs.length > 0 ?
      configs[0] : undefined;

    const booleanPropsBodies = properties ?
      Object.entries<HasType>(properties).flatMap(
        ([name, property]) => isBoolean(property) ? [{name, property}]: []
      ) : [];  
    const booleanProps = properties ?
      Object.entries<HasType>(properties).flatMap(
        ([name, property]) => isBoolean(property) ? [name]: []
      ) : [];
    const numberProps = properties ?
      Object.entries<HasType>(properties).flatMap(
        ([name, property]) => isNumber(property) ? [name]: []
      ) : [];
    const stringProps = properties ?
      Object.entries<HasType>(properties).flatMap(
        ([name, property]) => isString(property) ? [name]: []
      ) : [];
    
    let number1Prop = numberProps.length > 0 ?
      numberProps[0] : undefined;
    let number2Prop = numberProps.length > 1 ?
      numberProps[1] : undefined;
    let number3Prop = numberProps.length > 2 ?
      numberProps[2] : undefined;
    let number4Prop = numberProps.length > 3 ?
      numberProps[3] : undefined;
    if (number1Prop && number2Prop && number3Prop && number4Prop) {
      const numbers = [
        number1Prop, number2Prop, number3Prop, number4Prop
      ];
      const clicks  = numbers.findIndex((num) => hasClick(num));
      const picks   = numbers.findIndex((num) => hasPick(num));
      const waits   = numbers.findIndex((num) => hasWait(num));

      if (clicks >= 0 && picks >= 0 && waits >= 0) {
        number4Prop = numbers[waits];
        number3Prop = numbers[picks];
        number1Prop = numbers[clicks];
        number2Prop = numbers[numSum(numbers) -clicks -picks -waits];
      }
    }

    let boolean1Prop = booleanProps.length > 0 ?
      booleanProps[0] : undefined;
    let boolean2Prop = booleanProps.length > 1 ?
      booleanProps[1] : undefined;
    let boolean3Prop = booleanProps.length > 2 ?
      booleanProps[2] : undefined;
    let boolean4Prop = booleanProps.length > 3 ?
      booleanProps[3] : undefined;
    let boolean5Prop = booleanProps.length > 4 ?
      booleanProps[4] : undefined;
    if  (boolean1Prop && boolean2Prop && boolean3Prop
      && boolean4Prop && boolean5Prop)
    {
      const booleans = [
        boolean1Prop, boolean2Prop,
        boolean3Prop, boolean4Prop,
        boolean5Prop
      ];
      const shows    = booleans.findIndex((bool) => hasShow(bool));
      const copies   = booleans.findIndex((bool) => hasCopy(bool));
      const hidden   = booleans.findIndex((bool) => hasHidden(bool));
      const watches  = booleans.findIndex((bool) => hasWatcher(bool));
      
      if (shows >= 0 && watches >= 0 && copies >= 0 && hidden >= 0) {
        boolean5Prop = booleans[hidden];
        boolean4Prop = booleans[copies];
        boolean3Prop = booleans[watches];
        boolean2Prop = booleans[shows];
        boolean1Prop = booleans[
          numSum(booleans) -shows -copies -watches -hidden];
      }
    }
    
    const boolean3Value = Object.entries(booleanPropsBodies.find((body) =>
      body.name === boolean3Prop)?.property ?? {}
    ).flatMap(([name, property])=> hasDefault(name) ? [property] : [])[0];

    const stringProp = stringProps.length > 0 ?
      stringProps[0] : undefined;

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

    let treeview1 = treeviews.length > 0 ?
      treeviews[0].id : undefined;
    let treeview2 = treeviews.length > 1 ?
      treeviews[1].id : undefined;
    if  (treeview1 && treeview2 /// foldersTreeView name should be shorter
      && treeview1.length > treeview2?.length) {
      const temp = treeview1;
      treeview1 = treeview2;
      treeview2 = temp;
    }

    if (!this.initialized) { throw new Error(this.tag); }

    const self = ExtensionBrandResolver as any;
    self.command = command;
    self.webview = webview;
    self.treeview1 = treeview1;
    self.treeview2 = treeview2;
    self.configuration = config;
    self.stringProperty   = afterDot(stringProp);
    self.number1Property  = afterDot(number1Prop);
    self.number2Property  = afterDot(number2Prop);
    self.number3Property  = afterDot(number3Prop);
    self.number4Property  = afterDot(number4Prop);
    self.boolean1Property = afterDot(boolean1Prop);
    self.boolean2Property = afterDot(boolean2Prop);
    self.boolean3Property = afterDot(boolean3Prop);
    self.boolean4Property = afterDot(boolean4Prop);
    self.boolean5Property = afterDot(boolean5Prop);
    self.boolean3DefaultValue = boolean3Value;

    this.setupBrand();
  }

  public static dispose() {
    try {
      ExtensionBrandResolver.instance.configurationJSON = [];
      ExtensionBrandResolver.instance.commandsJSON      = [];
      ExtensionBrandResolver.instance.viewsJSON         = [];
    }
    catch (error) { LogService.error(error); }
    const self = ExtensionBrandResolver as any;
    if (self) { self.instance = undefined; }
  }
}
