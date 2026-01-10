import * as vscode from "vscode";
import { Location } from "vscode";
import { FileItem } from "./fileItem";
import { CommandRegistrator } from "./commandRegistrator";
import {
  setNothingToExcludeTemporary,
  showProgressBar,
  showQuickInput
} from "./fileItemManager";
import fpath = require("path");

const EXCLUDES = [
  "jar",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "ico",
  "webp",
  "html",
  "pdf",
  "exe",
  "dll",
  "zip",
  "tar",
  "gz",
  "mp3",
  "mp4",
  "vsix"
];
const ignoreDefaultFileName = ".gitignore";

type TextDocumentOr = vscode.TextDocument | undefined;

export async function getPositionSafelyFrom(file: vscode.Uri): Promise<vscode.Position> {
  const doc = await openTextDocument(file);

  if (!doc) { return new vscode.Position(0, 1); }
  
  for (let i = 0; i < doc.lineCount; i++) {
    const line = doc.lineAt(i);
    if (!line.isEmptyOrWhitespace) {
      return new vscode.Position(i, line.firstNonWhitespaceCharacterIndex);
    }
  }
  return new vscode.Position(1, 0);
}

async function openTextDocument(item: FileItem): Promise<string>;
async function openTextDocument(resourceUri: vscode.Uri): Promise<TextDocumentOr>;
async function openTextDocument(doc: vscode.Uri | FileItem)
: Promise<TextDocumentOr | string> {
  if (doc instanceof FileItem) {
    if (!doc.resourceUri) { return ""; }
    try {
      return (await vscode.workspace.openTextDocument(doc.resourceUri)).getText();
    } catch (error) {
      await vscode.window.showWarningMessage(String(error ?? `Failed to open file: ${doc}`));
      return "";
    }
  } else {
    try {
      return await vscode.workspace.openTextDocument(doc);
    } catch (error) {
      await vscode.window.showWarningMessage(String(error ?? `Failed to open file: ${doc}`));
      return undefined;
    }
  }
}

