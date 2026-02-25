import { Router } from 'express';

function deriveWalletScanStatus({ scanRunStatus, scanSummary, scanError }) {
  if (scanRunStatus) {
    return scanRunStatus;
  }

  if (!scanSummary) {
    return scanError ? 'failed' : null;
  }

  if (scanError && scanSummary.attemptedWalletCount === 0) {
    return 'failed';
  }

  if (scanSummary.attemptedWalletCount === 0) {
    return 'skipped';
  }

  return scanSummary.failedWalletCount > 0 ? 'partial' : 'success';
}

export function createAssetsRouter({
  chainsRepository,
  walletsRepository,
  walletScanService,
  manualTokenService,
  trackedTokensRepository
}) {
  const router = Router();

  router.get('/tokens', async (req, res, next) => {
    try {
      const chainId = typeof req.query.chainId === 'string' ? req.query.chainId : null;
      const includeInactive = req.query.includeInactive === 'true';
      const tokens = await trackedTokensRepository.listTrackedTokens({ chainId, includeInactive });
      res.json({ data: tokens });
    } catch (error) {
      next(error);
    }
  });

  router.post('/tokens', async (req, res, next) => {
    const chainId = typeof req.body?.chainId === 'string' ? req.body.chainId.trim() : '';
    const contractOrMint =
      typeof req.body?.contractOrMint === 'string' ? req.body.contractOrMint.trim() : '';
    const walletId = typeof req.body?.walletId === 'string' ? req.body.walletId.trim() : '';

    if (!chainId || !contractOrMint) {
      res.status(400).json({ error: 'chainId and contractOrMint are required.' });
      return;
    }

    let decimals;
    if (req.body?.decimals !== undefined) {
      const parsedDecimals = Number(req.body.decimals);
      if (!Number.isInteger(parsedDecimals) || parsedDecimals < 0) {
        res.status(400).json({ error: 'decimals must be a non-negative integer when provided.' });
        return;
      }
      decimals = parsedDecimals;
    }

    try {
      const chain = await chainsRepository.getChainById(chainId);
      if (!chain) {
        res.status(400).json({ error: 'Unknown chainId.' });
        return;
      }
      let wallet = null;
      if (walletId) {
        wallet = await walletsRepository.getWalletById(walletId);
        if (!wallet) {
          res.status(400).json({ error: 'Unknown walletId.' });
          return;
        }

        if (wallet.chainId !== chainId) {
          res.status(400).json({ error: 'walletId must belong to the provided chainId.' });
          return;
        }
      }

      const token = await manualTokenService.registerManualToken({
        chain,
        contractOrMint,
        symbol: req.body?.symbol,
        name: req.body?.name,
        decimals
      });

      let scan = null;
      let scanError = null;
      let scanSummary = null;
      if (wallet) {
        try {
          scan = await walletScanService.rescanWallet({ walletId: wallet.id });
        } catch (error) {
          scanError = error instanceof Error ? error.message : String(error);
        }
      } else {
        let chainWallets = [];
        try {
          const listedWallets = await walletsRepository.listWallets({ chainId, includeInactive: false });
          chainWallets = Array.isArray(listedWallets) ? listedWallets : [];
        } catch (error) {
          scanError = error instanceof Error ? error.message : String(error);
          scanSummary = {
            mode: 'chain_wallets',
            chainId,
            attemptedWalletCount: 0,
            successfulWalletCount: 0,
            failedWalletCount: 0,
            failures: [],
            message: 'Token added, but failed to load active addresses for scan.'
          };
        }

        if (!scanSummary) {
          const failures = [];
          let attemptedWalletCount = 0;

          for (const chainWallet of chainWallets) {
            attemptedWalletCount += 1;
            try {
              await walletScanService.rescanWallet({ walletId: chainWallet.id });
            } catch (error) {
              failures.push({
                walletId: chainWallet.id,
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }

          const failedWalletCount = failures.length;
          const successfulWalletCount = attemptedWalletCount - failedWalletCount;
          const hasFailures = failedWalletCount > 0;
          scanSummary = {
            mode: 'chain_wallets',
            chainId,
            attemptedWalletCount,
            successfulWalletCount,
            failedWalletCount,
            failures,
            message:
              attemptedWalletCount === 0
                ? 'No active addresses on this chain to scan.'
                : hasFailures
                  ? `Rescanned ${successfulWalletCount}/${attemptedWalletCount} addresses.`
                  : `Rescanned ${attemptedWalletCount} addresses.`
          };
          scanError = hasFailures
            ? `Failed to rescan ${failedWalletCount} address${failedWalletCount === 1 ? '' : 'es'}.`
            : null;
        }
      }

      res.status(201).json({
        data: {
          ...token,
          walletScanId: scan?.scanRun?.id ?? null,
          walletScanStatus: deriveWalletScanStatus({
            scanRunStatus: scan?.scanRun?.status ?? null,
            scanSummary,
            scanError
          }),
          walletScanError: scanError,
          scanSummary
        }
      });
    } catch (error) {
      if (error instanceof Error && /contractOrMint/.test(error.message)) {
        res.status(400).json({ error: error.message });
        return;
      }

      next(error);
    }
  });

  router.patch('/tokens/:id/activation', async (req, res, next) => {
    if (typeof req.body?.isActive !== 'boolean') {
      res.status(400).json({ error: 'isActive (boolean) is required.' });
      return;
    }

    try {
      const token = await trackedTokensRepository.setTrackedTokenActive(
        req.params.id,
        req.body.isActive
      );
      if (!token) {
        res.status(404).json({ error: 'Tracked token not found.' });
        return;
      }

      res.json({ data: token });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
