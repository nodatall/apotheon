import { Router } from 'express';

export function createPortfolioRouter({ snapshotsRepository, scansRepository = null }) {
  const router = Router();

  router.get('/dashboard', async (_req, res, next) => {
    try {
      const [snapshotPayload, liveScanPayload] = await Promise.all([
        snapshotsRepository.getLatestDashboardPayload(),
        scansRepository?.getLatestDashboardPayloadFromScans
          ? scansRepository.getLatestDashboardPayloadFromScans()
          : Promise.resolve(null)
      ]);
      const useLiveScans = liveScanPayload?.hasLiveScans === true;
      const payload = useLiveScans ? liveScanPayload : snapshotPayload;
      const snapshotStatus = useLiveScans ? 'live_scan' : payload.latestSnapshot?.status ?? 'queued';
      res.json({
        data: {
          ...payload,
          jobs: {
            snapshot: {
              status: snapshotStatus,
              errorMessage: useLiveScans ? null : payload.latestSnapshot?.errorMessage ?? null
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
