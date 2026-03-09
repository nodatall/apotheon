function utcDate(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

export function createScheduler({
  chainsRepository,
  walletsRepository,
  walletScanService,
  trackedTokensRepository,
  tokenUniverseRepository,
  universeRefreshService,
  dailySnapshotService,
  logger = console,
  now = () => new Date()
}) {
  let cycleRunning = false;
  let lastCycleSummary = null;

  function isChainSupportedForAutoScan(chain) {
    return chain?.family === 'evm';
  }

  async function syncCatalogFromSnapshot({ chainId, snapshotId }) {
    if (
      !snapshotId ||
      !tokenUniverseRepository?.getSnapshotItems ||
      !trackedTokensRepository?.upsertTrackedTokensBatch
    ) {
      return {
        consideredCount: 0,
        upsertedCount: 0
      };
    }

    const snapshotItems = await tokenUniverseRepository.getSnapshotItems(snapshotId);
    const upserted = await trackedTokensRepository.upsertTrackedTokensBatch({
      chainId,
      tokens: snapshotItems,
      metadataSource: 'auto',
      trackingSource: 'scan'
    });

    return {
      consideredCount: snapshotItems.length,
      upsertedCount: upserted.length
    };
  }

  async function runAutoScanCycle() {
    const startedAt = now();
    const asOfDateUtc = utcDate(startedAt);

    if (cycleRunning) {
      return {
        skipped: true,
        reason: 'in_progress',
        asOfDateUtc,
        startedAt: startedAt.toISOString(),
        finishedAt: now().toISOString(),
        previous: lastCycleSummary
      };
    }

    cycleRunning = true;
    try {
      const activeWallets = walletsRepository?.listWallets
        ? await walletsRepository.listWallets({ includeInactive: false })
        : [];
      const walletsByChainId = new Map();
      for (const wallet of activeWallets) {
        if (!wallet?.chainId) {
          continue;
        }
        const byChain = walletsByChainId.get(wallet.chainId) ?? [];
        byChain.push(wallet);
        walletsByChainId.set(wallet.chainId, byChain);
      }

      const targetChainIds = [...walletsByChainId.keys()];
      const allChains = chainsRepository?.listChains ? await chainsRepository.listChains() : [];
      const chainById = new Map(allChains.map((chain) => [chain.id, chain]));
      const targetChains = targetChainIds
        .map((chainId) => chainById.get(chainId))
        .filter(Boolean);

      const chainOutcomes = [];
      for (const chain of targetChains) {
        const chainWallets = walletsByChainId.get(chain.id) ?? [];
        if (!isChainSupportedForAutoScan(chain)) {
          chainOutcomes.push({
            chainId: chain.id,
            chainSlug: chain.slug,
            status: 'skipped',
            reason: 'unsupported_family',
            walletCount: chainWallets.length
          });
          continue;
        }

        let refresh = null;
        let refreshErrorMessage = null;
        try {
          refresh = await universeRefreshService.refreshChainById({
            chainId: chain.id,
            asOfDateUtc
          });
        } catch (error) {
          refreshErrorMessage = error instanceof Error ? error.message : String(error);
        }

        const catalog = refresh?.snapshotId
          ? await syncCatalogFromSnapshot({
              chainId: chain.id,
              snapshotId: refresh.snapshotId
            })
          : {
              consideredCount: 0,
              upsertedCount: 0
            };

        const rescanFailures = [];
        let rescannedWalletCount = 0;
        for (const wallet of chainWallets) {
          try {
            await walletScanService.rescanWallet({ walletId: wallet.id });
            rescannedWalletCount += 1;
          } catch (error) {
            rescanFailures.push({
              walletId: wallet.id,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        const failedWalletCount = rescanFailures.length;
        const hasWalletFailures = failedWalletCount > 0;
        const status =
          refreshErrorMessage && failedWalletCount === chainWallets.length && chainWallets.length > 0
            ? 'failed'
            : refreshErrorMessage || hasWalletFailures
              ? 'partial'
              : 'success';

        chainOutcomes.push({
          chainId: chain.id,
          chainSlug: chain.slug,
          status,
          refreshStatus: refresh?.status ?? null,
          refreshErrorMessage,
          walletCount: chainWallets.length,
          rescannedWalletCount,
          failedWalletCount,
          failures: rescanFailures,
          catalog
        });
      }

      const snapshot = await dailySnapshotService.runDailySnapshot({
        snapshotDateUtc: asOfDateUtc,
        force: true
      });
      const hasFailures = chainOutcomes.some((outcome) => outcome.status === 'failed');
      const hasPartials = chainOutcomes.some((outcome) => outcome.status === 'partial');
      const completedAt = now();
      const summary = {
        skipped: false,
        status: hasFailures ? 'failed' : hasPartials ? 'partial' : 'success',
        asOfDateUtc,
        startedAt: startedAt.toISOString(),
        finishedAt: completedAt.toISOString(),
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
        targetChainCount: targetChains.length,
        activeWalletCount: activeWallets.length,
        chainOutcomes,
        snapshot
      };
      lastCycleSummary = summary;
      return summary;
    } catch (error) {
      logger.error?.('Auto scan cycle failed:', error);
      const completedAt = now();
      const failedSummary = {
        skipped: false,
        status: 'failed',
        asOfDateUtc,
        startedAt: startedAt.toISOString(),
        finishedAt: completedAt.toISOString(),
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
        errorMessage: error instanceof Error ? error.message : String(error)
      };
      lastCycleSummary = failedSummary;
      return failedSummary;
    } finally {
      cycleRunning = false;
    }
  }

  return {
    getLastCycleSummary: () => lastCycleSummary,
    runAutoScanCycle,
    runDailyJobs: runAutoScanCycle
  };
}
