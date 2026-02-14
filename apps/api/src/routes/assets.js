import { Router } from 'express';

export function createAssetsRouter({ chainsRepository, manualTokenService, trackedTokensRepository }) {
  const router = Router();

  router.get('/tokens', async (req, res, next) => {
    try {
      const chainId = typeof req.query.chainId === 'string' ? req.query.chainId : null;
      const tokens = await trackedTokensRepository.listTrackedTokens({ chainId });
      res.json({ data: tokens });
    } catch (error) {
      next(error);
    }
  });

  router.post('/tokens', async (req, res, next) => {
    const chainId = typeof req.body?.chainId === 'string' ? req.body.chainId.trim() : '';
    const contractOrMint =
      typeof req.body?.contractOrMint === 'string' ? req.body.contractOrMint.trim() : '';

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

      const token = await manualTokenService.registerManualToken({
        chain,
        contractOrMint,
        symbol: req.body?.symbol,
        name: req.body?.name,
        decimals
      });

      res.status(201).json({ data: token });
    } catch (error) {
      if (error instanceof Error && /contractOrMint/.test(error.message)) {
        res.status(400).json({ error: error.message });
        return;
      }

      next(error);
    }
  });

  return router;
}
