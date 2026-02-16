import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProtocolPositionResolver } from './protocol-position-resolver.js';

test('protocol-position-resolver: resolves balanceOf with decimals normalization', async () => {
  const seenPayloads = [];
  const resolver = createProtocolPositionResolver({
    fetchImpl: async (_url, init) => {
      const payload = JSON.parse(init.body);
      seenPayloads.push(payload);
      const callData = payload.params[0].data;

      if (callData.startsWith('0x70a08231')) {
        return {
          ok: true,
          json: async () => ({ result: '0x4d2' })
        };
      }

      if (callData.startsWith('0x313ce567')) {
        return {
          ok: true,
          json: async () => ({ result: '0x2' })
        };
      }

      return {
        ok: true,
        json: async () => ({ result: '0x0' })
      };
    }
  });

  const position = await resolver.resolvePosition({
    chain: {
      id: 'chain-1',
      family: 'evm',
      rpcUrl: 'https://rpc.example'
    },
    wallet: {
      id: 'wallet-1',
      address: '0x1234567890123456789012345678901234567890'
    },
    protocol: {
      id: 'protocol-1',
      label: 'Stake Pool',
      contractAddress: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      abiMapping: {
        positionRead: {
          function: 'balanceOf',
          args: ['$walletAddress'],
          returns: 'uint256'
        },
        decimalsRead: {
          function: 'decimals',
          args: [],
          returns: 'uint8'
        }
      }
    }
  });

  assert.equal(position.contractOrMint, '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
  assert.equal(position.symbol, 'Stake Pool');
  assert.equal(position.quantity, 12.34);
  assert.equal(seenPayloads.length, 2);
});

test('protocol-position-resolver: supports function names that already include signature syntax', async () => {
  const resolver = createProtocolPositionResolver({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ result: '0x64' })
    })
  });

  const position = await resolver.resolvePosition({
    chain: {
      id: 'chain-1',
      family: 'evm',
      rpcUrl: 'https://rpc.example'
    },
    wallet: {
      id: 'wallet-1',
      address: '0x1234567890123456789012345678901234567890'
    },
    protocol: {
      id: 'protocol-1',
      label: 'Stake Pool',
      contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      abiMapping: {
        positionRead: {
          function: 'balanceOf(address)',
          args: ['$walletAddress'],
          returns: 'uint256'
        }
      }
    }
  });

  assert.equal(position.quantity, 1e-16);
});

test('protocol-position-resolver: rejects unsupported read signatures', async () => {
  const resolver = createProtocolPositionResolver({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ result: '0x0' })
    })
  });

  await assert.rejects(
    () =>
      resolver.resolvePosition({
        chain: {
          id: 'chain-1',
          family: 'evm',
          rpcUrl: 'https://rpc.example'
        },
        wallet: {
          id: 'wallet-1',
          address: '0x1234567890123456789012345678901234567890'
        },
        protocol: {
          id: 'protocol-2',
          label: 'Custom Pool',
          contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          abiMapping: {
            positionRead: {
              function: 'customRead',
              args: ['$walletAddress'],
              returns: 'uint256'
            }
          }
        }
      }),
    /Unsupported protocol read signature/i
  );
});

test('protocol-position-resolver: rejects decimals above supported maximum', async () => {
  const resolver = createProtocolPositionResolver({
    fetchImpl: async (_url, init) => {
      const payload = JSON.parse(init.body);
      const callData = payload.params[0].data;
      if (callData.startsWith('0x313ce567')) {
        return {
          ok: true,
          json: async () => ({ result: '0x64' })
        };
      }
      return {
        ok: true,
        json: async () => ({ result: '0x1' })
      };
    }
  });

  await assert.rejects(
    () =>
      resolver.resolvePosition({
        chain: {
          id: 'chain-1',
          family: 'evm',
          rpcUrl: 'https://rpc.example'
        },
        wallet: {
          id: 'wallet-1',
          address: '0x1234567890123456789012345678901234567890'
        },
        protocol: {
          id: 'protocol-1',
          label: 'Stake Pool',
          contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          abiMapping: {
            positionRead: {
              function: 'balanceOf',
              args: ['$walletAddress'],
              returns: 'uint256'
            },
            decimalsRead: {
              function: 'decimals',
              args: [],
              returns: 'uint8'
            }
          }
        }
      }),
    /exceed supported maximum/i
  );
});
