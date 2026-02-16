import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDailySnapshotService } from './daily-snapshot.service.js';

test('snapshot-batching: valuation pipeline is invoked with batched token positions', async () => {
  const valuationCalls = [];

  const service = createDailySnapshotService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-1', family: 'evm' })
    },
    walletsRepository: {
      listWallets: async () => [{ id: 'wallet-1', chainId: 'chain-1' }]
    },
    scansRepository: {
      getLatestSuccessfulScanItemsByWallet: async () =>
        Array.from({ length: 5 }).map((_, index) => ({
          contractOrMint: `0x${index}`,
          balanceNormalized: 1,
          tokenId: `token-${index}`
        }))
    },
    snapshotsRepository: {
      getDailySnapshotByDate: async () => null,
      upsertDailySnapshot: async (payload) => ({ id: 'snapshot-1', ...payload }),
      upsertSnapshotItem: async () => ({})
    },
    valuationService: {
      valuatePositions: async ({ positions }) => {
        valuationCalls.push(positions.length);
        return positions.map((position) => ({
          ...position,
          usdPrice: 1,
          usdValue: position.quantity,
          valuationStatus: 'known'
        }));
      }
    }
  });

  await service.runDailySnapshot({ snapshotDateUtc: '2026-02-13' });
  assert.equal(valuationCalls.length, 1);
  assert.equal(valuationCalls[0], 5);
});

test('snapshot-batching: protocol positions are persisted with unknown valuation semantics', async () => {
  const snapshotWrites = [];
  const itemWrites = [];

  const service = createDailySnapshotService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-1', family: 'evm' })
    },
    walletsRepository: {
      listWallets: async () => [{ id: 'wallet-1', chainId: 'chain-1' }]
    },
    scansRepository: {
      getLatestSuccessfulScanItemsByWallet: async () => []
    },
    snapshotsRepository: {
      getDailySnapshotByDate: async () => null,
      upsertDailySnapshot: async (payload) => {
        snapshotWrites.push(payload);
        return { id: 'snapshot-1', ...payload };
      },
      upsertSnapshotItem: async (payload) => {
        itemWrites.push(payload);
        return payload;
      }
    },
    valuationService: {
      valuatePositions: async ({ positions }) =>
        positions.map((position) => ({
          ...position,
          usdPrice: null,
          usdValue: null,
          valuationStatus: 'unknown'
        }))
    },
    protocolContractService: {
      listSnapshotEligibleContracts: async () => [
        {
          id: 'protocol-1',
          chainId: 'chain-1',
          contractAddress: '0xproto',
          label: 'Stake Pool',
          category: 'staking',
          validationStatus: 'valid',
          isActive: true
        }
      ]
    },
    protocolPositionResolver: async () => ({
      contractOrMint: '0xproto',
      symbol: 'sPOOL',
      quantity: 42
    })
  });

  await service.runDailySnapshot({ snapshotDateUtc: '2026-02-13' });

  assert.equal(itemWrites.length, 1);
  assert.equal(itemWrites[0].assetType, 'protocol_position');
  assert.equal(itemWrites[0].quantity, 42);
  assert.equal(itemWrites[0].usdValue, null);
  assert.equal(itemWrites[0].valuationStatus, 'unknown');
  assert.equal(snapshotWrites[snapshotWrites.length - 1].status, 'partial');
});

test('snapshot-batching: protocol read failures degrade snapshot to partial and keep successful rows', async () => {
  const snapshotWrites = [];
  const itemWrites = [];

  const service = createDailySnapshotService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-1', family: 'evm' })
    },
    walletsRepository: {
      listWallets: async () => [{ id: 'wallet-1', chainId: 'chain-1' }]
    },
    scansRepository: {
      getLatestSuccessfulScanItemsByWallet: async () => [
        { contractOrMint: '0xtoken', balanceNormalized: 10, tokenId: 'token-1' }
      ]
    },
    snapshotsRepository: {
      getDailySnapshotByDate: async () => null,
      upsertDailySnapshot: async (payload) => {
        snapshotWrites.push(payload);
        return { id: 'snapshot-1', ...payload };
      },
      upsertSnapshotItem: async (payload) => {
        itemWrites.push(payload);
        return payload;
      }
    },
    valuationService: {
      valuatePositions: async ({ positions }) =>
        positions.map((position) => ({
          ...position,
          usdPrice: 2,
          usdValue: Number(position.quantity) * 2,
          valuationStatus: 'known'
        }))
    },
    protocolContractService: {
      listSnapshotEligibleContracts: async () => [
        {
          id: 'protocol-bad',
          chainId: 'chain-1',
          contractAddress: '0xbad',
          label: 'Broken Protocol',
          category: 'staking',
          validationStatus: 'valid',
          isActive: true
        },
        {
          id: 'protocol-good',
          chainId: 'chain-1',
          contractAddress: '0xgood',
          label: 'Good Protocol',
          category: 'staking',
          validationStatus: 'valid',
          isActive: true
        }
      ]
    },
    protocolPositionResolver: async ({ protocol }) => {
      if (protocol.id === 'protocol-bad') {
        throw new Error('rpc timeout');
      }

      return {
        contractOrMint: protocol.contractAddress,
        symbol: 'gPOOL',
        quantity: 5
      };
    }
  });

  await service.runDailySnapshot({ snapshotDateUtc: '2026-02-13' });

  assert.equal(itemWrites.length, 2);
  assert.ok(itemWrites.some((item) => item.assetType === 'token'));
  assert.ok(
    itemWrites.some((item) => item.assetType === 'protocol_position' && item.assetRefId === 'protocol-good')
  );
  const completed = snapshotWrites[snapshotWrites.length - 1];
  assert.equal(completed.status, 'partial');
  assert.match(completed.errorMessage, /Broken Protocol/i);
});

test('snapshot-batching: missing protocol resolver is surfaced as partial failure', async () => {
  const snapshotWrites = [];

  const service = createDailySnapshotService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-1', family: 'evm' })
    },
    walletsRepository: {
      listWallets: async () => [{ id: 'wallet-1', chainId: 'chain-1' }]
    },
    scansRepository: {
      getLatestSuccessfulScanItemsByWallet: async () => []
    },
    snapshotsRepository: {
      getDailySnapshotByDate: async () => null,
      upsertDailySnapshot: async (payload) => {
        snapshotWrites.push(payload);
        return { id: 'snapshot-1', ...payload };
      },
      upsertSnapshotItem: async () => ({})
    },
    valuationService: {
      valuatePositions: async ({ positions }) => positions
    },
    protocolContractService: {
      listSnapshotEligibleContracts: async () => [
        {
          id: 'protocol-1',
          chainId: 'chain-1',
          contractAddress: '0xproto',
          label: 'Protocol One',
          category: 'staking',
          validationStatus: 'valid',
          isActive: true
        }
      ]
    }
  });

  await service.runDailySnapshot({ snapshotDateUtc: '2026-02-13' });

  const completed = snapshotWrites[snapshotWrites.length - 1];
  assert.equal(completed.status, 'partial');
  assert.match(completed.errorMessage, /not configured/i);
});
