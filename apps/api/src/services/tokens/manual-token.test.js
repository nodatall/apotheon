import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createManualTokenService } from './manual-token.service.js';

test('manual-token: registration supports metadata overrides and idempotent upsert key', async () => {
  const writes = [];

  const service = createManualTokenService({
    trackedTokensRepository: {
      upsertTrackedToken: async (payload) => {
        writes.push(payload);
        return { id: 'token-1', ...payload };
      }
    },
    metadataClient: {
      fetchTokenMetadata: async () => ({ symbol: 'AUTO', name: 'Auto Name', decimals: 18 })
    }
  });

  const token = await service.registerManualToken({
    chain: { id: 'chain-1' },
    contractOrMint: '0xABC',
    symbol: 'OVR'
  });

  assert.equal(token.symbol, 'OVR');
  assert.equal(token.metadataSource, 'manual_override');
  assert.equal(writes[0].trackingSource, 'manual');
  assert.equal(writes[0].contractOrMint, '0xABC');
});
