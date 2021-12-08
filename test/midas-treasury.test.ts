// eslint-disable-next-line node/no-extraneous-import
import { BigNumberish } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { advanceTime, multiDeploy } from '../lib/test-utils';
import {
  MasterContractManager,
  MockERC20,
  MockMasterContract,
  MockMidasTreasury,
  MockStrategy,
  WETH9,
} from '../typechain';

const EXTREME_VALID_VOLUME = ethers.BigNumber.from(2).pow(127);
// maximum uint128 	2^128 - 1
const MIDAS_LIMIT = ethers.BigNumber.from(2).pow(128).sub(1);
// maximum uint256 	2^256 - 1
const COMPUTATIONAL_LIMIT = ethers.BigNumber.from(2).pow(256).sub(1);
const ERC20_TOTAL_SUPPLY = ethers.utils.parseEther('1000000'); // 1 million

const ERC20_ALICE_BALANCE = ethers.utils.parseEther('2000'); // 2_000
const ERC20_BOB_BALANCE = ethers.utils.parseEther('100'); // 100
const ERC20_JOSE_BALANCE = ethers.utils.parseEther('50000'); // 50_000

const NAME = 'MockMasterContract';
const SYMBOL = 'MC';

const mockMasterContractData = ethers.utils.defaultAbiCoder.encode(
  ['string', 'string'],
  [NAME, SYMBOL]
);

const makeToShare =
  (
    address: string,
    midasTreasury: MockMidasTreasury,
    user: SignerWithAddress
  ) =>
  async (amount: BigNumberish, roundUp: boolean) =>
    midasTreasury.connect(user).toShare(address, amount, roundUp);

const makeToAmount =
  (
    address: string,
    midasTreasury: MockMidasTreasury,
    user: SignerWithAddress
  ) =>
  async (amount: BigNumberish, roundUp: boolean) =>
    midasTreasury.connect(user).toAmount(address, amount, roundUp);

