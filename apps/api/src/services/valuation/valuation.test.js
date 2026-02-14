import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createValuationService } from './valuation.service.js';

test('valuation: preserves quantity rows with unknown valuation when prices missing', async () => {
  const valuationService = createValuationService({
    coingeckoClient: {
      getPricesByContracts: async () => ({
        '0xknown': 2
      })
    },
    dexFallbackClient: {
      getPriceByContract: async () => null
    }
  });

  const valued = await valuationService.valuatePositions({
    chain: { slug: 'ethereum' },
    positions: [
      { contractOrMint: '0xknown', quantity: 3 },
      { contractOrMint: '0xunknown', quantity: 7 }
    ]
  });

  assert.equal(valued[0].valuationStatus, 'known');
  assert.equal(valued[0].usdValue, 6);
  assert.equal(valued[1].valuationStatus, 'unknown');
  assert.equal(valued[1].quantity, 7);
});
