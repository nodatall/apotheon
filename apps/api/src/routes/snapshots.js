import { Router } from 'express';

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function createSnapshotsRouter({ dailySnapshotService, snapshotsRepository }) {
  const router = Router();

  router.post('/run', async (req, res, next) => {
    const snapshotDateUtc = req.body?.snapshotDateUtc;
    if (snapshotDateUtc !== undefined && !isDate(snapshotDateUtc)) {
      res.status(400).json({ error: 'snapshotDateUtc must be YYYY-MM-DD when provided.' });
      return;
    }

    try {
      const result = await dailySnapshotService.runDailySnapshot({
        snapshotDateUtc: snapshotDateUtc ?? undefined,
        force: Boolean(req.body?.force)
      });

      res.status(202).json({ data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get('/latest', async (_req, res, next) => {
    try {
      const latest = await snapshotsRepository.getLatestDailySnapshot();
      if (!latest) {
        res.status(404).json({ error: 'No snapshots found.' });
        return;
      }

      const items = await snapshotsRepository.getSnapshotItems(latest.id);
      res.json({ data: { ...latest, items } });
    } catch (error) {
      next(error);
    }
  });

  router.get('/jobs/status', async (_req, res, next) => {
    try {
      const latest = await snapshotsRepository.getLatestDailySnapshot();
      if (!latest) {
        res.status(404).json({ error: 'No snapshot runs found.' });
        return;
      }

      res.json({
        data: {
          status: latest.status,
          errorMessage: latest.errorMessage,
          snapshotDateUtc: latest.snapshotDateUtc,
          finishedAt: latest.finishedAt
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:snapshotDateUtc', async (req, res, next) => {
    if (!isDate(req.params.snapshotDateUtc)) {
      res.status(400).json({ error: 'snapshotDateUtc must be YYYY-MM-DD.' });
      return;
    }

    try {
      const snapshot = await snapshotsRepository.getDailySnapshotByDate(req.params.snapshotDateUtc);
      if (!snapshot) {
        res.status(404).json({ error: 'Snapshot not found for date.' });
        return;
      }

      const items = await snapshotsRepository.getSnapshotItems(snapshot.id);
      res.json({ data: { ...snapshot, items } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
