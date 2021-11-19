import { expect } from 'chai';
import { ethers } from 'hardhat';

import MasterContractFactoryJson from '../artifacts/contracts/MasterContractFactory.sol/MasterContractFactory.json';
import { deploy } from '../lib/test-utils';
import { MasterContractFactory, MockMasterContract } from '../typechain';

describe('MasterContractFactory', () => {
  let mockMasterContract: MockMasterContract;
  let masterContractFactory: MasterContractFactory;

  const NAME = 'MockMasterContract';
  const SYMBOL = 'MC';

  const data = ethers.utils.defaultAbiCoder.encode(
    ['string', 'string'],
    [NAME, SYMBOL]
  );

  const masterContractInterface = new ethers.utils.Interface(
    MasterContractFactoryJson.abi
  );

  beforeEach(async () => {
    const [_mockMasterContract, _masterContractFactory] = await deploy(
      ['MockMasterContract', 'MasterContractFactory'],
      []
    );

    mockMasterContract = _mockMasterContract;
    masterContractFactory = _masterContractFactory;
  });

  describe('function predictCloneAddress', () => {
    it('should correctly predict an address deterministically', async function () {
      const cloneAddressTX = await masterContractFactory.deterministicClone(
        mockMasterContract.address,
        data
      );

      const cloneAddressTXReceipt = await cloneAddressTX.wait();

      const predictedCloneAddress =
        await masterContractFactory.predictCloneAddress(
          mockMasterContract.address,
          ethers.utils.keccak256(data)
        );

      const log = masterContractInterface.parseLog(
        cloneAddressTXReceipt.logs[0]
      );

      const { clonedAddress } = log.args;

      expect(clonedAddress).to.be.equal(predictedCloneAddress);
    });
  });

  describe('function clone', () => {
    it('should deploy a clone of the master contract nondeterministically', async () => {
      expect(
        await masterContractFactory.clone(mockMasterContract.address, data)
      ).to.emit(masterContractFactory, 'CloneDeployed');
    });
    it('should nondeterministically deploy clones with the same data', async () => {
      await expect(
        await masterContractFactory.clone(mockMasterContract.address, data)
      ).to.emit(masterContractFactory, 'CloneDeployed');
      await expect(
        await masterContractFactory.clone(mockMasterContract.address, data)
      ).to.emit(masterContractFactory, 'CloneDeployed');
    });

    it('should update the state variable masterContractOf', async () => {
      const cloneAddressTXReceipt = await (
        await masterContractFactory.clone(mockMasterContract.address, data)
      ).wait();

      const log = masterContractInterface.parseLog(
        cloneAddressTXReceipt.logs[0]
      );

      const { clonedAddress } = log.args;

      expect(
        await masterContractFactory.masterContractOf(clonedAddress)
      ).to.be.equal(mockMasterContract.address);
    });

    it('should not nondeterministically clone a ZERO Address', async () => {
      await expect(
        masterContractFactory.clone(ethers.constants.AddressZero, data)
      ).to.be.revertedWith('MCF: Dead address');
    });
  });

  describe('function deterministicClone', () => {
    it('should deploy a clone of the master contract deterministically', async () => {
      await expect(
        await masterContractFactory.deterministicClone(
          mockMasterContract.address,
          data
        )
      ).to.emit(masterContractFactory, 'CloneDeployed');
    });

    it('should not deterministically deploy a clone twice with the same data', async () => {
      await expect(
        await masterContractFactory.deterministicClone(
          mockMasterContract.address,
          data
        )
      ).to.emit(masterContractFactory, 'CloneDeployed');
      await expect(
        masterContractFactory.deterministicClone(
          mockMasterContract.address,
          data
        )
      ).to.revertedWith('ERC1167: create2 failed');
    });

    it('should not deterministically deploy a clone twice with different data', async () => {
      await expect(
        await masterContractFactory.deterministicClone(
          mockMasterContract.address,
          data
        )
      ).to.emit(masterContractFactory, 'CloneDeployed');
      const data2 = ethers.utils.defaultAbiCoder.encode(
        ['string', 'string'],
        [NAME, 'PT2']
      );
      await expect(
        await masterContractFactory.deterministicClone(
          mockMasterContract.address,
          data2
        )
      ).to.emit(masterContractFactory, 'CloneDeployed');
    });

    it('should update the state variable masterContractOf', async () => {
      const cloneAddressTXReceipt = await (
        await masterContractFactory.deterministicClone(
          mockMasterContract.address,
          data
        )
      ).wait();

      const log = masterContractInterface.parseLog(
        cloneAddressTXReceipt.logs[0]
      );

      const { clonedAddress } = log.args;

      expect(
        await masterContractFactory.masterContractOf(clonedAddress)
      ).to.be.equal(mockMasterContract.address);
    });

    it('should not deterministically clone a ZERO Address', async () => {
      await expect(
        masterContractFactory.deterministicClone(
          ethers.constants.AddressZero,
          data
        )
      ).to.be.revertedWith('MCF: Dead address');
    });
  });
});
