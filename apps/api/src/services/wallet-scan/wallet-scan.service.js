import { normalizeAddressForChain } from '../shared/address-normalization.js';

function nowIso() {
  return new Date().toISOString();
}

export function createWalletScanService({
  chainsRepository,
  walletsRepository,
  tokenUniverseRepository,
  scansRepository,
  trackedTokensRepository,
  balanceBatcher
}) {
  async function runScan({ walletId }) {
    const wallet = await walletsRepository.getWalletById(walletId);
    if (!wallet) {
      throw new Error(`Wallet not found: ${walletId}`);
    }

    const chain = await chainsRepository.getChainById(wallet.chainId);
    if (!chain) {
      throw new Error(`Chain not found for wallet: ${wallet.chainId}`);
    }

    const snapshot = await tokenUniverseRepository.getLatestScanEligibleSnapshot(wallet.chainId);
    if (!snapshot) {
      throw new Error(`No scan-eligible universe snapshot for chain: ${wallet.chainId}`);
    }

    const run = await scansRepository.createScanRun({
      walletId: wallet.id,
      chainId: wallet.chainId,
      universeSnapshotId: snapshot.id,
      status: 'running',
      startedAt: nowIso()
    });

    try {
      const universeItems = await tokenUniverseRepository.getSnapshotItems(snapshot.id);
      const universeByAddress = new Map(
        universeItems.map((item) => [
          normalizeAddressForChain({ family: chain.family, address: item.contractOrMint }),
          item
        ])
      );
      const balances = await balanceBatcher.resolveBalances({
        chain,
        walletAddress: wallet.address,
        tokens: universeItems.map((item) => ({
          contractOrMint: item.contractOrMint,
          symbol: item.symbol,
          name: item.name,
          decimals: item.decimals
        }))
      });

      let autoTrackedCount = 0;
      for (const balance of balances) {
        const normalizedContract = normalizeAddressForChain({
          family: chain.family,
          address: balance.contractOrMint
        });
        const tokenMetadata = universeByAddress.get(normalizedContract);
        const heldFlag = Number(balance.balanceNormalized) > 0;
        let tokenId = null;
        let autoTrackedFlag = false;

        if (heldFlag) {
          const token = await trackedTokensRepository.upsertTrackedToken({
            chainId: wallet.chainId,
            contractOrMint: normalizedContract,
            symbol: tokenMetadata?.symbol ?? null,
            name: tokenMetadata?.name ?? null,
            decimals: tokenMetadata?.decimals ?? null,
            metadataSource: 'auto',
            trackingSource: 'scan'
          });
          tokenId = token.id;
          autoTrackedFlag = true;
          autoTrackedCount += 1;
        }

        await scansRepository.upsertScanItem({
          scanId: run.id,
          tokenId,
          contractOrMint: normalizedContract,
          balanceRaw: balance.balanceRaw,
          balanceNormalized: balance.balanceNormalized,
          heldFlag,
          autoTrackedFlag,
          usdValue: null,
          valuationStatus: 'unknown'
        });
      }

      const completedRun = await scansRepository.updateScanRun(run.id, {
        status: 'success',
        finishedAt: nowIso(),
        errorMessage: null
      });

      return {
        scanRun: completedRun,
        autoTrackedCount,
        universeSnapshotId: snapshot.id
      };
    } catch (error) {
      await scansRepository.updateScanRun(run.id, {
        status: 'failed',
        finishedAt: nowIso(),
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  return {
    rescanWallet: runScan,
    runScan
  };
}
