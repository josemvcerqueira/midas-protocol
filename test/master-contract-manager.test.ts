// eslint-disable-next-line node/no-extraneous-import
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { PRIVATE_KEYS } from '../lib/constants';
import {
  deploy,
  getMidasKingdomDomainSeparator,
  setMasterContractApproval,
} from '../lib/test-utils';
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
    const chainId = await bob.getChainId();
    expect(await masterContractManager.DOMAIN_SEPARATOR()).to.be.equal(
      getMidasKingdomDomainSeparator(masterContractManager.address, chainId)
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
          bob,
          alice,
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
      )
        .to.emit(masterContractManager, 'LogSetMasterContractApproval')
        .withArgs(mockMasterContract.address, bob.address, true);
      expect(
        await masterContractManager.masterContractApprovals(
          mockMasterContract.address,
          bob.address
        )
      ).to.be.equal(true);
    });

    it('WITHOUT PERMIT: correctly sets the approval to true masterContract -> User -> False', async () => {
      await masterContractManager
        .connect(bob)
        .whitelistMasterContract(mockMasterContract.address, true);

      await expect(
        setMasterContractApproval(
          masterContractManager,
          bob,
          bob,
          PRIVATE_KEYS[0],
          mockMasterContract.address,
          true
        )
      )
        .to.emit(masterContractManager, 'LogSetMasterContractApproval')
        .withArgs(mockMasterContract.address, bob.address, true);
      expect(
        await masterContractManager.masterContractApprovals(
          mockMasterContract.address,
          bob.address
        )
      ).to.be.equal(true);

      await expect(
        setMasterContractApproval(
          masterContractManager,
          bob,
          bob,
          PRIVATE_KEYS[0],
          mockMasterContract.address,
          false
        )
      )
        .to.emit(masterContractManager, 'LogSetMasterContractApproval')
        .withArgs(mockMasterContract.address, bob.address, false);
      expect(
        await masterContractManager.masterContractApprovals(
          mockMasterContract.address,
          bob.address
        )
      ).to.be.equal(false);
    });
    it('WITH PERMIT: triggers the permit logic if v r and s are not all 0', async () => {
      // @dev we will trigger the "MCM: user cannot be ZERO ADDRESS" on user to verify that we are in the else block of the permit logic
      await expect(
        masterContractManager.connect(bob).setMasterContractApproval(
          ethers.constants.AddressZero,
          mockMasterContract.address,
          true,
          0,
          // @dev random bytes32 for testing purpose
          '0x58d8540ec7c0578c9c0d6f3c24f12b521bb197931188ae2fed29af10dd07499e',
          // @dev random bytes32 for testing purpose
          '0x4bd2e093d0148f62567af463fa4e92e67c1bfc4b2b1d5f67f46ec6b3c38a0cda'
        )
        // @dev this error is only triggered under the with permit logic block
      ).to.revertedWith('MCM: user cannot be ZERO ADDRESS');
      await expect(
        masterContractManager.connect(bob).setMasterContractApproval(
          ethers.constants.AddressZero,
          mockMasterContract.address,
          true,
          2,
          '0x0000000000000000000000000000000000000000000000000000000000000000',
          // @dev random bytes32 for testing purpose
          '0x4bd2e093d0148f62567af463fa4e92e67c1bfc4b2b1d5f67f46ec6b3c38a0cda'
        )
        // @dev this error is only triggered under the with permit logic block
      ).to.revertedWith('MCM: user cannot be ZERO ADDRESS');
      await expect(
        masterContractManager.connect(bob).setMasterContractApproval(
          ethers.constants.AddressZero,
          mockMasterContract.address,
          true,
          2,
          // @dev random bytes32 for testing purpose
          '0x4bd2e093d0148f62567af463fa4e92e67c1bfc4b2b1d5f67f46ec6b3c38a0cda',
          '0x0000000000000000000000000000000000000000000000000000000000000000'
        )
        // @dev this error is only triggered under the with permit logic block
      ).to.revertedWith('MCM: user cannot be ZERO ADDRESS');
      await expect(
        masterContractManager.connect(bob).setMasterContractApproval(
          ethers.constants.AddressZero,
          mockMasterContract.address,
          true,
          0,
          // @dev random bytes32 for testing purpose
          '0x0000000000000000000000000000000000000000000000000000000000000000',
          '0x0000000000000000000000000000000000000000000000000000000000000000'
        )
        // @dev this error is only triggered under the without permit logic block
      ).to.revertedWith('MCM: user must be the sender');
    });
    it('WITH  PERMIT: it will revert if the user is the ADDRESS ZERO', async () => {
      await expect(
        masterContractManager
          .connect(bob)
          .setMasterContractApproval(
            ethers.constants.AddressZero,
            mockMasterContract.address,
            true,
            2,
            '0x58d8540ec7c0578c9c0d6f3c24f12b521bb197931188ae2fed29af10dd07499e',
            '0x4bd2e093d0148f62567af463fa4e92e67c1bfc4b2b1d5f67f46ec6b3c38a0cda'
          )
        // @dev this error is only triggered under the with permit logic block
      ).to.revertedWith('MCM: user cannot be ZERO ADDRESS');
    });
    it('WITH PERMIT: it will reverse if the ECDSA recovered public address does not match the user', async () => {
      await expect(
        setMasterContractApproval(
          masterContractManager,
          bob,
          // @dev user is alice but the private key is from BOB so V R S will recover the wrong key public key
          alice,
          PRIVATE_KEYS[0],
          mockMasterContract.address,
          true,
          true
        )
      ).to.revertedWith('MCM: invalid user signature');
    });
    it('WITH PERMIT: updates states properly if ECDSA recovers the correct public address', async () => {
      expect(
        await masterContractManager.masterContractApprovals(
          mockMasterContract.address,
          alice.address
        )
      ).to.be.equal(false);
      expect(await masterContractManager.nonces(alice.address)).to.equal(
        ethers.BigNumber.from(0)
      );
      await expect(
        setMasterContractApproval(
          masterContractManager,
          bob,
          alice,
          PRIVATE_KEYS[1],
          mockMasterContract.address,
          true,
          true
        )
      )
        .to.emit(masterContractManager, 'LogSetMasterContractApproval')
        .withArgs(mockMasterContract.address, alice.address, true);

      // @dev import security measure
      expect(await masterContractManager.nonces(alice.address)).to.equal(
        ethers.BigNumber.from(1)
      );

      expect(
        await masterContractManager.masterContractApprovals(
          mockMasterContract.address,
          alice.address
        )
      ).to.be.equal(true);

      await expect(
        setMasterContractApproval(
          masterContractManager,
          bob,
          alice,
          PRIVATE_KEYS[1],
          mockMasterContract.address,
          false,
          true
        )
      )
        .to.emit(masterContractManager, 'LogSetMasterContractApproval')
        .withArgs(mockMasterContract.address, alice.address, false);

      expect(await masterContractManager.nonces(alice.address)).to.equal(
        ethers.BigNumber.from(2)
      );
      expect(
        await masterContractManager.masterContractApprovals(
          mockMasterContract.address,
          alice.address
        )
      ).to.be.equal(false);
    });
  });
  describe('function whitelistMasterContract', () => {
    it('reverts if the owner is not the caller', async () => {
      // @dev bob is the owner of the manager and masterContract
      await expect(
        masterContractManager
          .connect(alice)
          .whitelistMasterContract(mockMasterContract.address, true)
      ).to.revertedWith('Ownable: caller is not the owner');
    });
    it('reverts if the master contract is the ZERO ADDRESS', async () => {
      await expect(
        masterContractManager.whitelistMasterContract(
          ethers.constants.AddressZero,
          true
        )
      ).to.revertedWith('MCM: cannot be ZERO Address');
    });
    it('whitelists and blacklists a masterContract properly', async () => {
      expect(
        await masterContractManager.whitelistedMasterContracts(
          mockMasterContract.address
        )
      ).to.be.equal(false);
      await expect(
        masterContractManager.whitelistMasterContract(
          mockMasterContract.address,
          true
        )
      )
        .to.emit(masterContractManager, 'LogWhitelistMasterContract')
        .withArgs(mockMasterContract.address, true);
      expect(
        await masterContractManager.whitelistedMasterContracts(
          mockMasterContract.address
        )
      ).to.be.equal(true);
      await expect(
        masterContractManager.whitelistMasterContract(
          mockMasterContract.address,
          false
        )
      )
        .to.emit(masterContractManager, 'LogWhitelistMasterContract')
        .withArgs(mockMasterContract.address, false);
      expect(
        await masterContractManager.whitelistedMasterContracts(
          mockMasterContract.address
        )
      ).to.be.equal(false);
    });
  });
});
