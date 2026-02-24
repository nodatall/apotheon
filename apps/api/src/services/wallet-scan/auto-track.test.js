import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWalletScanService } from './wallet-scan.service.js';

test('auto-track: only positive balances become auto-tracked', async () => {
  const trackedContracts = [];
  const upsertedItems = [];

  const service = createWalletScanService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-1', family: 'evm' })
    },
    walletsRepository: {
      getWalletById: async () => ({ id: 'wallet-1', chainId: 'chain-1', address: '0xabc' })
    },
    tokenUniverseRepository: {
      getLatestScanEligibleSnapshot: async () => ({ id: 'snapshot-1' }),
      getSnapshotItems: async () => [
        { contractOrMint: '0xA', symbol: 'A' },
        { contractOrMint: '0xB', symbol: 'B' }
      ]
    },
    scansRepository: {
      createScanRun: async (input) => ({ id: 'scan-1', ...input }),
      updateScanRun: async (id, changes) => ({ id, ...changes }),
      upsertScanItem: async (item) => {
        upsertedItems.push(item);
        return item;
      }
    },
    trackedTokensRepository: {
      upsertTrackedToken: async ({ contractOrMint }) => {
        trackedContracts.push(contractOrMint);
        return { id: `token-${contractOrMint}` };
      }
    },
    balanceBatcher: {
      resolveBalances: async () => [
        { contractOrMint: '0xA', balanceRaw: '5', balanceNormalized: 5 },
        { contractOrMint: '0xB', balanceRaw: '0', balanceNormalized: 0 }
      ]
    }
  });

  const result = await service.runScan({ walletId: 'wallet-1' });

  assert.equal(result.autoTrackedCount, 1);
  assert.deepEqual(trackedContracts, ['0xa']);
  assert.equal(upsertedItems.find((item) => item.contractOrMint === '0xa').autoTrackedFlag, true);
  assert.equal(upsertedItems.find((item) => item.contractOrMint === '0xb').autoTrackedFlag, false);
});

test('auto-track: scan includes manually tracked tokens and preserves token linkage', async () => {
  const upsertedItems = [];

  const service = createWalletScanService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-1', family: 'evm' })
    },
    walletsRepository: {
      getWalletById: async () => ({ id: 'wallet-1', chainId: 'chain-1', address: '0xabc' })
    },
    tokenUniverseRepository: {
      getLatestScanEligibleSnapshot: async () => ({ id: 'snapshot-1' }),
      getSnapshotItems: async () => [{ contractOrMint: '0xAAA', symbol: 'AAA' }]
    },
    scansRepository: {
      createScanRun: async (input) => ({ id: 'scan-1', ...input }),
      updateScanRun: async (id, changes) => ({ id, ...changes }),
      upsertScanItem: async (item) => {
        upsertedItems.push(item);
        return item;
      }
    },
    trackedTokensRepository: {
      listTrackedTokens: async () => [
        {
          id: 'token-manual-1',
          chainId: 'chain-1',
          contractOrMint: '0xBBB',
          symbol: 'BBB',
          name: 'Token B'
        }
      ],
      upsertTrackedToken: async () => ({ id: 'unused-auto-token' })
    },
    valuationService: {
      valuatePositions: async () => [
        {
          contractOrMint: '0xbbb',
          usdValue: 20,
          valuationStatus: 'known'
        }
      ]
    },
    balanceBatcher: {
      resolveBalances: async () => [
        { contractOrMint: '0xAAA', balanceRaw: '0', balanceNormalized: 0 },
        { contractOrMint: '0xBBB', balanceRaw: '2', balanceNormalized: 2 }
      ]
    }
  });

  const result = await service.runScan({ walletId: 'wallet-1' });

  assert.equal(result.autoTrackedCount, 0);
  const manualTokenRow = upsertedItems.find((item) => item.contractOrMint === '0xbbb');
  assert.equal(manualTokenRow.tokenId, 'token-manual-1');
  assert.equal(manualTokenRow.autoTrackedFlag, false);
  assert.equal(manualTokenRow.usdValue, 20);
  assert.equal(manualTokenRow.valuationStatus, 'known');
});

