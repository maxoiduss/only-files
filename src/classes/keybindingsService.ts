import { ExtensionStaticService } from "./extensionStaticService";
import { brand, ExtensionBrandResolver
} from "./extensionBrandResolver";

interface KeybindingContribution {
  command?: unknown;
  key?: unknown;
  mac?: unknown;
  win?: unknown;
  linux?: unknown;
}

interface ExtensionKeybinding {
  readonly key: string;
  readonly command: string;
}

const byId = ExtensionStaticService.withId;
const keybindings = () => ExtensionBrandResolver.keybindings;

const isKeybindingContribution = (
  value: unknown
): value is KeybindingContribution => {
  return typeof value === "object" && value !== null;
};

const platformKey = (): KeybindingPlatform => {
  switch (process.platform) {
    case "darwin": return "mac";
    case "win32": return "win";
    default: return "linux";
  }
};

type KeybindingPlatform = "key" | "mac" | "win" | "linux";

export class KeybindingsService {
  private static instance: KeybindingsService | undefined;

  private readonly bindings!: ExtensionKeybinding[];

  public get keybindings(): ExtensionKeybinding[] {
    return KeybindingsService.instance?.bindings ?? this.bindings;
  }

  public constructor() {
    if (KeybindingsService.instance) {
      return; }

    if (keybindings().length <= 0) {
      return; }

    const bindings = keybindings()
      .filter(isKeybindingContribution)
      .map((entry) => this.createKeybinding(entry))
      .filter((e): e is ExtensionKeybinding => e !== undefined)
      .map((binding) => [binding.key, binding] as const)
      .reverse();
    this.bindings = [...new Map(bindings).values()];

    KeybindingsService.instance = this;
  }

  private createKeybinding(
    contribution: KeybindingContribution
  ): ExtensionKeybinding | undefined {
    if (typeof contribution.command !== "string") {
      return undefined; }

    const key = contribution[platformKey()] ?? contribution.key;

    if (typeof key !== "string" || key.length === 0) {
      return undefined; }

    return {
      command: contribution.command,
      key: key
    };
  }

  public initialized() { 
    return KeybindingsService.instance !== undefined;
  }

  public getFor(command: string): readonly ExtensionKeybinding[] {
    return this.keybindings.filter((keybinding) =>
      keybinding.command === command
    );
  }

  public async showMessage(
    context: vscode.ExtensionContext
  ): Promise<void> {
    const bindings = this.keybindings
      .map(({ command, key }) => {
        const commandName = command
          .slice(command.lastIndexOf(".") + 1)
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase());

        return `${commandName}: ${key}`;
      }).join("\n");

    const showAll = "Show all";
    const answer = await vscode.window.showWarningMessage(
      `Extension keybindings:\n\n${bindings}`,
      { modal: true },
      showAll
    );

    if (answer === showAll) {
      await vscode.commands.executeCommand(
        brand.workbench.action.openGlobalKeybindings,
        byId(context?.extension?.id)
      );
    }
  }
}
