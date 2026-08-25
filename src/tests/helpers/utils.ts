import sinon from 'sinon';
export * from '../../classes/utilManager';

export const isValidUri = sinon.stub() as sinon.SinonStub<
  [vscode.Uri | undefined],
  Promise<boolean>
>;
