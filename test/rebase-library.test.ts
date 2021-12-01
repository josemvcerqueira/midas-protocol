import { expect } from 'chai';

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
    it('calculates the base without rounding up with the new elastic', async () => {
      const total = { base: 5, elastic: 3 };
      const elastic = 10;
      const base = 16; // 10 * 5 / 3 it will round down
      expect(await mockRebaseLibrary.toBase(total, elastic, false)).to.be.equal(
        base
      );
    });
    it('calculates the base with the new elastic and rounds it up', async () => {
      const total = { base: 5, elastic: 3 };
      const elastic = 10;
      const base = 17; // 10 * 5 / 3
      expect(await mockRebaseLibrary.toBase(total, elastic, true)).to.be.equal(
        base
      );
    });
  });
});
