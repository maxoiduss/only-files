import * as manager from "./fileItemManager";
import { Location } from "vscode";
import { FileItem } from "./fileItem";
import { CommandRegistrator } from "./commandRegistrator";
import {
  getNicePath, setNothingToExcludeTemporary, showProgressBar, showQuickInput
} from "./utilManager";

const empty = '' as const;
const ignoreDefaultFileName = ".gitignore" as const;
const gitignoreResetDelay = 60000 as const;

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
  "vsix"         ] as const;

type UriOr = vscode.Uri | undefined;
type TextDocumentOr = vscode.TextDocument | undefined;

const isNotEmptyOrNull = (value: string | undefined): boolean => {
  return value !== undefined && value.trim() !== empty;
};

export const getPositionSafelyFrom = async (
  file: vscode.Uri
): Promise<vscode.Position> => {
  const doc = await openTextDocument(file);

  if (!doc) { return new vscode.Position(0, 1); }
  
  for (let i = 0; i < doc.lineCount; i++) {
    const line = doc.lineAt(i);
    if (!line.isEmptyOrWhitespace) {
      return new vscode.Position(i, line.firstNonWhitespaceCharacterIndex);
    }
  }
  return new vscode.Position(1, 0);
};

async function openTextDocument(item: FileItem): Promise<string>;
async function openTextDocument(resourceUri: vscode.Uri): Promise<TextDocumentOr>;
async function openTextDocument(doc: vscode.Uri | FileItem)
: Promise<TextDocumentOr | string> {
  if (doc instanceof FileItem) {
    if (!doc.resourceUri) { return empty; }

    try {
      return (
        await vscode.workspace.openTextDocument(doc.resourceUri)
      ).getText(); }
    catch (error) {
      await vscode.window.showWarningMessage(
        String(error ?? `Failed to open file: ${doc}`));

      return empty;
    } }
  else {
    try {
      return await vscode.workspace.openTextDocument(doc); }
    catch (error) {
      await vscode.window.showWarningMessage(
        String(error ?? `Failed to open file: ${doc}`));

      return undefined;
    }
  }
}