export class FoldersReferenceProvider implements vscode.ReferenceProvider {
  private readonly patternSeparator = ',*.';
  private gitignore: vscode.Uri | undefined;

  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): Promise<Location[]> {
    const registrator = new CommandRegistrator();
    const item = await registrator.getAnySelectedIfBad();
    return await this.provideReferencesFor(item, token);
  }

  async provideReferencesFor(
    fileItem: FileItem,
    token?: vscode.CancellationToken
  ): Promise<Location[]> {
    const currentItem = fileItem;
    const progressBar = showProgressBar("Searching references");
    const entireSearch = await this.findTextInFiles(currentItem, undefined, token);
    const classSearch = await this.findTextInFiles(currentItem, "class", token);
    entireSearch.push(...classSearch);
    progressBar.cancel();
    progressBar.dispose();
    
    return entireSearch;
  }

  private stripComments(source: string): string {
    /// (//.*$) : Matches single line comments starting with // until the end of the line.
    /// (| : OR
    /// (/\*[\s\S]*?\*/) : Matches multiline comments starting with /* and ending with */.
    /// | : OR
    /// (\s*\#.*$) : Matches python/hash comments if they start a line
    /// (optional based on your request).
    const commentRegex = /(\/\/.*$)|(\/\*[\s\S]*?\*\/)|(\s*\#.*$)/gm;

    return source.replace(commentRegex, ' ');
  }

  private createSearchMatchFromPattern(
    pattern: string,
    whereToSearch: string
  ): RegExpMatchArray | null {
    function escapeRegExp(source: string): string {
      return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    const cleanWhereToSearch = this.stripComments(whereToSearch);
    const mask = `${escapeRegExp(pattern)}\\b\\s*([A-Za-z0-9_$-]+)(?=[\\s<{(]|$)`;
    const criteria = new RegExp(mask, "u");

    return cleanWhereToSearch.match(criteria);
  }

  private async findTextInFiles(
    fileItem: FileItem,
    pattern?: string,
    token?: vscode.CancellationToken
  ): Promise<Location[]> {
    if (!fileItem.resourceUri) { return []; }

    const maskDoc = await openTextDocument(fileItem);

    if (maskDoc === "") { return []; }
    
    const mask = pattern
      ? this.createSearchMatchFromPattern(pattern, maskDoc)
      : null;
    const searchText = mask ? mask[1] : undefined;
    const searchPattern = 
      searchText ?? fpath.parse(fileItem.resourceUri.fsPath).name;
    const locations: Location[] = [];
    const gitignore = await this.readIgnoreFile({ showDialog: false });
    const antipatternList = await this.createAntipattern(gitignore);
    const antipattern = antipatternList.length > 0 ?
      antipatternList.join(',') : "";
    const exclude = EXCLUDES.join(this.patternSeparator);
    const restoreSetting = await setNothingToExcludeTemporary();
    const uris = await vscode.workspace.findFiles(
      "**/*.*",
      `**/\{${antipattern}${this.patternSeparator}${exclude},.**\}`
    );
    await restoreSetting();
    
    for (const uri of uris) {
      if (token?.isCancellationRequested) { break; }

      const doc = await openTextDocument(uri);
      
      if (!doc || token?.isCancellationRequested) { break; }

      const text = doc.getText();
      const regex = new RegExp(`(?:^|[^A-Za-z])(${searchPattern})(?:$|[^A-Za-z])`, "g");
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const start = doc.positionAt(match.index);
        const end = doc.positionAt(match.index + match[0].length);
        locations.push(new Location(uri, new vscode.Range(start, end)));
      }
    }
    return locations;
  }

  private skipEmptyOrNegationAndLineIsComment(line: string): boolean {
    return line.trim() !== '' && !line.startsWith('!') && !line.startsWith('#'); 
  }
  
  private async createAntipattern(gitignore: vscode.Uri | undefined): Promise<string[]> {
    return gitignore ? ((await openTextDocument(gitignore))
      ?.getText() ?? "")
      .split(/[\r\n]+/)
      .filter(line => this.skipEmptyOrNegationAndLineIsComment(line))
      .map(str => {
        if (str.startsWith('/')) { str = str.slice(1); }
        return str.endsWith("/") ? `${str}**` : str;
      }) : [];
  }

  private patternToRegex(pattern: string): [boolean, RegExp] {
    /// escape regex specials except glob chars
    let regexStr = pattern.replace(/([.+^${}()|[\]\\])/g, '\\$&');
    /// protect double-star, then translate single-star and question
    const DSTAR = '\u0000'; /// safe temporary token
    regexStr = regexStr
      .replace(/\*\*/g, DSTAR)               /// protect **
      .replace(/\*/g, '[^/]*')               /// * -> any chars except slash
      .replace(/\?/g, '[^/]')                /// ? -> single char except slash
      .replace(new RegExp(DSTAR, 'g'), '.*') /// restore ** -> .*
      .replace(/\//g, '/');                  /// keep slash literal
    /// anchor from root if pattern starts with '/'
    if (pattern.startsWith('/')) {
      regexStr = '^' + regexStr.slice(1); /// drop leading slash from pattern
    } else {
      regexStr = '(^|.*/)' + regexStr;
    }
    let isFileRule: boolean;
    /// treat both "folder/" and "folder/**" as directory rules
    if (pattern.endsWith('/') || pattern.endsWith('/**')) {
      /// if pattern ended with '/**' we already translated it to '/.*'
      /// remove any trailing '/.*' so we can append a single '(\/.*)?$'
      regexStr = regexStr.replace(/\/\.\*$/, '');
      regexStr += '(\/.*)?$'; /// match folder itself and everything under it
      isFileRule = false;
    } else {
      regexStr += '$';
      isFileRule = true;
    }
    return [isFileRule, new RegExp(regexStr, 'i')];
  }

  async createRegexFrom(file: vscode.Uri | undefined): Promise<[boolean, RegExp][]> {
    const antipatternList = await this.createAntipattern(file);
    const ignoreRegexes = antipatternList.map(this.patternToRegex);
    return ignoreRegexes;
  }
  
  async readIgnoreFile(can: { showDialog: boolean }): Promise<vscode.Uri | undefined>
  {
    const plannedToAsk = can.showDialog || !this.gitignore;
    const ignorePattern: string = plannedToAsk ?
      await showQuickInput(
        "What file should be used as ignore list?",
        ignoreDefaultFileName
      ) ?? ""
    : ignoreDefaultFileName;
    if (plannedToAsk) {
      const restoreSetting = await setNothingToExcludeTemporary();
      const ignoreFiles = await vscode.workspace.findFiles(ignorePattern);
      this.gitignore = ignoreFiles.length > 0 ? ignoreFiles[0] : this.gitignore;
      await restoreSetting();
    }
    return this.gitignore;
  }
}
