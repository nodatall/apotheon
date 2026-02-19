import { Router } from 'express';

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
      if (wallet) {
        try {
          scan = await walletScanService.rescanWallet({ walletId: wallet.id });
        } catch (error) {
          scanError = error instanceof Error ? error.message : String(error);
        }
      }

      res.status(201).json({
        data: {
          ...token,
          walletScanId: scan?.scanRun?.id ?? null,
          walletScanStatus: scan?.scanRun?.status ?? null,
          walletScanError: scanError
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
