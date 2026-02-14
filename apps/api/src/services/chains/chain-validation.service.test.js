import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChainValidationService } from './chain-validation.service.js';

test('validateCustomChain marks valid when RPC chain id matches', async () => {
  const validationService = createChainValidationService({
    lookup: async () => [{ address: '1.1.1.1' }],
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: '0xa4b1' })
    })
  });

  const result = await validationService.validateCustomChain({
    family: 'evm',
    chainId: 42161,
    rpcUrl: 'https://arb.example-rpc.dev'
  });

  assert.equal(result.validationStatus, 'valid');
  assert.equal(result.validationError, null);
});

test('validateCustomChain marks invalid when chain id mismatches', async () => {
  const validationService = createChainValidationService({
    lookup: async () => [{ address: '1.1.1.1' }],
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x1' })
    })
  });

  const result = await validationService.validateCustomChain({
    family: 'evm',
    chainId: 10,
    rpcUrl: 'https://optimism.example-rpc.dev'
  });

  assert.equal(result.validationStatus, 'invalid');
  assert.match(result.validationError, /chainId mismatch/i);
});

test('validateCustomChain marks invalid when RPC call fails', async () => {
  const validationService = createChainValidationService({
    lookup: async () => [{ address: '1.1.1.1' }],
    fetchImpl: async () => ({
      ok: false,
      status: 503
    })
  });

  const result = await validationService.validateCustomChain({
    family: 'solana',
    chainId: null,
    rpcUrl: 'https://solana.example-rpc.dev'
  });

  assert.equal(result.validationStatus, 'invalid');
  assert.match(result.validationError, /HTTP 503/i);
});
