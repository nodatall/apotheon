function mapDailySnapshot(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    snapshotDateUtc: row.snapshot_date_utc,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
    createdAt: row.created_at
  };
}

function mapSnapshotItem(row) {
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    walletId: row.wallet_id,
    assetType: row.asset_type,
    assetRefId: row.asset_ref_id,
    symbol: row.symbol,
    quantity: Number(row.quantity),
    usdPrice: row.usd_price === null ? null : Number(row.usd_price),
    usdValue: row.usd_value === null ? null : Number(row.usd_value),
    valuationStatus: row.valuation_status
  };
}

export function createSnapshotsRepository({ pool }) {
  async function upsertDailySnapshot({
    snapshotDateUtc,
    status,
    startedAt = null,
    finishedAt = null,
    errorMessage = null
  }) {
    const { rows } = await pool.query(
      `
        INSERT INTO daily_snapshots (snapshot_date_utc, status, started_at, finished_at, error_message)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (snapshot_date_utc)
        DO UPDATE SET
          status = EXCLUDED.status,
          started_at = COALESCE(EXCLUDED.started_at, daily_snapshots.started_at),
          finished_at = EXCLUDED.finished_at,
          error_message = EXCLUDED.error_message
        RETURNING id, snapshot_date_utc, status, started_at, finished_at, error_message, created_at
      `,
      [snapshotDateUtc, status, startedAt, finishedAt, errorMessage]
    );

    return mapDailySnapshot(rows[0]);
  }

  async function upsertSnapshotItem(item) {
    const { rows } = await pool.query(
      `
        INSERT INTO snapshot_items (
          snapshot_id, wallet_id, asset_type, asset_ref_id, symbol, quantity,
          usd_price, usd_value, valuation_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (snapshot_id, wallet_id, asset_type, asset_ref_id)
        DO UPDATE SET
          symbol = EXCLUDED.symbol,
          quantity = EXCLUDED.quantity,
          usd_price = EXCLUDED.usd_price,
          usd_value = EXCLUDED.usd_value,
          valuation_status = EXCLUDED.valuation_status
        RETURNING
          id, snapshot_id, wallet_id, asset_type, asset_ref_id, symbol,
          quantity, usd_price, usd_value, valuation_status
      `,
      [
        item.snapshotId,
        item.walletId ?? null,
        item.assetType,
        item.assetRefId ?? null,
        item.symbol ?? null,
        item.quantity,
        item.usdPrice ?? null,
        item.usdValue ?? null,
        item.valuationStatus
      ]
    );

    return mapSnapshotItem(rows[0]);
  }

  async function listDailySnapshots({ limit = 30 } = {}) {
    const { rows } = await pool.query(
      `
        SELECT id, snapshot_date_utc, status, started_at, finished_at, error_message, created_at
        FROM daily_snapshots
        ORDER BY snapshot_date_utc DESC
        LIMIT $1
      `,
      [limit]
    );

    return rows.map(mapDailySnapshot);
  }

  async function getDailySnapshotByDate(snapshotDateUtc) {
    const { rows } = await pool.query(
      `
        SELECT id, snapshot_date_utc, status, started_at, finished_at, error_message, created_at
        FROM daily_snapshots
        WHERE snapshot_date_utc = $1
        LIMIT 1
      `,
      [snapshotDateUtc]
    );

    return mapDailySnapshot(rows[0]);
  }

  async function getLatestDailySnapshot() {
    const { rows } = await pool.query(
      `
        SELECT id, snapshot_date_utc, status, started_at, finished_at, error_message, created_at
        FROM daily_snapshots
        ORDER BY snapshot_date_utc DESC
        LIMIT 1
      `
    );

    return mapDailySnapshot(rows[0]);
  }

  async function getSnapshotItems(snapshotId) {
    const { rows } = await pool.query(
      `
        SELECT
          id, snapshot_id, wallet_id, asset_type, asset_ref_id,
          symbol, quantity, usd_price, usd_value, valuation_status
        FROM snapshot_items
        WHERE snapshot_id = $1
        ORDER BY wallet_id NULLS LAST, symbol ASC
      `,
      [snapshotId]
    );

    return rows.map(mapSnapshotItem);
  }

  async function getHistory({ fromDate = null, toDate = null } = {}) {
    const { rows } = await pool.query(
      `
        SELECT
          ds.snapshot_date_utc,
          COALESCE(SUM(si.usd_value), 0) AS total_usd_value
        FROM daily_snapshots ds
        LEFT JOIN snapshot_items si ON si.snapshot_id = ds.id
        WHERE ($1::date IS NULL OR ds.snapshot_date_utc >= $1)
          AND ($2::date IS NULL OR ds.snapshot_date_utc <= $2)
        GROUP BY ds.snapshot_date_utc
        ORDER BY ds.snapshot_date_utc ASC
      `,
      [fromDate, toDate]
    );

    return rows.map((row) => ({
      snapshotDateUtc: row.snapshot_date_utc,
      totalUsdValue: Number(row.total_usd_value)
    }));
  }

  return {
    getDailySnapshotByDate,
    getHistory,
    getLatestDailySnapshot,
    getSnapshotItems,
    listDailySnapshots,
    upsertDailySnapshot,
    upsertSnapshotItem
  };
}
