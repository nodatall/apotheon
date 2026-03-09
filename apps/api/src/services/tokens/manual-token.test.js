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
    chain: { id: 'chain-1', family: 'evm' },
    contractOrMint: '0xABC',
    symbol: 'OVR'
  });

  assert.equal(token.symbol, 'OVR');
  assert.equal(token.metadataSource, 'manual_override');
  assert.equal(writes[0].trackingSource, 'manual');
  assert.equal(writes[0].contractOrMint, '0xabc');
});

test('manual-token: resolves metadata from EVM RPC when metadata client is unavailable', async () => {
  const writes = [];
  const calls = [];
  const service = createManualTokenService({
    trackedTokensRepository: {
      upsertTrackedToken: async (payload) => {
        writes.push(payload);
        return { id: 'token-rpc-1', ...payload };
      }
    },
    fetchImpl: async (_url, options) => {
      const payload = JSON.parse(options.body);
      calls.push(payload.params[0].data);

      if (payload.params[0].data === '0x95d89b41') {
        // symbol() -> "USDC"
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: payload.id,
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000020' +
              '0000000000000000000000000000000000000000000000000000000000000004' +
              '5553444300000000000000000000000000000000000000000000000000000000'
          })
        };
      }
      if (payload.params[0].data === '0x06fdde03') {
        // name() -> "USD Coin"
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: payload.id,
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000020' +
              '0000000000000000000000000000000000000000000000000000000000000008' +
              '55534420436f696e000000000000000000000000000000000000000000000000'
          })
        };
      }

      // decimals() -> 6
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: payload.id,
          result: '0x0000000000000000000000000000000000000000000000000000000000000006'
        })
      };
    }
  });

  const token = await service.registerManualToken({
    chain: {
      id: 'chain-ronin',
      family: 'evm',
      rpcUrl: 'https://api.roninchain.com/rpc'
    },
    contractOrMint: '0x0B7007c13325C48911F73A2daD5FA5dCBf808aDc'
  });

  assert.equal(calls.length, 3);
  assert.equal(token.symbol, 'USDC');
  assert.equal(token.name, 'USD Coin');
  assert.equal(token.decimals, 6);
  assert.equal(writes[0].metadataSource, 'auto');
});
