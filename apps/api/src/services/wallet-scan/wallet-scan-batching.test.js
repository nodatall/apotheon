import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBalanceBatcher } from './balance-batcher.js';

test('wallet-scan-batching: uses batched resolver calls instead of per-token calls', async () => {
  let evmCalls = 0;

  const batcher = createBalanceBatcher({
    chunkSize: 3,
    evmResolver: async ({ tokens }) => {
      evmCalls += 1;
      return tokens.map((token) => ({
        contractOrMint: token.contractOrMint,
        balanceRaw: '1',
        balanceNormalized: 1
      }));
    }
  });

  const tokens = Array.from({ length: 8 }).map((_, index) => ({
    contractOrMint: `0x${index}`
  }));

  const balances = await batcher.resolveBalances({
    chain: { family: 'evm' },
    walletAddress: '0xabc',
    tokens
  });

  assert.equal(balances.length, 8);
  assert.equal(evmCalls, 3);
});
