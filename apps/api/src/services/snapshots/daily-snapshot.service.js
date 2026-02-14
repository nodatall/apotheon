function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

export function createDailySnapshotService({
  chainsRepository,
  walletsRepository,
  scansRepository,
  snapshotsRepository,
  valuationService
}) {
  async function runDailySnapshot({ snapshotDateUtc = todayUtcDate(), force = false } = {}) {
    const existing = await snapshotsRepository.getDailySnapshotByDate(snapshotDateUtc);
    if (existing && !force && (existing.status === 'success' || existing.status === 'partial')) {
      return {
        snapshot: existing,
        skipped: true
      };
    }

    const running = await snapshotsRepository.upsertDailySnapshot({
      snapshotDateUtc,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      errorMessage: null
    });

    try {
      const wallets = await walletsRepository.listWallets();
      let unknownCount = 0;

      for (const wallet of wallets) {
        const chain = await chainsRepository.getChainById(wallet.chainId);
        if (!chain) {
          continue;
        }

        const scanItems = await scansRepository.getLatestSuccessfulScanItemsByWallet(wallet.id);
        const tokenPositions = scanItems.map((item) => ({
          contractOrMint: item.contractOrMint,
          quantity: Number(item.balanceNormalized),
          symbol: null,
          walletId: wallet.id,
          tokenId: item.tokenId
        }));

        const valued = await valuationService.valuatePositions({
          chain,
          positions: tokenPositions
        });

        for (const position of valued) {
          if (position.valuationStatus === 'unknown') {
            unknownCount += 1;
          }

          await snapshotsRepository.upsertSnapshotItem({
            snapshotId: running.id,
            walletId: wallet.id,
            assetType: 'token',
            assetRefId: position.tokenId,
            symbol: position.symbol,
            quantity: position.quantity,
            usdPrice: position.usdPrice,
            usdValue: position.usdValue,
            valuationStatus: position.valuationStatus
          });
        }
      }

      const status = unknownCount > 0 ? 'partial' : 'success';
      const completed = await snapshotsRepository.upsertDailySnapshot({
        snapshotDateUtc,
        status,
        startedAt: running.startedAt,
        finishedAt: new Date().toISOString(),
        errorMessage: null
      });

      return {
        snapshot: completed,
        skipped: false
      };
    } catch (error) {
      const failed = await snapshotsRepository.upsertDailySnapshot({
        snapshotDateUtc,
        status: 'failed',
        finishedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      return {
        snapshot: failed,
        skipped: false
      };
    }
  }

  return {
    runDailySnapshot
  };
}
