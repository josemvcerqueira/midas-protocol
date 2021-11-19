// eslint-disable-next-line node/no-unpublished-import
import { ethers } from 'hardhat';

export const deploy = async (
  x: ReadonlyArray<string>,
  y: Array<Array<unknown> | undefined>
): Promise<any> => {
  const contractFactories = await Promise.all(
    x.map((name) => ethers.getContractFactory(name))
  );

  return Promise.all(
    contractFactories.map((factory, index) =>
      factory.deploy(...(y[index] || []))
    )
  );
};
