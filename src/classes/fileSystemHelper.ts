import { FileSystemError as Errors } from 'vscode';
import { ExtensionBrandResolver } from "./extensionBrandResolver";
import { LogService } from "./logService";
import { basename } from "./utilManager";

const postfix = "hard_lock" as const;

const configuration = () => ExtensionBrandResolver.configuration;
const number4Property = () => ExtensionBrandResolver.number4Property;
const cooldown = () => {
  const  config = vscode.workspace.getConfiguration(configuration());
  return config.get<number>(number4Property(), 4);
};

type FileProperties = [string, vscode.FileType];

let boosted: boolean = false;

const applyEdit = async (
  edit: vscode.WorkspaceEdit,
  fallback: () => Thenable<void>,
  timeout: number = 450
): Promise<boolean> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const status = { good: "succeeded", bad: "failed" } as const;
  const operationPromise = (
    async () => await vscode.workspace.applyEdit(edit)
  )();
  const timeoutPromise = new Promise<boolean>((resolve) => {
    timeoutId = setTimeout(() => resolve(false), timeout);
  });
  const success = await Promise.race([
    operationPromise.catch(() => false),
    timeoutPromise
  ]);
  if (timeoutId) { clearTimeout(timeoutId); }
  if (success) { return true; }

  return vscode.window.withProgress( {
      location: vscode.ProgressLocation.Notification,
      title: "The file operation is hanging.",
      cancellable: false },
    async (progress) => {
      const ok = "Try";
      const answerPromise = vscode.window.showWarningMessage(
        "Won't you try to force it using a low-level variant?",
        ok, "Cancel");
      const choice = await Promise.race([
        answerPromise,
        operationPromise
          .then((result) => (result ? status.good : status.bad))
          .catch(() => status.bad)
      ]);
      let operationSucceed = false;

      if (choice === status.good) {
        vscode.commands.executeCommand("notifications.hideToasts");
        operationSucceed = true; }
      else if (choice === ok) {
        let fallbackId: ReturnType<typeof setTimeout> | undefined;
        progress.report({ increment: 0 });

        const stepIncrement = 100 / cooldown();
        const progressInterval = setInterval(() => {
          progress.report({ increment: stepIncrement }); }, 1000);
        const cooldownPromise = new Promise<boolean>((res) => {
          fallbackId = setTimeout(() => res(false), cooldown() * 1000);
        });
        const fallbackPromise = (async () => {
          try { await fallback();
            return true; }
          catch (error) {
            LogService.error(error);

            return (error as any)?.code === Errors.FileExists
                || (error as any)?.code === Errors.FileNotFound;
          }
        })();
        operationSucceed = await Promise.race([
          fallbackPromise,
          cooldownPromise
        ]);
        clearInterval(progressInterval);

        if (fallbackId) { clearTimeout(fallbackId); } }
      else {
        operationSucceed = false;
        vscode.commands.executeCommand("notifications.hideToasts");
      }

      if (operationSucceed) {
        progress.report({ message: "Operation completed" });
        await new Promise((resolve) => setTimeout(resolve, 1000)); }
      else {
        vscode.window.showErrorMessage(
          `Operation can't be completed: ${fallback.name}`);
      }
      return operationSucceed;
    }
  );
};

export const workspace = {
  fsh: {
    async copy(
      source: vscode.Uri,
      target: vscode.Uri,
      options?: { useTrash?: boolean | undefined; }
    ): Promise<void> {
      const filename = basename(target);
      const parent = vscode.Uri.joinPath(source, '..');
      const retarget = vscode.Uri.joinPath(parent,
        `${filename}_${postfix}`
      );
      await vscode.workspace.fs.copy(source, retarget,
        { overwrite: false });
      await vscode.workspace.fs.delete(source,
        { recursive: true, useTrash: options?.useTrash });
      await vscode.workspace.fs.rename(retarget, target,
        { overwrite: true });
    }
  },
  fs: {
    async copy(
      source: vscode.Uri,
      target: vscode.Uri,
      options?: { overwrite?: boolean; }
    ): Promise<void> {
      return vscode.workspace.fs.copy(source, target, options);
    },

    async rename(
      source: vscode.Uri,
      target: vscode.Uri,
      options?: { overwrite?: boolean; }
    ): Promise<void> {
      const rename = async () => vscode.workspace.fs.rename(
        source, target, { overwrite: options?.overwrite });
      if (boosted) {
        return rename(); }
      else {
        const edit = new vscode.WorkspaceEdit();
        edit.renameFile(source, target,
          { overwrite: options?.overwrite });
        
        await applyEdit(edit, rename);
      }
    },

    async createFile(uri: vscode.Uri): Promise<void> {
      const fileCreate = async () => vscode.workspace.fs.writeFile(uri,
        new Uint8Array());
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(uri, { ignoreIfExists: true });

      await applyEdit(edit, fileCreate);
    },

    async createDirectory(uri: vscode.Uri): Promise<void> {
      return vscode.workspace.fs.createDirectory(uri);
    },

    async readDirectory(uri: vscode.Uri): Promise<FileProperties[]> {
      return vscode.workspace.fs.readDirectory(uri);
    },

    async readFile(uri: vscode.Uri): Promise<Buffer<ArrayBuffer> > {
      const content = await vscode.workspace.fs.readFile(uri);

      return Buffer.from(content);
    },

    async delete(uri: vscode.Uri, options?: {
      recursive?: boolean;
      useTrash?: boolean; 
    }): Promise<void> {
      const fileDelete = async () => vscode.workspace.fs.delete(uri,
        { recursive: options?.recursive, useTrash: false });
      if (options?.useTrash && !boosted) {
        const edit = new vscode.WorkspaceEdit();
        edit.deleteFile(uri, { recursive: options?.recursive });

        await applyEdit(edit, fileDelete); }
      else {
        return fileDelete();
      }
    }
  }
};

export const ascertainBoost = (onAmount: number) => {
  boosted = onAmount > 50;
};

export const rejectBoost = () => {
  boosted = false;
};