test('auto-track: evm native asset is scanned and valued through wrapped native contract', async () => {
  const upsertedItems = [];
  let seenNativeToken = false;
  let seenNativeValuationRef = null;

  const service = createWalletScanService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-1', slug: 'arbitrum', family: 'evm' })
    },
    walletsRepository: {
      getWalletById: async () => ({ id: 'wallet-1', chainId: 'chain-1', address: '0xabc' })
    },
    tokenUniverseRepository: {
      getLatestScanEligibleSnapshot: async () => ({ id: 'snapshot-1' }),
      getSnapshotItems: async () => []
    },
    scansRepository: {
      createScanRun: async (input) => ({ id: 'scan-1', ...input }),
      updateScanRun: async (id, changes) => ({ id, ...changes }),
      upsertScanItem: async (item) => {
        upsertedItems.push(item);
        return item;
      }
    },
    trackedTokensRepository: {
      listTrackedTokens: async () => [],
      upsertTrackedToken: async ({ contractOrMint }) => ({ id: `token-${contractOrMint}` })
    },
    valuationService: {
      valuatePositions: async (input) => {
        seenNativeValuationRef = input.positions[0].valuationContractOrMint;
        return [
          {
            contractOrMint: 'native:arbitrum',
            usdValue: 150,
            valuationStatus: 'known'
          }
        ];
      }
    },
    balanceBatcher: {
      resolveBalances: async ({ tokens }) => {
        seenNativeToken = tokens.some(
          (token) => token.contractOrMint === 'native:arbitrum' && token.isNative === true
        );
        return [
          {
            contractOrMint: 'native:arbitrum',
            balanceRaw: '0x114cdc3e592343a',
            balanceNormalized: 0.0779,
            valuationContractOrMint: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'
          }
        ];
      }
    }
  });

  const result = await service.runScan({ walletId: 'wallet-1' });

  assert.equal(result.autoTrackedCount, 1);
  assert.equal(seenNativeToken, true);
  assert.equal(seenNativeValuationRef, '0x82af49447d8a07e3bd95bd0d56f35241523fbab1');
  const nativeRow = upsertedItems.find((item) => item.contractOrMint === 'native:arbitrum');
  assert.equal(nativeRow.usdValue, 150);
  assert.equal(nativeRow.valuationStatus, 'known');
});

test('auto-track: solana native asset uses 9 decimals in scan token metadata', async () => {
  let seenNativeDecimals = null;

  const service = createWalletScanService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-sol', slug: 'solana', family: 'solana' })
    },
    walletsRepository: {
      getWalletById: async () => ({ id: 'wallet-sol', chainId: 'chain-sol', address: 'So11111111111111111111111111111111111111112' })
    },
    tokenUniverseRepository: {
      getLatestScanEligibleSnapshot: async () => ({ id: 'snapshot-sol' }),
      getSnapshotItems: async () => []
    },
    scansRepository: {
      createScanRun: async (input) => ({ id: 'scan-sol', ...input }),
      updateScanRun: async (id, changes) => ({ id, ...changes }),
      upsertScanItem: async () => ({})
    },
    trackedTokensRepository: {
      listTrackedTokens: async () => [],
      upsertTrackedToken: async () => ({ id: 'token-sol-native' })
    },
    balanceBatcher: {
      resolveBalances: async ({ tokens }) => {
        seenNativeDecimals = tokens.find((token) => token.contractOrMint === 'native:solana')?.decimals;
        return [
          {
            contractOrMint: 'native:solana',
            balanceRaw: '1',
            balanceNormalized: 1
          }
        ];
      }
    }
  });

  await service.runScan({ walletId: 'wallet-sol' });
  assert.equal(seenNativeDecimals, 9);
});

test('auto-track: polygon native mapped contract alias is deduped into a single POL native row', async () => {
  let scannedContracts = [];
  const upsertedItems = [];
  const autoTrackedContracts = [];

  const service = createWalletScanService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-polygon', slug: 'polygon', family: 'evm' })
    },
    walletsRepository: {
      getWalletById: async () => ({ id: 'wallet-poly-1', chainId: 'chain-polygon', address: '0xabc' })
    },
    tokenUniverseRepository: {
      getLatestScanEligibleSnapshot: async () => ({ id: 'snapshot-poly-1' }),
      getSnapshotItems: async () => [
        {
          contractOrMint: '0x0000000000000000000000000000000000001010',
          symbol: 'POL'
        }
      ]
    },
    scansRepository: {
      createScanRun: async (input) => ({ id: 'scan-poly-1', ...input }),
      updateScanRun: async (id, changes) => ({ id, ...changes }),
      upsertScanItem: async (item) => {
        upsertedItems.push(item);
        return item;
      }
    },
    trackedTokensRepository: {
      listTrackedTokens: async () => [
        {
          id: 'token-poly-alias',
          chainId: 'chain-polygon',
          contractOrMint: '0x0000000000000000000000000000000000001010',
          symbol: 'MATIC'
        }
      ],
      upsertTrackedToken: async ({ contractOrMint }) => {
        autoTrackedContracts.push(contractOrMint);
        return { id: `token-${contractOrMint}` };
      }
    },
    balanceBatcher: {
      resolveBalances: async ({ tokens }) => {
        scannedContracts = tokens.map((token) => token.contractOrMint);
        return [
          {
            contractOrMint: 'native:polygon',
            balanceRaw: '1',
            balanceNormalized: 1,
            valuationContractOrMint: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'
          }
        ];
      }
    }
  });

  const outcome = await service.runScan({ walletId: 'wallet-poly-1' });

  assert.equal(outcome.autoTrackedCount, 1);
  assert.deepEqual(scannedContracts, ['native:polygon']);
  assert.deepEqual(autoTrackedContracts, ['native:polygon']);
  assert.equal(upsertedItems.length, 1);
  assert.equal(upsertedItems[0].contractOrMint, 'native:polygon');
});
