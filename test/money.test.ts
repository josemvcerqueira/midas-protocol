import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { advanceTime, deploy, multiDeploy } from '../lib/test-utils';
import {
  MasterContractManager,
  MockMasterContract,
  MockMidasTreasury,
  Money,
  WETH9,
} from '../typechain';

// @notice we only need to test the functions `mint` and `mintToMidas` because everything else is already tested by open-zeppelin
describe('Money', () => {
  let mockMidasTreasury: MockMidasTreasury;
  let money: Money;
  let mockMasterContract: MockMasterContract;
  let WETH: WETH9;
  let masterContractManager: MasterContractManager;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  // @notice we do not need the full set up for midas treasury because we are testing a deposit with ERC20
  beforeEach(async () => {
    [[owner, alice], [money, mockMasterContract, WETH, masterContractManager]] =
      await Promise.all([
        ethers.getSigners(),
        multiDeploy(
          ['Money', 'MockMasterContract', 'WETH9', 'MasterContractManager'],
          [[], [], [], []]
        ),
      ]);

    mockMidasTreasury = await deploy('MockMidasTreasury', [
      WETH.address,
      masterContractManager.address,
    ]);
  });
  describe('function: mint', () => {
    it('reverts if it is not called by the owner', async () => {
      await expect(
        money.connect(alice).mint(alice.address, 10_000)
      ).to.revertedWith('Ownable: caller is not the owner');
    });
    it('cannot mint to the zero address', async () => {
      await expect(
        money.connect(owner).mint(ethers.constants.AddressZero, 1000)
      ).to.revertedWith('MNY: no mint to zero address');
    });
    it('reverts if you mint more than 15% in 24 hours', async () => {
      // @notice
      await money.connect(owner).mint(owner.address, 1000);

      await expect(money.connect(owner).mint(owner.address, 1)).to.revertedWith(
        'MNY: cannot mint this much'
      );

      // @notice ~1 day in milliseconds
      await advanceTime(8.7e7, ethers);

      // @notice now we should be able to mint 15% in 24 hours

      await expect(
        money.connect(owner).mint(owner.address, 50)
      ).to.not.revertedWith('MNY: cannot mint this much');
      await expect(
        money.connect(owner).mint(owner.address, 50)
      ).to.not.revertedWith('MNY: cannot mint this much');
      // @notice should fail as 200 >= 1000 * 0.15
      await expect(
        money.connect(owner).mint(owner.address, 100)
      ).to.revertedWith('MNY: cannot mint this much');
    });
    it('should mint and update the state correctly', async () => {
      expect(await money.balanceOf(owner.address)).to.be.equal(0);

      const lastMinting1 = await money.lastMint();

      expect(lastMinting1.time).to.be.equal(0);
      expect(lastMinting1.amount).to.be.equal(0);

      await expect(money.connect(owner).mint(owner.address, 1000))
        .to.emit(money, 'Transfer')
        .withArgs(ethers.constants.AddressZero, owner.address, 1000);

      const timestamp = (
        await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
      ).timestamp;

      const lastMinting2 = await money.lastMint();

      expect(lastMinting2.time).to.be.equal(timestamp);
      expect(lastMinting2.amount).to.be.equal(1000);
      expect(await money.balanceOf(owner.address)).to.be.equal(1000);
    });
  });
  describe('function: midasMintTo', () => {
    it('reverts if it is not called by the owner', async () => {
      await expect(
        money
          .connect(alice)
          .midasMintTo(
            mockMidasTreasury.address,
            mockMasterContract.address,
            1000
          )
      ).to.revertedWith('Ownable: caller is not the owner');
    });
    it('mints tokens to the Midas Treasury and calls deposit', async () => {
      await expect(
        money
          .connect(owner)
          .midasMintTo(
            mockMidasTreasury.address,
            mockMasterContract.address,
            1000
          )
      )
        .to.emit(money, 'Transfer')
        .withArgs(ethers.constants.AddressZero, money.address, 1000)
        .to.emit(money, 'Transfer')
        .withArgs(money.address, mockMidasTreasury.address, 1000)
        .to.emit(money, 'Approval')
        .withArgs(money.address, mockMidasTreasury.address, 1000)
        .to.emit(mockMidasTreasury, 'LogDeposit')
        .withArgs(
          money.address,
          money.address,
          mockMasterContract.address,
          1000,
          1000
        );
    });
  });
});