export class FoldersReferenceProvider implements
  vscode.ReferenceProvider,
  vscode.Disposable
{
  private readonly patternSeparator = ',*.';

  private gitignoreResetTimer: ReturnType<typeof setTimeout> | undefined;
  private gitignoreName: string | undefined;
  private gitignore: UriOr;

  private resetGitignoreTimer(): void {
    if (this.gitignoreResetTimer) {
      clearTimeout(this.gitignoreResetTimer);
    }
    this.gitignoreResetTimer = setTimeout(() => {
      this.gitignore = undefined;
      this.gitignoreResetTimer = undefined;
    }, gitignoreResetDelay);
  }

  async provideReferences(
    _document: vscode.TextDocument,
    _position: vscode.Position,
    _context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): Promise<Location[]> {
    const registrator = new CommandRegistrator();
    const item = await registrator.getAnySelectedIfBad();

    return await this.provideReferencesFor(item, token);
  }

  public async provideReferencesFor(
    fileItem: FileItem,
    token?: vscode.CancellationToken
  ): Promise<Location[]> {
    const currentItem = fileItem;
    const progressBar = showProgressBar("Searching references");
    const entreSearch = await this.findTextInFiles(currentItem, undefined,token);
    const classSearch = await this.findTextInFiles(currentItem, "class",  token);
    const strctSearch = await this.findTextInFiles(currentItem, "struct", token);
    entreSearch.push(...classSearch, ...strctSearch);
    progressBar.cancel();
    progressBar.dispose();

    this.gitignoreName = undefined;
    
    return entreSearch;
  }

  private stripComments(source: string): string {
    ///  (//.*$) : Matches single line comments starting
    ///  with // until the end of the line.
    ///  (| : OR
    ///  (/\*[\s\S]*?\*/) : Matches multiline comments starting 
    ///  with /* and ending with */.
    ///  | : OR
    ///  (\s*\#.*$) : Matches python/hash comments if they start a line
    ///  (optional based on your request).
    const commentRegex = /(\/\/.*$)|(\/\*[\s\S]*?\*\/)|(\s*\#.*$)/gm;

    return source.replace(commentRegex, ' ');
  }

  private createSearchMatchFromPattern(
    pattern: string,
    whereToSearch: string
  ): RegExpMatchArray | null {
    const escapeRegExp = (source: string): string => {
      return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };
    const cleanWhereToSearch = this.stripComments(whereToSearch);
    const mask = `${escapeRegExp(pattern)}\\b\\s*([A-Za-z0-9_$-]+)(?=[\\s<{(]|$)`;
    const criteria = new RegExp(mask, 'u');

    return cleanWhereToSearch.match(criteria);
  }

  private async findTextInFiles(
    fileItem: FileItem,
    pattern?: string,
    token?: vscode.CancellationToken
  ): Promise<Location[]> {
    if (!fileItem.resourceUri) { return []; }

    const maskDoc = await openTextDocument(fileItem);
    if (maskDoc === empty) { return []; }
    
    const mask = pattern ?
      this.createSearchMatchFromPattern(pattern, maskDoc) : null;
    const searchText = mask ? mask[1] : undefined;
    const searchPattern = searchText ?? await manager.getNameWithoutExt(fileItem);
    const locations: Location[] = [];
    const gitignore = await this.readIgnoreFile({ showDialog: false });
    const antipatternList = await this.createAntipattern(gitignore);
    const antipattern = antipatternList.length > 0 ?
      antipatternList.join(',') : empty;
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
      const regex = new RegExp(
        `(?:^|[^A-Za-z])(${searchPattern})(?:$|[^A-Za-z])`, 'g'
      );
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
    return line.trim() !== empty && !line.startsWith('!')&& !line.startsWith('#'); 
  }
  
  private async createAntipattern(gitignore: UriOr): Promise<string[]> {
    return gitignore ? ((await openTextDocument(gitignore))
      ?.getText() ?? empty)
      .split(/[\r\n]+/)
      .filter((line) => this.skipEmptyOrNegationAndLineIsComment(line))
      .map((str) => {
        if (str.startsWith('/')) { str = str.slice(1); }
        return str.endsWith('/') ? `${str}**` : str;
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
      regexStr = regexStr.replace(/\/\.\*$/, empty);
      regexStr += '(\/.*)?$'; /// match folder itself and everything under it
      isFileRule = false;
    } else {
      regexStr += '$';
      isFileRule = true;
    }
    return [isFileRule, new RegExp(regexStr, 'i')];
  }

  dispose() { clearTimeout(this.gitignoreResetTimer); }

  public async createRegexFrom(file: UriOr): Promise<[boolean, RegExp][]> {
    const antipatternList = await this.createAntipattern(file);
    const ignoreRegexes = antipatternList.map(this.patternToRegex);
    
    return ignoreRegexes;
  }
  
  public async readIgnoreFile(can: { showDialog: boolean }): Promise<UriOr> {
    this.resetGitignoreTimer();

    const plannedToAsk = can.showDialog || !this.gitignoreName;

    this.gitignoreName = plannedToAsk ?
      await showQuickInput("What file should be used as ignore list?",
        ignoreDefaultFileName)
    : this.gitignoreName;

    if (plannedToAsk && isNotEmptyOrNull(this.gitignoreName)) {
      const restoreSetting = await setNothingToExcludeTemporary();
      const ignoreFiles = await vscode.workspace.findFiles(this.gitignoreName!);
      
      if (ignoreFiles.length > 1) {
        const map = new Map(ignoreFiles.map((file) => [getNicePath(file), file]));
        const file = await vscode.window.showQuickPick([...map.keys()], {
          placeHolder: "The 1-st will be used otherwise..", title: "Which one?"
        });
        this.gitignore = file ? map.get(file) : ignoreFiles[0]; }
      else {
        this.gitignore = ignoreFiles.length > 0 ? ignoreFiles[0] : this.gitignore;
      }
      await restoreSetting(); }
    else if (this.gitignoreName === empty) {
      this.gitignore = undefined;
    }
    return this.gitignore;
  }
}