describe('MidasTreasury', () => {
  let mockMidasTreasury: MockMidasTreasury;
  let WETH: WETH9;
  let mockERC20: MockERC20;
  let mockStrategy: MockStrategy;
  let masterContractManager: MasterContractManager;
  let mockMasterContract: MockMasterContract;

  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let jose: SignerWithAddress;
  let owner: SignerWithAddress;

  beforeEach(async () => {
    // First signer is the owner of all contracts by default
    [owner, alice, bob, jose] = await ethers.getSigners();

    [mockERC20, WETH, masterContractManager, mockMasterContract] =
      await multiDeploy(
        ['MockERC20', 'WETH9', 'MasterContractManager', 'MockMasterContract'],
        [['MockERC20', 'M20', ERC20_TOTAL_SUPPLY], [], [], []]
      );

    [mockMidasTreasury] = await multiDeploy(
      ['MockMidasTreasury'],
      [[WETH.address, masterContractManager.address], [owner]]
    );

    [mockStrategy] = await multiDeploy(
      ['MockStrategy'],
      [[mockERC20.address, mockMidasTreasury.address]]
    );

    await Promise.all([
      mockERC20.connect(owner).transfer(alice.address, ERC20_ALICE_BALANCE),
      mockERC20.connect(owner).transfer(bob.address, ERC20_BOB_BALANCE),
      mockERC20.connect(owner).transfer(jose.address, ERC20_JOSE_BALANCE),
      mockMidasTreasury
        .connect(owner)
        .setStrategy(mockERC20.address, mockStrategy.address),
      mockERC20
        .connect(owner)
        .approve(mockMidasTreasury.address, ERC20_TOTAL_SUPPLY),
      mockERC20
        .connect(alice)
        .approve(mockMidasTreasury.address, ERC20_TOTAL_SUPPLY),
      mockERC20
        .connect(bob)
        .approve(mockMidasTreasury.address, ERC20_TOTAL_SUPPLY),
      mockERC20
        .connect(jose)
        .approve(mockMidasTreasury.address, ERC20_TOTAL_SUPPLY),
      masterContractManager.clone(
        mockMasterContract.address,
        mockMasterContractData
      ),
    ]);

    // 2 weeks
    await advanceTime(1.21e6, ethers);
    await Promise.all([
      mockMidasTreasury
        .connect(owner)
        .setStrategy(mockERC20.address, mockStrategy.address),
      // 20%
      mockMidasTreasury
        .connect(owner)
        .setStrategyTargetPercentage(mockERC20.address, 20),
    ]);
  });

  describe('CONVERSION: toShare && toAmount', () => {
    it('should convert an amount of tokens to shares', async () => {
      const toShare = makeToShare(mockERC20.address, mockMidasTreasury, alice);
      expect(await toShare(1000, false)).to.be.equal(1000);
      expect(await toShare(2, false)).to.be.equal(2);
      expect(await toShare(0, false)).to.be.equal(0);
      expect(await toShare(1000, true)).to.be.equal(1000);
      expect(await toShare(2, true)).to.be.equal(2);
      expect(await toShare(0, true)).to.be.equal(0);
      expect(await toShare(EXTREME_VALID_VOLUME.toString(), true)).to.be.equal(
        EXTREME_VALID_VOLUME.toString()
      );
      expect(await toShare(MIDAS_LIMIT.toString(), true)).to.be.equal(
        MIDAS_LIMIT.toString()
      );
      // @notice to share supports up to the maximum uint256 value for conversions if there are no tokens deposited
      expect(await toShare(COMPUTATIONAL_LIMIT.toString(), true)).to.be.equal(
        COMPUTATIONAL_LIMIT.toString()
      );
      await mockMidasTreasury
        .connect(alice)
        .deposit(mockERC20.address, alice.address, alice.address, 1000, 0);
      // @notice will overflow because of computational limit. Midas Treasury does not support very large tokens
      await expect(
        toShare(COMPUTATIONAL_LIMIT.toString(), true)
      ).to.revertedWith('');
    });
    it('should convert an amount of shares to an amount of tokens', async () => {
      const toAmount = makeToAmount(
        mockERC20.address,
        mockMidasTreasury,
        alice
      );
      expect(await toAmount(1000, false)).to.be.equal(1000);
      expect(await toAmount(2, false)).to.be.equal(2);
      expect(await toAmount(0, false)).to.be.equal(0);
      expect(await toAmount(1000, true)).to.be.equal(1000);
      expect(await toAmount(2, true)).to.be.equal(2);
      expect(await toAmount(0, true)).to.be.equal(0);
      expect(await toAmount(EXTREME_VALID_VOLUME.toString(), true)).to.be.equal(
        EXTREME_VALID_VOLUME.toString()
      );
      expect(await toAmount(MIDAS_LIMIT.toString(), true)).to.be.equal(
        MIDAS_LIMIT.toString()
      );
      // @notice to share supports up to the maximum uint256 value for conversions if there are no tokens deposited
      expect(await toAmount(COMPUTATIONAL_LIMIT.toString(), true)).to.be.equal(
        COMPUTATIONAL_LIMIT.toString()
      );
      await mockMidasTreasury
        .connect(alice)
        .deposit(mockERC20.address, alice.address, alice.address, 1000, 0);
      // @notice will overflow because of computational limit. Midas Treasury does not support very large tokens
      await expect(
        toAmount(COMPUTATIONAL_LIMIT.toString(), true)
      ).to.revertedWith('');
    });
    it('converts properly based on ratio of shares/amount', async () => {
      const toAmount = makeToAmount(
        mockERC20.address,
        mockMidasTreasury,
        alice
      );
      const toShare = makeToShare(mockERC20.address, mockMidasTreasury, alice);

      await Promise.all([
        mockMidasTreasury
          .connect(jose)
          .deposit(
            mockERC20.address,
            jose.address,
            jose.address,
            ethers.utils.parseEther('100'),
            0
          ),
        mockMidasTreasury
          .connect(owner)
          .addProfit(mockERC20.address, ethers.utils.parseEther('55')),
      ]);

      /*
       * shares = 100 Due to the initial deposit of 100 tokens
       * amount = 155 Due to initial deposit + 55 profit
       * example 1000 * 155 / 100 = 1550
       */
      expect(await toAmount(1000, false)).to.be.equal(1550);
      expect(await toAmount(2, false)).to.be.equal(3);
      expect(await toAmount(0, false)).to.be.equal(0);
      expect(await toAmount(1000, true)).to.be.equal(1550);
      expect(await toAmount(2, true)).to.be.equal(4);
      expect(await toAmount(0, true)).to.be.equal(0);

      /*
       * shares = 100 Due to the initial deposit of 100 tokens
       * amount = 155 Due to initial deposit + 55 profit
       * example 1000 * 100 / 155 = 645.16
       */
      expect(await toShare(1000, false)).to.be.equal(645);
      expect(await toShare(2, false)).to.be.equal(1);
      expect(await toShare(0, false)).to.be.equal(0);
      expect(await toShare(1000, true)).to.be.equal(646);
      expect(await toShare(2, true)).to.be.equal(2);
      expect(await toShare(0, true)).to.be.equal(0);

      expect(await toShare(EXTREME_VALID_VOLUME, false)).to.be.equal(
        EXTREME_VALID_VOLUME.mul(100).div(155)
      );
      // @notice this is the maximum amount of tokens the protocol supports
      expect(await toShare(MIDAS_LIMIT, false)).to.be.equal(
        MIDAS_LIMIT.mul(100).div(155)
      );

      await expect(toShare(COMPUTATIONAL_LIMIT, false)).to.be.revertedWith('');
    });
  });
});