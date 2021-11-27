// eslint-disable-next-line node/no-extraneous-import
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { PRIVATE_KEYS } from '../lib/constants';
import { deploy, setMasterContractApproval } from '../lib/test-utils';
import { MasterContractManager, MockMasterContract } from '../typechain';

describe('MasterContractManager', () => {
  let mockMasterContract: MockMasterContract;
  let masterContractManager: MasterContractManager;
  let bob: SignerWithAddress;
  let alice: SignerWithAddress;

  beforeEach(async () => {
    [mockMasterContract, masterContractManager] = await deploy(
      ['MockMasterContract', 'MasterContractManager'],
      [],
      [bob, bob]
    );

    [bob, alice] = await ethers.getSigners();
  });

  it('registers protocols properly', async () => {
    expect(
      await masterContractManager.masterContractOf(mockMasterContract.address)
    ).to.be.equal(ethers.constants.AddressZero);
    await mockMasterContract.register(masterContractManager.address);
    expect(
      await masterContractManager.masterContractOf(mockMasterContract.address)
    ).to.equal(mockMasterContract.address);
  });

  it('returns the domain separator', async () => {
    expect(await masterContractManager.DOMAIN_SEPARATOR()).to.be.equal(
      '0xf49ec44fbd5fc76f0a21f8454107f2976a8a7fac884360a71cec8d924c1f4289'
    );
  });

  describe('function setMasterContractApproval', async () => {
    it('reverts if masterContract is the Zero address', async () => {
      await expect(
        setMasterContractApproval(
          masterContractManager,
          bob,
          bob,
          PRIVATE_KEYS[0],
          ethers.constants.AddressZero,
          true
        )
      ).to.revertedWith('MCM: cannot be ZERO ADDRESS');
    });

    it('WITHOUT PERMIT: reverts if user is not the sender', async () => {
      await expect(
        setMasterContractApproval(
          masterContractManager,
          alice,
          bob,
          PRIVATE_KEYS[0],
          mockMasterContract.address,
          true
        )
      ).to.revertedWith('MCM: user must be the sender');
    });

    it('WITHOUT PERMIT: reverts if user is a registered protocol', async () => {
      await masterContractManager.connect(bob).registerProtocol();
      await expect(
        setMasterContractApproval(
          masterContractManager,
          bob,
          bob,
          PRIVATE_KEYS[0],
          mockMasterContract.address,
          true
        )
      ).to.revertedWith('MCM: user must not be registered');
    });

    it('WITHOUT PERMIT: reverts if the masterContract is not whitelisted', async () => {
      await expect(
        setMasterContractApproval(
          masterContractManager,
          bob,
          bob,
          PRIVATE_KEYS[0],
          mockMasterContract.address,
          true
        )
      ).to.revertedWith('MCM: masterC not registered');
    });

    it('WITHOUT PERMIT: correctly sets the approval to true masterContract -> User -> True', async () => {
      await masterContractManager
        .connect(bob)
        .whitelistMasterContract(mockMasterContract.address, true);

      expect(
        await masterContractManager.masterContractApprovals(
          mockMasterContract.address,
          bob.address
        )
      ).to.be.equal(false);

      await expect(
        setMasterContractApproval(
          masterContractManager,
          bob,
          bob,
          PRIVATE_KEYS[0],
          mockMasterContract.address,
          true
        )
      ).to.emit(masterContractManager, 'LogSetMasterContractApproval');
      expect(
        await masterContractManager.masterContractApprovals(
          mockMasterContract.address,
          bob.address
        )
      ).to.be.equal(true);
    });
  });
});
