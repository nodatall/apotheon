import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler } from './scheduler.js';

test('snapshots-scheduler: runs once per UTC date unless forced rerun', async () => {
  let universeCalls = 0;
  let snapshotCalls = 0;

  const scheduler = createScheduler({
    universeRefreshService: {
      refreshAllChains: async () => {
        universeCalls += 1;
        return [];
      }
    },
    dailySnapshotService: {
      runDailySnapshot: async ({ force }) => {
        snapshotCalls += 1;
        return { force };
      }
    },
    now: () => new Date('2026-02-13T00:00:00.000Z')
  });

  const first = await scheduler.runDailyJobs();
  const second = await scheduler.runDailyJobs();
  const forced = await scheduler.runDailyJobs({ force: true });

  assert.equal(first.skipped, false);
  assert.equal(second.skipped, true);
  assert.equal(forced.skipped, false);
  assert.equal(universeCalls, 2);
  assert.equal(snapshotCalls, 2);
});
