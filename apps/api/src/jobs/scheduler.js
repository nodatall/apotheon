function utcDate(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

export function createScheduler({
  universeRefreshService,
  dailySnapshotService,
  now = () => new Date()
}) {
  let lastDailyRunDate = null;

  async function runDailyJobs({ force = false } = {}) {
    const currentDate = utcDate(now());

    if (!force && lastDailyRunDate === currentDate) {
      return {
        skipped: true,
        date: currentDate
      };
    }

    const universe = await universeRefreshService.refreshAllChains({
      asOfDateUtc: currentDate
    });
    const snapshot = await dailySnapshotService.runDailySnapshot({
      snapshotDateUtc: currentDate,
      force
    });

    lastDailyRunDate = currentDate;

    return {
      skipped: false,
      date: currentDate,
      universe,
      snapshot
    };
  }

  return {
    runDailyJobs
  };
}
