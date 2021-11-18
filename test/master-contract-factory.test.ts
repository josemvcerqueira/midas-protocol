import { expect } from 'chai';
import { ethers } from 'hardhat';
import { MockMasterContract, MasterContractFactory } from '../typechain';
import MasterContractFactoryJson from '../artifacts/contracts/MasterContractFactory.sol/MasterContractFactory.json';

describe('MasterContractFactory', () => {
  let mockMasterContract: MockMasterContract;
  let masterContractFactory: MasterContractFactory;

  const NAME = 'MockMasterContract';
  const SYMBOL = 'MC';

  const data = ethers.utils.defaultAbiCoder.encode(
    ['string', 'string'],
    [NAME, SYMBOL]
  );

  beforeEach(async () => {
    const [MockMCFactory, MCFFactory] = await Promise.all([
      ethers.getContractFactory('MockMasterContract'),
      ethers.getContractFactory('MasterContractFactory'),
    ]);

    const [_mockMasterContract, _masterContractFactory] = await Promise.all([
      MockMCFactory.deploy(),
      MCFFactory.deploy(),
    ]);

    mockMasterContract = _mockMasterContract;
    masterContractFactory = _masterContractFactory;

    await Promise.all([
      mockMasterContract.deployed(),
      masterContractFactory.deployed(),
    ]);
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

      const masterContractInterface = new ethers.utils.Interface(
        MasterContractFactoryJson.abi
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
