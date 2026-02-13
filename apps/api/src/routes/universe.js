import { Router } from 'express';

function isValidDateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function createUniverseRouter({
  tokenUniverseRepository,
  universeRefreshService
}) {
  const universeRouter = Router();

  universeRouter.get('/:chainId/active', async (req, res, next) => {
    try {
      const snapshot = await tokenUniverseRepository.getLatestScanEligibleSnapshot(
        req.params.chainId
      );

      if (!snapshot) {
        res.status(404).json({ error: 'No scan-eligible universe snapshot found for chain.' });
        return;
      }

      const withItems = await tokenUniverseRepository.getSnapshotWithItems(snapshot.id);
      res.json({ data: withItems });
    } catch (error) {
      next(error);
    }
  });

  universeRouter.get('/:chainId/latest', async (req, res, next) => {
    try {
      const latest = await tokenUniverseRepository.getLatestSnapshotByChain(req.params.chainId);
      if (!latest) {
        res.status(404).json({ error: 'No universe snapshots found for chain.' });
        return;
      }

      const active = await tokenUniverseRepository.getLatestScanEligibleSnapshot(req.params.chainId);

      res.json({
        data: {
          latest,
          activeSnapshotId: active?.id ?? null
        }
      });
    } catch (error) {
      next(error);
    }
  });

  universeRouter.post('/:chainId/refresh', async (req, res, next) => {
    const asOfDateUtc = req.body?.asOfDateUtc;
    if (asOfDateUtc !== undefined && !isValidDateOnly(asOfDateUtc)) {
      res.status(400).json({ error: 'asOfDateUtc must be YYYY-MM-DD when provided.' });
      return;
    }

    try {
      const outcome = await universeRefreshService.refreshChainById({
        chainId: req.params.chainId,
        asOfDateUtc
      });

      res.status(202).json({
        data: outcome
      });
    } catch (error) {
      if (error instanceof Error && /Chain not found/.test(error.message)) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  return universeRouter;
}
