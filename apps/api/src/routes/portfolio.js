import { Router } from 'express';

export function createPortfolioRouter({ snapshotsRepository }) {
  const router = Router();

  router.get('/dashboard', async (_req, res, next) => {
    try {
      const payload = await snapshotsRepository.getLatestDashboardPayload();
      const snapshotStatus = payload.latestSnapshot?.status ?? 'queued';
      res.json({
        data: {
          ...payload,
          jobs: {
            snapshot: {
              status: snapshotStatus,
              errorMessage: payload.latestSnapshot?.errorMessage ?? null
            }
          }
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/history', async (req, res, next) => {
    try {
      const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : null;
      const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : null;

      const totals = await snapshotsRepository.getHistory({ fromDate, toDate });
      res.json({ data: { totals } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
