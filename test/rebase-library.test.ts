import { expect } from 'chai';
import { ethers } from 'ethers';

import { deploy } from '../lib/test-utils';
import { MockRebaseLibrary } from '../typechain';

describe('RebaseLibrary', () => {
  let mockRebaseLibrary: MockRebaseLibrary;

  beforeEach(async () => {
    [mockRebaseLibrary] = await deploy(['MockRebaseLibrary']);
  });

  describe('function toBase', () => {
    it('returns the elastic when total.elastic is 0', async () => {
      const total = { base: 10, elastic: 0 };
      const elastic = 100;
      // @dev to avoid dividing by zero base will be the elastic
      expect(await mockRebaseLibrary.toBase(total, elastic, false)).to.be.equal(
        elastic
      );
    });
    it('ROUNDS DOWN: calculates the base with the new elastic', async () => {
      const total = { base: 5, elastic: 3 };
      const elastic = 10;
      const base = 16; // 10 * 5 / 3 it will round down
      expect(await mockRebaseLibrary.toBase(total, elastic, false)).to.be.equal(
        base
      );
    });
    it('ROUNDS UP: calculates the base with the new elastic', async () => {
      const total = { base: 5, elastic: 3 };
      const elastic = 10;
      const base = 17; // 10 * 5 / 3
      expect(await mockRebaseLibrary.toBase(total, elastic, true)).to.be.equal(
        base
      );
    });
  });
  describe('function toElastic', () => {
    it('returns the base when total.base is 0', async () => {
      const total = { base: 0, elastic: 10 };
      const base = 15;
      // @dev to avoid dividing by 0, conversion toElastic will return the base parameter
      expect(await mockRebaseLibrary.toElastic(total, base, false)).to.be.equal(
        base
      );
    });
    it('ROUNDS DOWN: calculates a new elastic based on a new base', async () => {
      const total = { base: 2, elastic: 5 };
      const base = 3;
      const elastic = 7; // 3 * 5 / 2
      expect(await mockRebaseLibrary.toElastic(total, base, false)).to.be.equal(
        elastic
      );
    });
    it('ROUNDS UP: calculates a new elastic based on a new base', async () => {
      const total = { base: 2, elastic: 5 };
      const base = 3;
      const elastic = 8; // 3 * 5 / 2
      expect(await mockRebaseLibrary.toElastic(total, base, true)).to.be.equal(
        elastic
      );
    });
  });

  describe('function add: elastic', () => {
    it('ROUNDS DOWN: adds elastic to the total', async () => {
      const total = { base: 5, elastic: 3 };
      const elastic = 10;
      const base = ethers.BigNumber.from(16); // 10 * 5 / 3 it will round
      const newTotal = {
        base: ethers.BigNumber.from(total.base + base.toNumber()),
        elastic: ethers.BigNumber.from(total.elastic + elastic),
      };
      await mockRebaseLibrary.set(total.base, total.elastic);
      await mockRebaseLibrary.add(elastic, false);
      const expectedTotal = await mockRebaseLibrary.total();
      expect(await mockRebaseLibrary.base()).to.equal(base);
      expect(expectedTotal.base).to.be.equal(newTotal.base);
      expect(expectedTotal.elastic).to.be.equal(newTotal.elastic);
    });
    it('ROUNDS UP: adds elastic to the total', async () => {
      const total = { base: 500, elastic: 1000 };
      const elastic = 31;
      const base = ethers.BigNumber.from(16); // 31 * 500 / 1000 it will round
      const newTotal = {
        base: ethers.BigNumber.from(total.base + base.toNumber()),
        elastic: ethers.BigNumber.from(total.elastic + elastic),
      };
      await mockRebaseLibrary.set(total.base, total.elastic);
      await mockRebaseLibrary.add(elastic, true);
      const expectedTotal = await mockRebaseLibrary.total();
      expect(await mockRebaseLibrary.base()).to.equal(base);
      expect(expectedTotal.base).to.be.equal(newTotal.base);
      expect(expectedTotal.elastic).to.be.equal(newTotal.elastic);
    });
  });
  describe('function sub: base', () => {
    it('ROUNDS DOWN: subtracts a new base and elastic value from a base/elastic pair', async () => {
      const total = { base: 10, elastic: 15 };
      const base = 3;
      const elastic = 4; // 3 * 5 / 2

      const newTotal = {
        base: total.base - base,
        elastic: total.elastic - elastic,
      };
      await mockRebaseLibrary.set(total.base, total.elastic);
      await mockRebaseLibrary.sub(base, false);
      const expectedTotal = await mockRebaseLibrary.total();
      expect(await mockRebaseLibrary.elastic()).to.equal(elastic);
      expect(expectedTotal.base).to.be.equal(newTotal.base);
      expect(expectedTotal.elastic).to.be.equal(newTotal.elastic);
    });
    it('ROUNDS UP: subtracts a new base and elastic value from a base/elastic pair', async () => {
      const total = { base: 10, elastic: 15 };
      const base = 3;
      const elastic = 5; // 3 * 5 / 2

      const newTotal = {
        base: total.base - base,
        elastic: total.elastic - elastic,
      };
      await mockRebaseLibrary.set(total.base, total.elastic);
      await mockRebaseLibrary.sub(base, true);
      const expectedTotal = await mockRebaseLibrary.total();
      expect(await mockRebaseLibrary.elastic()).to.equal(elastic);
      expect(expectedTotal.base).to.be.equal(newTotal.base);
      expect(expectedTotal.elastic).to.be.equal(newTotal.elastic);
    });
  });
  it('adds base and elastic to a base/elastic pair', async () => {
    const total = { base: 10, elastic: 15 };
    const base = 3;
    const elastic = 2;

    await mockRebaseLibrary.set(total.base, total.elastic);
    await mockRebaseLibrary.add2(base, elastic);

    const expectedTotal = await mockRebaseLibrary.total();

    expect(expectedTotal.base).to.be.equal(total.base + base);
    expect(expectedTotal.elastic).to.be.equal(total.elastic + elastic);
  });
  it('subtracts base and elastic to a base/elastic pair', async () => {
    const total = { base: 10, elastic: 15 };
    const base = 3;
    const elastic = 2;

    await mockRebaseLibrary.set(total.base, total.elastic);
    await mockRebaseLibrary.sub2(base, elastic);

    const expectedTotal = await mockRebaseLibrary.total();

    expect(expectedTotal.base).to.be.equal(total.base - base);
    expect(expectedTotal.elastic).to.be.equal(total.elastic - elastic);
  });
  it('adds elastic to a Rebase pair', async () => {
    const total = { base: 10, elastic: 15 };
    const elastic = 2;

    await mockRebaseLibrary.set(total.base, total.elastic);
    await mockRebaseLibrary.addElastic(elastic);

    const expectedTotal = await mockRebaseLibrary.total();
    expect(expectedTotal.base).to.be.equal(total.base);
    expect(expectedTotal.elastic).to.be.equal(total.elastic + elastic);
  });
  it('subtracts elastic to a Rebase pair', async () => {
    const total = { base: 10, elastic: 15 };
    const elastic = 2;

    await mockRebaseLibrary.set(total.base, total.elastic);
    await mockRebaseLibrary.subElastic(elastic);

    const expectedTotal = await mockRebaseLibrary.total();
    expect(expectedTotal.base).to.be.equal(total.base);
    expect(expectedTotal.elastic).to.be.equal(total.elastic - elastic);
  });
});
