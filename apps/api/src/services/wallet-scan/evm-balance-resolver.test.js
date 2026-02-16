import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvmBalanceResolver } from './evm-balance-resolver.js';

test('evm-balance-resolver: token-level RPC failures degrade to zero balance', async () => {
  const calls = [];
  const resolver = createEvmBalanceResolver({
    fetchImpl: async (_url, options) => {
      const payload = JSON.parse(options.body);
      const contract = payload.params[0].to.toLowerCase();
      calls.push(contract);

      if (contract === '0x00000000000000000000000000000000000000b2') {
        return {
          ok: true,
          json: async () => ({ error: { message: 'execution reverted' } })
        };
      }

      return {
        ok: true,
        json: async () => ({ result: '0x1' })
      };
    }
  });

  const balances = await resolver({
    chain: {
      family: 'evm',
      rpcUrl: 'https://example.invalid'
    },
    walletAddress: '0x00000000000000000000000000000000000000a1',
    tokens: [
      { contractOrMint: '0x00000000000000000000000000000000000000b1', decimals: 0 },
      { contractOrMint: '0x00000000000000000000000000000000000000b2', decimals: 0 }
    ]
  });

  assert.ok(calls.length >= 2);
  assert.equal(balances[0].contractOrMint, '0x00000000000000000000000000000000000000b1');
  assert.equal(balances[0].balanceNormalized, 1);
  assert.equal(balances[0].resolutionError, false);
  assert.equal(balances[1].contractOrMint, '0x00000000000000000000000000000000000000b2');
  assert.equal(balances[1].balanceRaw, '0x0');
  assert.equal(balances[1].balanceNormalized, 0);
  assert.equal(balances[1].resolutionError, true);
});

test('evm-balance-resolver: native token uses eth_getBalance', async () => {
  const methods = [];
  const resolver = createEvmBalanceResolver({
    fetchImpl: async (_url, options) => {
      const payload = JSON.parse(options.body);
      methods.push(payload.method);

      return {
        ok: true,
        json: async () =>
          payload.method === 'eth_getBalance'
            ? { result: '0x16345785d8a0000' }
            : { result: '0x0' }
      };
    }
  });

  const balances = await resolver({
    chain: {
      family: 'evm',
      rpcUrl: 'https://example.invalid'
    },
    walletAddress: '0x00000000000000000000000000000000000000a1',
    tokens: [{ contractOrMint: 'native:arbitrum', isNative: true, decimals: 18 }]
  });

  assert.equal(methods[0], 'eth_getBalance');
  assert.equal(balances[0].contractOrMint, 'native:arbitrum');
  assert.equal(balances[0].balanceNormalized, 0.1);
});

test('evm-balance-resolver: resolves ERC20 decimals for non-zero balances when unknown', async () => {
  const calls = [];
  const resolver = createEvmBalanceResolver({
    fetchImpl: async (_url, options) => {
      const payload = JSON.parse(options.body);
      calls.push(payload.method);

      if (payload.method === 'eth_call' && payload.params?.[0]?.data === '0x313ce567') {
        return {
          ok: true,
          json: async () => ({ result: '0x6' })
        };
      }

      return {
        ok: true,
        json: async () => ({ result: '0x475d6fd07' })
      };
    }
  });

  const balances = await resolver({
    chain: {
      family: 'evm',
      rpcUrl: 'https://example.invalid'
    },
    walletAddress: '0x00000000000000000000000000000000000000a1',
    tokens: [{ contractOrMint: '0x00000000000000000000000000000000000000b1' }]
  });

  assert.equal(calls.filter((method) => method === 'eth_call').length, 2);
  assert.equal(balances[0].contractOrMint, '0x00000000000000000000000000000000000000b1');
  assert.equal(balances[0].balanceNormalized, 19156.892935);
});

test('evm-balance-resolver: falls back to secondary RPC URL when primary fails', async () => {
  const seenUrls = [];
  const resolver = createEvmBalanceResolver({
    fetchImpl: async (url, options) => {
      seenUrls.push(url);
      if (url === 'https://primary.invalid') {
        return {
          ok: false,
          status: 429,
          json: async () => ({})
        };
      }

      const payload = JSON.parse(options.body);
      if (payload.method === 'eth_call' && payload.params?.[0]?.data === '0x313ce567') {
        return {
          ok: true,
          json: async () => ({ result: '0x6' })
        };
      }

      return {
        ok: true,
        json: async () => ({ result: '0x12d687' })
      };
    }
  });

  const balances = await resolver({
    chain: {
      family: 'evm',
      slug: 'ethereum',
      rpcUrl: 'https://primary.invalid'
    },
    walletAddress: '0x00000000000000000000000000000000000000a1',
    tokens: [{ contractOrMint: '0x00000000000000000000000000000000000000b1' }]
  });

  assert.equal(seenUrls[0], 'https://primary.invalid');
  assert.ok(seenUrls.includes('https://ethereum.publicnode.com'));
  assert.equal(balances[0].balanceNormalized, 1.234567);
});
