// eslint-disable-next-line node/no-unpublished-import
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
// eslint-disable-next-line node/no-unpublished-import
import { ethers } from 'hardhat';

export const deploy = async (
  x: ReadonlyArray<string>,
  y: Array<Array<unknown> | undefined>,
  z: ReadonlyArray<SignerWithAddress> = []
): Promise<any> => {
  const contractFactories = await Promise.all(
    x.map((name, index) => ethers.getContractFactory(name, z[index]))
  );

  return Promise.all(
    contractFactories.map((factory, index) =>
      factory.deploy(...(y[index] || []))
    )
  );
};
