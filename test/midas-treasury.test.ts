// eslint-disable-next-line node/no-extraneous-import
import { BigNumberish } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { advanceTime, deploy, multiDeploy } from '../lib/test-utils';
import {
  MasterContractManager,
  MockBorrower,
  MockERC20,
  MockERC20NoSupply,
  MockMaliciousBorrower,
  MockMasterContract,
  MockMidasTreasury,
  MockStrategy,
  WETH9,
} from '../typechain';

const EXTREME_VALID_VOLUME = ethers.BigNumber.from(2).pow(127);
// maximum uint128 	2^128 - 1
const MIDAS_LIMIT = ethers.BigNumber.from(2).pow(128).sub(1);
// maximum uint256 	2^256 - 1
const COMPUTATIONAL_LIMIT = ethers.constants.MaxUint256;
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
  // @notice unregistered masterContract to test the allowed modifier
  let mockMasterContract2: MockMasterContract;
  let mockERC20NoSupply: MockERC20NoSupply;

  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let jose: SignerWithAddress;
  let owner: SignerWithAddress;
  // User that makes no TX
  let nujoud: SignerWithAddress;

  beforeEach(async () => {
    // First signer is the owner of all contracts by default
    [owner, alice, bob, jose, nujoud] = await ethers.getSigners();

    [
      mockERC20,
      WETH,
      masterContractManager,
      mockMasterContract,
      mockMasterContract2,
      mockERC20NoSupply,
    ] = await multiDeploy(
      [
        'MockERC20',
        'WETH9',
        'MasterContractManager',
        'MockMasterContract',
        'MockMasterContract',
        'MockERC20NoSupply',
      ],
      [
        ['MockERC20', 'M20', ERC20_TOTAL_SUPPLY],
        [],
        [],
        [],
        [],
        ['MockERC20NoSupply', 'M20NoSupply'],
      ]
    );

    mockMidasTreasury = await deploy('MockMidasTreasury', [
      WETH.address,
      masterContractManager.address,
    ]);

    mockStrategy = await deploy('MockStrategy', [
      mockERC20.address,
      mockMidasTreasury.address,
    ]);

    await Promise.all([
      mockERC20.connect(owner).transfer(alice.address, ERC20_ALICE_BALANCE),
      mockERC20.connect(owner).transfer(bob.address, ERC20_BOB_BALANCE),
      mockERC20.connect(owner).transfer(jose.address, ERC20_JOSE_BALANCE),
      mockMidasTreasury
        .connect(owner)
        .setStrategy(mockERC20.address, mockStrategy.address),
      masterContractManager
        .connect(owner)
        .whitelistMasterContract(mockMasterContract.address, true),
      mockERC20
        .connect(owner)
        .approve(mockMidasTreasury.address, ERC20_TOTAL_SUPPLY),
      mockERC20
        .connect(alice)
        .approve(mockMidasTreasury.address, ERC20_TOTAL_SUPPLY),
      mockERC20
        .connect(jose)
        .approve(mockMidasTreasury.address, ERC20_TOTAL_SUPPLY),
      mockMasterContract.initialize(mockMasterContractData),
      mockMasterContract.register(masterContractManager.address),
      mockMasterContract.setMidasTreasury(mockMidasTreasury.address),
      mockMasterContract2.initialize(mockMasterContractData),
      mockMasterContract2.setMidasTreasury(mockMidasTreasury.address),
      // @notice WETH needs a deposit to have supply
      WETH.connect(owner).deposit({ value: ethers.utils.parseEther('10') }),
    ]);

    // 2 weeks
    await advanceTime(1.21e6, ethers);
    await Promise.all([
      mockMidasTreasury
        .connect(owner)
        .setStrategy(mockERC20.address, mockStrategy.address),
      // 90%
      mockMidasTreasury
        .connect(owner)
        .setStrategyTargetPercentage(mockERC20.address, 90),
      mockMasterContract.setMidasTreasury(mockMidasTreasury.address),
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

  describe('function: deposit', () => {
    it('checks for master contract permission if the sender is not the user', async () => {
      await expect(
        mockMasterContract2.connect(alice).deposit(mockERC20.address, 1000)
      ).to.revertedWith('MK: No Master Contract found');
      await expect(
        mockMasterContract.connect(alice).deposit(mockERC20.address, 1000)
      ).to.revertedWith('MK: Transfer not approved');
      await masterContractManager
        .connect(alice)
        .setMasterContractApproval(
          alice.address,
          mockMasterContract.address,
          true,
          0,
          '0x0000000000000000000000000000000000000000000000000000000000000000',
          '0x0000000000000000000000000000000000000000000000000000000000000000'
        );
      await expect(
        mockMasterContract.connect(alice).deposit(mockERC20.address, 1000)
      ).to.emit(mockMidasTreasury, 'LogDeposit');
    });

    it('prevents shares to be given to the ZERO ADDRESS', async () => {
      await expect(
        mockMidasTreasury
          .connect(alice)
          .deposit(
            mockERC20.address,
            alice.address,
            ethers.constants.AddressZero,
            1000,
            0
          )
      ).to.revertedWith('MK: no burn funds');
    });

    it('prevents non deployed ERC20 tokens to be deposited', async () => {
      await expect(
        mockMidasTreasury.connect(alice).deposit(
          // She is an EOA, not a deployed ERC20, so should throw
          alice.address,
          alice.address,
          alice.address,
          1000,
          0
        )
      ).to.revertedWith('');
      await expect(
        mockMidasTreasury
          .connect(alice)
          .deposit(
            mockERC20NoSupply.address,
            alice.address,
            alice.address,
            1000,
            0
          )
      ).to.revertedWith('MK: ERC20 not deployed');
    });
    it('does not update the state if you deposit below the minimum share balance', async () => {
      const tokenData = await mockMidasTreasury.totals(mockERC20.address);
      expect(tokenData.base).to.be.equal(0);
      expect(tokenData.elastic).to.be.equal(0);
      await expect(
        mockMidasTreasury
          .connect(alice)
          .deposit(mockERC20.address, alice.address, alice.address, 1, 0)
      ).to.not.emit(mockMidasTreasury, 'LogDeposit');
      const tokenDataAfterUpdate = await mockMidasTreasury.totals(
        mockERC20.address
      );
      expect(tokenDataAfterUpdate.base).to.be.equal(0);
      expect(tokenDataAfterUpdate.elastic).to.be.equal(0);
    });
    it('reverts if user does not send enough ETH', async () => {
      await expect(
        mockMidasTreasury.connect(alice).deposit(
          ethers.constants.AddressZero,
          alice.address,
          alice.address,
          ethers.utils.parseEther('100'),
          0,
          // @notice sends 1 ETH less
          { value: ethers.utils.parseEther('99') }
        )
      ).to.revertedWith('MK: not enough ETH');
    });
    it('reverts if the user does approve or does not have enough ERC20 on their account', async () => {
      await expect(
        mockMidasTreasury
          .connect(bob)
          .deposit(
            mockERC20.address,
            bob.address,
            bob.address,
            ethers.utils.parseEther('100'),
            0
          )
      ).to.revertedWith('ERC20: transfer amount exceeds allowance');
      await expect(
        mockMidasTreasury
          .connect(alice)
          .deposit(
            mockERC20.address,
            alice.address,
            alice.address,
            ethers.utils.parseEther('5000'),
            0
          )
      ).to.revertedWith('ERC20: transfer amount exceeds balance');
    });
    it('updates the state properly and emits LogDepositEvent on an ERC20 deposit', async () => {
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, alice.address)
      ).to.be.equal(0);
      const tokenData = await mockMidasTreasury.totals(mockERC20.address);
      expect(tokenData.base).to.be.equal(0);
      expect(tokenData.elastic).to.be.equal(0);
      await expect(
        mockMidasTreasury
          .connect(alice)
          .deposit(mockERC20.address, alice.address, alice.address, 1000, 0)
      )
        .to.emit(mockMidasTreasury, 'LogDeposit')
        .withArgs(mockERC20.address, alice.address, alice.address, 1000, 1000);
      const tokenDataAfterUpdate = await mockMidasTreasury.totals(
        mockERC20.address
      );
      expect(tokenDataAfterUpdate.base).to.be.equal(1000);
      expect(tokenDataAfterUpdate.elastic).to.be.equal(1000);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, alice.address)
      ).to.be.equal(1000);
      await expect(
        mockMidasTreasury
          .connect(alice)
          .deposit(mockERC20.address, alice.address, alice.address, 700, 0)
      )
        .to.emit(mockMidasTreasury, 'LogDeposit')
        .withArgs(mockERC20.address, alice.address, alice.address, 700, 700);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, alice.address)
      ).to.be.equal(1700);
      const tokenDataAfterUpdate2 = await mockMidasTreasury.totals(
        mockERC20.address
      );
      expect(tokenDataAfterUpdate2.base).to.be.equal(1700);
      expect(tokenDataAfterUpdate2.elastic).to.be.equal(1700);

      // @notice add profit to make shares/amount more complex
      await mockMidasTreasury.connect(owner).addProfit(mockERC20.address, 1500);

      await expect(
        mockMidasTreasury
          .connect(jose)
          // @notice also tests that jose can deposit to alice and also tests when u deposit shares instead of amount
          .deposit(mockERC20.address, jose.address, alice.address, 0, 25_000)
      )
        .to.emit(mockMidasTreasury, 'LogDeposit')
        .withArgs(
          mockERC20.address,
          jose.address,
          alice.address,
          47_059,
          25_000
        );
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, alice.address)
      ).to.be.equal(26_700);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, jose.address)
      ).to.be.equal(0);
      const tokenDataAfterUpdate3 = await mockMidasTreasury.totals(
        mockERC20.address
      );
      expect(tokenDataAfterUpdate3.base).to.be.equal(26_700);
      expect(tokenDataAfterUpdate3.elastic).to.be.equal(50_259);
    });
    it('accepts ETH deposits', async () => {
      // @notice the previous test already checks for all logic so this test can be simpler

      const depositAmount = ethers.utils.parseEther('200');
      expect(
        await mockMidasTreasury.balanceOf(WETH.address, jose.address)
      ).to.be.equal(0);
      await expect(
        mockMidasTreasury.connect(jose).deposit(
          // @notice ADDRESS_ZERO represents an ETH deposit
          ethers.constants.AddressZero,
          jose.address,
          jose.address,
          depositAmount,
          0,
          {
            value: depositAmount,
          }
        )
      )
        .to.emit(mockMidasTreasury, 'LogDeposit')
        .withArgs(
          WETH.address,
          jose.address,
          jose.address,
          depositAmount,
          depositAmount
        );
      expect(
        await mockMidasTreasury.balanceOf(WETH.address, jose.address)
      ).to.be.equal(depositAmount);
    });
  });
  describe('function: withdraw', () => {
    it('checks for master contract permission if the sender is not the user', async () => {
      await expect(
        mockMasterContract2.connect(alice).withdraw(mockERC20.address, 1000)
      ).to.revertedWith('MK: No Master Contract found');
      await expect(
        mockMasterContract.connect(alice).withdraw(mockERC20.address, 1000)
      ).to.revertedWith('MK: Transfer not approved');
      await Promise.all([
        masterContractManager
          .connect(alice)
          .setMasterContractApproval(
            alice.address,
            mockMasterContract.address,
            true,
            0,
            '0x0000000000000000000000000000000000000000000000000000000000000000',
            '0x0000000000000000000000000000000000000000000000000000000000000000'
          ),
        mockMidasTreasury
          .connect(alice)
          .deposit(mockERC20.address, alice.address, alice.address, 10_000, 0),
      ]);

      await expect(
        mockMasterContract.connect(alice).withdraw(mockERC20.address, 10_000)
      ).to.emit(mockMidasTreasury, 'LogWithdraw');
    });
    it('does not allow to burn funds to the ZERO ADDRESS', async () => {
      await expect(
        mockMidasTreasury
          .connect(alice)
          .withdraw(
            mockERC20.address,
            alice.address,
            ethers.constants.AddressZero,
            1000,
            0
          )
      ).to.revertedWith('MK: no burn funds');
    });
    it('does not allow to leave shares below the minimum share balance', async () => {
      await mockMidasTreasury
        .connect(alice)
        .deposit(mockERC20.address, alice.address, alice.address, 10_000, 0);
      await expect(
        mockMidasTreasury
          .connect(alice)
          .withdraw(mockERC20.address, alice.address, alice.address, 9999, 0)
      ).to.revertedWith('MK: cannot be empty');
    });
    it('does not allow a user to withdraw more tokens than he/she deposited', async () => {
      await Promise.all([
        // @notice test amount logic
        mockMidasTreasury
          .connect(alice)
          .deposit(mockERC20.address, alice.address, alice.address, 10_000, 0),
        // @notice test shares logic
        mockMidasTreasury
          .connect(alice)
          .deposit(
            ethers.constants.AddressZero,
            alice.address,
            alice.address,
            0,
            ethers.utils.parseEther('1'),
            {
              value: ethers.utils.parseEther('1'),
            }
          ),
      ]);
      await expect(
        mockMidasTreasury
          .connect(alice)
          .withdraw(mockERC20.address, alice.address, alice.address, 10_001, 0)
        // underflow error balanceOf[token][from] -= shares;
      ).to.revertedWith('');
      await expect(
        mockMidasTreasury
          .connect(alice)
          .withdraw(
            ethers.constants.AddressZero,
            alice.address,
            alice.address,
            0,
            ethers.utils.parseEther('1.1')
          )
        // underflow error balanceOf[token][from] -= shares;
      ).to.revertedWith('');
    });
    it('allows ERC20 to be withdrawn', async () => {
      await Promise.all([
        mockMidasTreasury
          .connect(alice)
          // @notice also testing that you can give your shares to someone else
          .deposit(mockERC20.address, alice.address, jose.address, 10_000, 0),
        mockMidasTreasury
          .connect(alice)
          .deposit(mockERC20.address, alice.address, alice.address, 0, 1000),
      ]);

      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, jose.address)
      ).to.be.equal(10_000);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, alice.address)
      ).to.be.equal(1000);
      const totals1 = await mockMidasTreasury.totals(mockERC20.address);
      expect(totals1.base).to.equal(11_000);
      expect(totals1.elastic).to.equal(11_000);

      await mockMidasTreasury.addProfit(mockERC20.address, 5000);

      await expect(
        mockMidasTreasury
          .connect(jose)
          .withdraw(mockERC20.address, jose.address, alice.address, 0, 5000)
      )
        .to.emit(mockMidasTreasury, 'LogWithdraw')
        .withArgs(mockERC20.address, jose.address, alice.address, 7272, 5000);

      const totals2 = await mockMidasTreasury.totals(mockERC20.address);
      expect(totals2.base).to.equal(6000);
      expect(totals2.elastic).to.equal(8728);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, jose.address)
      ).to.equal(5000);
      await expect(
        mockMidasTreasury
          .connect(jose)
          .withdraw(mockERC20.address, jose.address, alice.address, 7273, 0)
      )
        .to.emit(mockMidasTreasury, 'LogWithdraw')
        .withArgs(mockERC20.address, jose.address, alice.address, 7273, 5000);
      const totals3 = await mockMidasTreasury.totals(mockERC20.address);
      expect(totals3.base).to.equal(1000);
      expect(totals3.elastic).to.equal(1455);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, jose.address)
      ).to.equal(0);
    });
    it('allows ETH to be withdrawn', async () => {
      const depositAmount = ethers.utils.parseEther('200');
      expect(
        await mockMidasTreasury.balanceOf(WETH.address, jose.address)
      ).to.be.equal(0);
      await mockMidasTreasury.connect(jose).deposit(
        // @notice ADDRESS_ZERO represents an ETH deposit
        ethers.constants.AddressZero,
        jose.address,
        jose.address,
        depositAmount,
        0,
        {
          value: depositAmount,
        }
      );
      expect(
        await mockMidasTreasury.balanceOf(WETH.address, jose.address)
      ).to.be.equal(depositAmount);
      await expect(
        mockMidasTreasury.connect(jose).withdraw(
          ethers.constants.AddressZero,
          jose.address,
          // @notice withdraws the ETH to nujoud. Nujoud did not do any TX so it is easy to calculate her balance
          nujoud.address,
          0,
          depositAmount
        )
      )
        .to.emit(mockMidasTreasury, 'LogWithdraw')
        .withArgs(
          WETH.address,
          jose.address,
          nujoud.address,
          depositAmount,
          depositAmount
        );
      expect(
        await mockMidasTreasury.balanceOf(WETH.address, jose.address)
      ).to.be.equal(0);
      expect(await nujoud.getBalance()).to.be.equal(
        // @notice default 10_000 + 200 from jose
        ethers.utils.parseEther('10200')
      );
    });
  });
  describe('function: transfer', () => {
    it('checks for master contract permission if the sender is not the user', async () => {
      await mockMidasTreasury
        .connect(alice)
        .deposit(mockERC20.address, alice.address, alice.address, 10_000, 0);
      await expect(
        mockMasterContract2
          .connect(alice)
          .midasTransfer(mockERC20.address, jose.address, 10_000)
      ).to.revertedWith('MK: No Master Contract found');
      await expect(
        mockMasterContract
          .connect(alice)
          .midasTransfer(mockERC20.address, jose.address, 10_000)
      ).to.revertedWith('MK: Transfer not approved');
      await masterContractManager
        .connect(alice)
        .setMasterContractApproval(
          alice.address,
          mockMasterContract.address,
          true,
          0,
          '0x0000000000000000000000000000000000000000000000000000000000000000',
          '0x0000000000000000000000000000000000000000000000000000000000000000'
        );
      await expect(
        mockMasterContract
          .connect(alice)
          .midasTransfer(mockERC20.address, jose.address, 10_000)
      ).to.emit(mockMidasTreasury, 'LogTransfer');
    });
    it('does not allow shares to be burned', async () => {
      await expect(
        mockMidasTreasury
          .connect(alice)
          .transfer(
            mockERC20.address,
            alice.address,
            ethers.constants.AddressZero,
            10
          )
      ).to.revertedWith('MK: no burn funds');
    });
    it('allows a user to transfer his shares to another', async () => {
      await mockMidasTreasury
        .connect(alice)
        .deposit(mockERC20.address, alice.address, alice.address, 10_000, 0);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, alice.address)
      ).to.be.equal(10_000);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, jose.address)
      ).to.be.equal(0);
      await expect(
        mockMidasTreasury
          .connect(alice)
          .transfer(mockERC20.address, alice.address, jose.address, 5000)
      )
        .to.emit(mockMidasTreasury, 'LogTransfer')
        .withArgs(mockERC20.address, alice.address, jose.address, 5000);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, alice.address)
      ).to.be.equal(5000);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, jose.address)
      ).to.be.equal(5000);
    });
  });
  describe('function: transferMultiple', () => {
    it('checks for master contract permission if the sender is not the user', async () => {
      const toArray = [jose.address, bob.address];
      const sharesArray = [5000, 5000];
      await mockMidasTreasury
        .connect(alice)
        .deposit(mockERC20.address, alice.address, alice.address, 10_000, 0);
      await expect(
        mockMasterContract2
          .connect(alice)
          .midasTransferMultiple(mockERC20.address, toArray, sharesArray)
      ).to.revertedWith('MK: No Master Contract found');
      await expect(
        mockMasterContract
          .connect(alice)
          .midasTransferMultiple(mockERC20.address, toArray, sharesArray)
      ).to.revertedWith('MK: Transfer not approved');
      await masterContractManager
        .connect(alice)
        .setMasterContractApproval(
          alice.address,
          mockMasterContract.address,
          true,
          0,
          '0x0000000000000000000000000000000000000000000000000000000000000000',
          '0x0000000000000000000000000000000000000000000000000000000000000000'
        );
      await expect(
        mockMasterContract
          .connect(alice)
          .midasTransferMultiple(mockERC20.address, toArray, sharesArray)
      ).to.emit(mockMidasTreasury, 'LogTransfer');
    });
    it('does not allow shares to be burned', async () => {
      const toArray = [jose.address, ethers.constants.AddressZero];
      const sharesArray = [5000, 5000];
      await expect(
        mockMidasTreasury
          .connect(alice)
          .transferMultiple(
            mockERC20.address,
            alice.address,
            toArray,
            sharesArray
          )
      ).to.revertedWith('MK: cannot burn funds');
    });
    it('allows to transfer shares to multiple users', async () => {
      const toArray = [jose.address, bob.address];
      const sharesArray = [4000, 5000];
      await mockMidasTreasury
        .connect(alice)
        .deposit(mockERC20.address, alice.address, alice.address, 10_000, 0);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, toArray[0])
      ).to.be.equal(0);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, toArray[1])
      ).to.be.equal(0);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, alice.address)
      ).to.be.equal(10_000);
      await expect(
        mockMidasTreasury
          .connect(alice)
          .transferMultiple(
            mockERC20.address,
            alice.address,
            toArray,
            sharesArray
          )
      )
        .to.emit(mockMidasTreasury, 'LogTransfer')
        .withArgs(mockERC20.address, alice.address, toArray[0], sharesArray[0])
        .to.emit(mockMidasTreasury, 'LogTransfer')
        .withArgs(mockERC20.address, alice.address, toArray[1], sharesArray[1]);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, toArray[0])
      ).to.be.equal(sharesArray[0]);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, toArray[1])
      ).to.be.equal(sharesArray[1]);
      expect(
        await mockMidasTreasury.balanceOf(mockERC20.address, alice.address)
      ).to.be.equal(1000);
    });
  });
  describe('function: flashLoan', () => {
    it('reverts if the borrower tries to borrow more than the contract holds', async () => {
      const mockMaliciousBorrower: MockMaliciousBorrower = await deploy(
        'MockMaliciousBorrower'
      );
      await expect(
        mockMidasTreasury
          .connect(alice)
          .flashLoan(
            mockMaliciousBorrower.address,
            alice.address,
            mockERC20.address,
            10_000,
            '0x0000000000000000000000000000000000000000000000000000000000000000'
          )
      ).to.revertedWith('ERC20: transfer amount exceeds balance');
    });
    it('reverts if the borrower does not pay the right amount including the fee', async () => {
      const mockMaliciousBorrower: MockMaliciousBorrower = await deploy(
        'MockMaliciousBorrower'
      );
      await mockMidasTreasury
        .connect(alice)
        .deposit(mockERC20.address, alice.address, alice.address, 10_000, 0);
      await expect(
        mockMidasTreasury
          .connect(alice)
          .flashLoan(
            mockMaliciousBorrower.address,
            alice.address,
            mockERC20.address,
            10_000,
            '0x0000000000000000000000000000000000000000000000000000000000000000'
          )
      ).to.revertedWith('MK: Wrong amount');
    });
    it('allows flashloans', async () => {
      // @notice uses the contract constants
      const fee = (10_000 * 50) / 1e5;

      const mockBorrower: MockBorrower = await deploy('MockBorrower');
      // Send tokens to the borrower to pay fee
      await mockERC20.connect(owner).transfer(mockBorrower.address, 10_000);
      await mockMidasTreasury
        .connect(alice)
        .deposit(mockERC20.address, alice.address, alice.address, 10_000, 0);
      const total1 = await mockMidasTreasury.totals(mockERC20.address);
      expect(total1.elastic).to.be.equal(10_000);
      await expect(
        mockMidasTreasury
          .connect(alice)
          .flashLoan(
            mockBorrower.address,
            mockBorrower.address,
            mockERC20.address,
            10_000,
            mockMasterContractData
          )
      )
        .to.emit(mockBorrower, 'LogFlashLoan')
        .withArgs(
          alice.address,
          mockERC20.address,
          10_000,
          Math.floor(fee),
          mockMasterContractData
        )
        .to.emit(mockMidasTreasury, 'LogFlashLoan')
        .withArgs(
          mockBorrower.address,
          mockERC20.address,
          10_000,
          Math.floor(fee),
          mockBorrower.address
        );
      const total2 = await mockMidasTreasury.totals(mockERC20.address);
      expect(total2.elastic.toNumber()).to.be.greaterThan(10_000);
    });
  });
  describe('function: harvest', () => {
    beforeEach(async () => {
      // @dev initial set up to tokens are invested to the strategy
      await mockMidasTreasury
        .connect(alice)
        .deposit(mockERC20.address, alice.address, alice.address, 10_000, 0);
      await mockMidasTreasury.harvest(mockERC20.address, true, 10_000);
    });

    it('does nothing if the strategy has no profit/loss and we do not trigger a rebalance', async () => {
      await expect(mockMidasTreasury.harvest(mockERC20.address, false, 0))
        .to.not.emit(mockMidasTreasury, 'LogStrategyProfit')
        .to.not.emit(mockMidasTreasury, 'LogStrategyLoss')
        .to.not.emit(mockMidasTreasury, 'LogStrategyInvest')
        .to.not.emit(mockMidasTreasury, 'LogStrategyDivest');
    });
    it('updates the state if there is a profit without rebalancing', async () => {
      await mockStrategy.setProfit(1000);
      const [total1, strategy1] = await Promise.all([
        mockMidasTreasury.totals(mockERC20.address),
        mockMidasTreasury.strategyData(mockERC20.address),
      ]);
      expect(total1.elastic).to.be.equal(10_000);
      expect(strategy1.balance).to.be.equal(9000);
      await expect(mockMidasTreasury.harvest(mockERC20.address, false, 0))
        .to.emit(mockMidasTreasury, 'LogStrategyProfit')
        .withArgs(mockERC20.address, 1000)
        .to.not.emit(mockMidasTreasury, 'LogStrategyLoss')
        .to.not.emit(mockMidasTreasury, 'LogStrategyInvest')
        .to.not.emit(mockMidasTreasury, 'LogStrategyDivest');
      const [total2, strategy2] = await Promise.all([
        mockMidasTreasury.totals(mockERC20.address),
        mockMidasTreasury.strategyData(mockERC20.address),
      ]);
      expect(total2.elastic).to.be.equal(11_000);
      expect(strategy2.balance).to.be.equal(10_000);
    });
    it('updates the state if there is a loss without rebalancing', async () => {
      await mockStrategy.setProfit(-1000);
      const [total1, strategy1] = await Promise.all([
        mockMidasTreasury.totals(mockERC20.address),
        mockMidasTreasury.strategyData(mockERC20.address),
      ]);
      expect(total1.elastic).to.be.equal(10_000);
      expect(strategy1.balance).to.be.equal(9000);
      await expect(mockMidasTreasury.harvest(mockERC20.address, false, 0))
        .to.emit(mockMidasTreasury, 'LogStrategyLoss')
        .withArgs(mockERC20.address, 1000)
        .to.not.emit(mockMidasTreasury, 'LogStrategyProfit')
        .to.not.emit(mockMidasTreasury, 'LogStrategyInvest')
        .to.not.emit(mockMidasTreasury, 'LogStrategyDivest');
      const [total2, strategy2] = await Promise.all([
        mockMidasTreasury.totals(mockERC20.address),
        mockMidasTreasury.strategyData(mockERC20.address),
      ]);
      expect(total2.elastic).to.be.equal(9000);
      expect(strategy2.balance).to.be.equal(8000);
    });
    it('sends tokens to the strategy if a rebalance is triggered and is below the target amount', async () => {
      const [total1, strategy1] = await Promise.all([
        mockMidasTreasury.totals(mockERC20.address),
        mockMidasTreasury.strategyData(mockERC20.address),
      ]);
      expect(total1.elastic).to.be.equal(10_000);
      expect(strategy1.balance).to.be.equal(9000);

      // @dev for rebalance purposes
      await mockMidasTreasury
        .connect(alice)
        .deposit(mockERC20.address, alice.address, alice.address, 5000, 0);

      await expect(mockMidasTreasury.harvest(mockERC20.address, true, 10_000))
        .to.emit(mockMidasTreasury, 'LogStrategyInvest')
        .withArgs(mockERC20.address, 4500)
        .to.not.emit(mockMidasTreasury, 'LogStrategyLoss')
        .to.not.emit(mockMidasTreasury, 'LogStrategyProfit')
        .to.not.emit(mockMidasTreasury, 'LogStrategyDivest');
      const [total2, strategy2] = await Promise.all([
        mockMidasTreasury.totals(mockERC20.address),
        mockMidasTreasury.strategyData(mockERC20.address),
      ]);
      expect(total2.elastic).to.be.equal(15_000);
      expect(strategy2.balance).to.be.equal(13_500);
    });
    it('it withdraws tokens from the strategy if a rebalance is triggered and is above the target amount', async () => {
      const [total1, strategy1] = await Promise.all([
        mockMidasTreasury.totals(mockERC20.address),
        mockMidasTreasury.strategyData(mockERC20.address),
      ]);
      expect(total1.elastic).to.be.equal(10_000);
      expect(strategy1.balance).to.be.equal(9000);

      // @dev for rebalance purposes
      await mockMidasTreasury
        .connect(owner)
        .setStrategyTargetPercentage(mockERC20.address, 50);

      await expect(mockMidasTreasury.harvest(mockERC20.address, true, 10_000))
        .to.emit(mockMidasTreasury, 'LogStrategyDivest')
        .withArgs(mockERC20.address, 4000)
        .to.not.emit(mockMidasTreasury, 'LogStrategyLoss')
        .to.not.emit(mockMidasTreasury, 'LogStrategyProfit')
        .to.not.emit(mockMidasTreasury, 'LogStrategyInvest');
      const [total2, strategy2] = await Promise.all([
        mockMidasTreasury.totals(mockERC20.address),
        mockMidasTreasury.strategyData(mockERC20.address),
      ]);
      expect(total2.elastic).to.be.equal(10_000);
      expect(strategy2.balance).to.be.equal(5000);
    });
  });
  describe('function: setStrategyTargetPercentage', () => {
    it('reverts if the caller is not the owner', async () => {
      await expect(
        mockMidasTreasury
          .connect(alice)
          .setStrategyTargetPercentage(mockERC20.address, 90)
      ).to.revertedWith('Ownable: caller is not the owner');
    });
    it('reverts if you set a percentage higher than the maximum allowed', async () => {
      await expect(
        mockMidasTreasury
          .connect(owner)
          .setStrategyTargetPercentage(mockERC20.address, 99)
      ).to.revertedWith('MK: target too high');
    });
    it('updates the target percentage for a strategy', async () => {
      const data1 = await mockMidasTreasury.strategyData(mockERC20.address);
      expect(data1.targetPercentage).to.be.equal(90);
      await expect(
        mockMidasTreasury
          .connect(owner)
          .setStrategyTargetPercentage(mockERC20.address, 50)
      )
        .to.emit(mockMidasTreasury, 'LogStrategyTargetPercentage')
        .withArgs(mockERC20.address, 50);

      const data2 = await mockMidasTreasury.strategyData(mockERC20.address);
      expect(data2.targetPercentage).to.be.equal(50);
    });
  });
  describe('function: setStrategy', async () => {
    it('reverts if the caller is not the owner', async () => {
      await expect(
        mockMidasTreasury
          .connect(alice)
          .setStrategy(mockERC20.address, mockStrategy.address)
      ).to.revertedWith('Ownable: caller is not the owner');
    });
    it('sets a new pending strategy if there is no strategy associated with a token', async () => {
      const ERC20: MockERC20 = await deploy('MockERC20', [
        'MockERC202',
        'M20',
        ERC20_TOTAL_SUPPLY,
      ]);
      const data1 = await mockMidasTreasury.strategyData(ERC20.address);
      expect(data1.strategyStartDate).to.be.equal(0);
      expect(await mockMidasTreasury.strategy(ERC20.address)).to.be.equal(
        ethers.constants.AddressZero
      );
      expect(
        await mockMidasTreasury.pendingStrategy(ERC20.address)
      ).to.be.equal(ethers.constants.AddressZero);
      await expect(
        mockMidasTreasury
          .connect(owner)
          .setStrategy(ERC20.address, mockStrategy.address)
      )
        .emit(mockMidasTreasury, 'LogStrategyQueued')
        .withArgs(ERC20.address, mockStrategy.address);
      const data2 = await mockMidasTreasury.strategyData(ERC20.address);
      const timestamp = (
        await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
      ).timestamp;
      // @notice 1_209_600 is around two weeks in milliseconds
      expect(data2.strategyStartDate).to.be.equal(timestamp + 1_209_600);
      expect(await mockMidasTreasury.strategy(ERC20.address)).to.be.equal(
        ethers.constants.AddressZero
      );
      expect(
        await mockMidasTreasury.pendingStrategy(ERC20.address)
      ).to.be.equal(mockStrategy.address);
    });
    it('reverts if you try to set the pending strategy as the strategy before 2 weeks', async () => {
      const ERC20: MockERC20 = await deploy('MockERC20', [
        'MockERC202',
        'M20',
        ERC20_TOTAL_SUPPLY,
      ]);
      const data1 = await mockMidasTreasury.strategyData(ERC20.address);
      expect(data1.strategyStartDate).to.be.equal(0);
      expect(await mockMidasTreasury.strategy(ERC20.address)).to.be.equal(
        ethers.constants.AddressZero
      );
      expect(
        await mockMidasTreasury.pendingStrategy(ERC20.address)
      ).to.be.equal(ethers.constants.AddressZero);
      await mockMidasTreasury
        .connect(owner)
        .setStrategy(ERC20.address, mockStrategy.address);
      await expect(
        mockMidasTreasury
          .connect(owner)
          .setStrategy(ERC20.address, mockStrategy.address)
      ).to.revertedWith('MK: too early');
    });
    it('updates a pending  to a new one if they are different and resets the timestamp', async () => {
      const ERC20: MockERC20 = await deploy('MockERC20', [
        'MockERC202',
        'M20',
        ERC20_TOTAL_SUPPLY,
      ]);
      const mockStrategy2: MockStrategy = await deploy('MockStrategy', [
        ERC20.address,
        mockMidasTreasury.address,
      ]);
      const data1 = await mockMidasTreasury.strategyData(ERC20.address);
      expect(data1.strategyStartDate).to.be.equal(0);
      expect(await mockMidasTreasury.strategy(ERC20.address)).to.be.equal(
        ethers.constants.AddressZero
      );
      expect(
        await mockMidasTreasury.pendingStrategy(ERC20.address)
      ).to.be.equal(ethers.constants.AddressZero);
      await mockMidasTreasury
        .connect(owner)
        .setStrategy(ERC20.address, mockStrategy.address);

      expect(await mockMidasTreasury.strategy(ERC20.address)).to.be.equal(
        ethers.constants.AddressZero
      );
      expect(
        await mockMidasTreasury.pendingStrategy(ERC20.address)
      ).to.be.equal(mockStrategy.address);
      await expect(
        mockMidasTreasury
          .connect(owner)
          .setStrategy(ERC20.address, mockStrategy2.address)
      )
        .emit(mockMidasTreasury, 'LogStrategyQueued')
        .withArgs(ERC20.address, mockStrategy2.address);
      const data3 = await mockMidasTreasury.strategyData(ERC20.address);
      const timestamp = (
        await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
      ).timestamp;
      // @notice 1_209_600 is around two weeks in milliseconds
      expect(data3.strategyStartDate).to.be.equal(timestamp + 1_209_600);
      expect(await mockMidasTreasury.strategy(ERC20.address)).to.be.equal(
        ethers.constants.AddressZero
      );
      expect(
        await mockMidasTreasury.pendingStrategy(ERC20.address)
      ).to.be.equal(mockStrategy2.address);
    });
    it('sets updates a pending strategy to the main strategy after ~2 weeks', async () => {
      const ERC20: MockERC20 = await deploy('MockERC20', [
        'MockERC202',
        'M20',
        ERC20_TOTAL_SUPPLY,
      ]);
      const data1 = await mockMidasTreasury.strategyData(ERC20.address);
      expect(data1.strategyStartDate).to.be.equal(0);
      expect(await mockMidasTreasury.strategy(ERC20.address)).to.be.equal(
        ethers.constants.AddressZero
      );
      expect(
        await mockMidasTreasury.pendingStrategy(ERC20.address)
      ).to.be.equal(ethers.constants.AddressZero);
      await mockMidasTreasury
        .connect(owner)
        .setStrategy(ERC20.address, mockStrategy.address);

      expect(await mockMidasTreasury.strategy(ERC20.address)).to.be.equal(
        ethers.constants.AddressZero
      );
      expect(
        await mockMidasTreasury.pendingStrategy(ERC20.address)
      ).to.be.equal(mockStrategy.address);

      await advanceTime(1.21e6, ethers);

      await expect(
        mockMidasTreasury
          .connect(owner)
          .setStrategy(ERC20.address, mockStrategy.address)
      )
        .emit(mockMidasTreasury, 'LogStrategySet')
        .withArgs(ERC20.address, mockStrategy.address);
      const data3 = await mockMidasTreasury.strategyData(ERC20.address);
      expect(data3.balance).to.be.equal(0);
      expect(data3.strategyStartDate).to.be.equal(0);
      expect(await mockMidasTreasury.strategy(ERC20.address)).to.be.equal(
        mockStrategy.address
      );
      expect(
        await mockMidasTreasury.pendingStrategy(ERC20.address)
      ).to.be.equal(ethers.constants.AddressZero);
    });
    it('updates the state when setting a new main strategy if there is a profit', async () => {
      const mockStrategy2: MockStrategy = await deploy('MockStrategy', [
        mockERC20.address,
        mockMidasTreasury.address,
      ]);

      await mockMidasTreasury
        .connect(owner)
        .deposit(mockERC20.address, owner.address, owner.address, 10_000, 0);

      const total1 = await mockMidasTreasury.totals(mockERC20.address);
      expect(total1.elastic).to.be.equal(10_000);

      await Promise.all([
        mockMidasTreasury
          .connect(owner)
          .setStrategy(mockERC20.address, mockStrategy2.address),
        mockStrategy.setProfit(1000),
      ]);
      await advanceTime(1.21e6, ethers);
      await expect(
        mockMidasTreasury
          .connect(owner)
          .setStrategy(mockERC20.address, mockStrategy2.address)
      )
        .to.emit(mockMidasTreasury, 'LogStrategyProfit')
        .withArgs(mockERC20.address, 1000);

      const total2 = await mockMidasTreasury.totals(mockERC20.address);
      expect(total2.elastic).to.be.equal(11_000);

      const data = await mockMidasTreasury.strategyData(mockERC20.address);
      expect(data.balance).to.be.equal(0);
      expect(data.strategyStartDate).to.be.equal(0);
      expect(
        await mockMidasTreasury.pendingStrategy(mockERC20.address)
      ).to.be.equal(ethers.constants.AddressZero);
      expect(await mockMidasTreasury.strategy(mockERC20.address)).to.be.equal(
        mockStrategy2.address
      );
    });
    it('updates the state when setting a new main strategy if there is a loss', async () => {
      const mockStrategy2: MockStrategy = await deploy('MockStrategy', [
        mockERC20.address,
        mockMidasTreasury.address,
      ]);

      await mockMidasTreasury
        .connect(owner)
        .deposit(mockERC20.address, owner.address, owner.address, 10_000, 0);

      const total1 = await mockMidasTreasury.totals(mockERC20.address);
      expect(total1.elastic).to.be.equal(10_000);

      await Promise.all([
        mockMidasTreasury
          .connect(owner)
          .setStrategy(mockERC20.address, mockStrategy2.address),
        mockStrategy.setProfit(-1000),
      ]);
      await advanceTime(1.21e6, ethers);
      await expect(
        mockMidasTreasury
          .connect(owner)
          .setStrategy(mockERC20.address, mockStrategy2.address)
      )
        .to.emit(mockMidasTreasury, 'LogStrategyLoss')
        .withArgs(mockERC20.address, 1000);

      const total2 = await mockMidasTreasury.totals(mockERC20.address);
      expect(total2.elastic).to.be.equal(9000);

      const data = await mockMidasTreasury.strategyData(mockERC20.address);
      expect(data.balance).to.be.equal(0);
      expect(data.strategyStartDate).to.be.equal(0);
      expect(
        await mockMidasTreasury.pendingStrategy(mockERC20.address)
      ).to.be.equal(ethers.constants.AddressZero);
      expect(await mockMidasTreasury.strategy(mockERC20.address)).to.be.equal(
        mockStrategy2.address
      );
    });
  });
});
