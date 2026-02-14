function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function resolveProtocolPositionResolver(protocolPositionResolver) {
  if (typeof protocolPositionResolver === 'function') {
    return protocolPositionResolver;
  }
  if (protocolPositionResolver && typeof protocolPositionResolver.resolvePosition === 'function') {
    return protocolPositionResolver.resolvePosition.bind(protocolPositionResolver);
  }
  return async () => null;
}

async function loadSnapshotEligibleProtocols({ protocolContractService, chainId }) {
  if (!protocolContractService) {
    return [];
  }

  if (typeof protocolContractService.listSnapshotEligibleContracts === 'function') {
    return protocolContractService.listSnapshotEligibleContracts({ chainId });
  }

  if (typeof protocolContractService.listProtocolContracts === 'function') {
    const all = await protocolContractService.listProtocolContracts({ chainId });
    return all.filter((item) => item.isActive && item.validationStatus === 'valid');
  }

  return [];
}

export function createDailySnapshotService({
  chainsRepository,
  walletsRepository,
  scansRepository,
  snapshotsRepository,
  valuationService,
  protocolContractService = null,
  protocolPositionResolver = null
}) {
  const resolveProtocolPosition = resolveProtocolPositionResolver(protocolPositionResolver);

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
      const protocolReadFailures = [];

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

        const valuedTokens =
          tokenPositions.length === 0
            ? []
            : await valuationService.valuatePositions({
                chain,
                positions: tokenPositions
              });

        for (const position of valuedTokens) {
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

        const protocols = await loadSnapshotEligibleProtocols({
          protocolContractService,
          chainId: wallet.chainId
        });

        for (const protocol of protocols) {
          try {
            const resolved = await resolveProtocolPosition({
              chain,
              wallet,
              protocol
            });

            if (!resolved) {
              continue;
            }

            const quantity = Number(resolved.quantity);
            if (!Number.isFinite(quantity)) {
              throw new Error(`Invalid protocol quantity for ${protocol.id}`);
            }

            const [valuedPosition] = await valuationService.valuatePositions({
              chain,
              positions: [
                {
                  contractOrMint: resolved.contractOrMint ?? protocol.contractAddress,
                  quantity,
                  symbol: resolved.symbol ?? protocol.label
                }
              ]
            });

            if (valuedPosition.valuationStatus === 'unknown') {
              unknownCount += 1;
            }

            await snapshotsRepository.upsertSnapshotItem({
              snapshotId: running.id,
              walletId: wallet.id,
              assetType: 'protocol_position',
              assetRefId: protocol.id,
              symbol: valuedPosition.symbol ?? protocol.label,
              quantity: valuedPosition.quantity,
              usdPrice: valuedPosition.usdPrice,
              usdValue: valuedPosition.usdValue,
              valuationStatus: valuedPosition.valuationStatus
            });
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            protocolReadFailures.push(`${protocol.label || protocol.id}: ${reason}`);
          }
        }
      }

      const status = unknownCount > 0 || protocolReadFailures.length > 0 ? 'partial' : 'success';
      const completed = await snapshotsRepository.upsertDailySnapshot({
        snapshotDateUtc,
        status,
        startedAt: running.startedAt,
        finishedAt: new Date().toISOString(),
        errorMessage:
          protocolReadFailures.length > 0
            ? `Protocol position read failures: ${protocolReadFailures.join(' | ')}`
            : null
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
