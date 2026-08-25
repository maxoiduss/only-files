import sinon from 'sinon';
import { FileItem } from '../../classes/fileItem';
export * from '../../classes/fileItemManager';

export type UriOrString = vscode.Uri | string;

export const getChildrenNames = sinon.stub() as sinon.SinonStub<
  [FileItem | UriOrString | undefined],
  Promise<string[]>
>;