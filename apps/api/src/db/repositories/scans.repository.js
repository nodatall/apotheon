function mapScanRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    walletId: row.wallet_id,
    chainId: row.chain_id,
    universeSnapshotId: row.universe_snapshot_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
    createdAt: row.created_at
  };
}

function mapScanItemRow(row) {
  return {
    id: row.id,
    scanId: row.scan_id,
    tokenId: row.token_id,
    contractOrMint: row.contract_or_mint,
    balanceRaw: row.balance_raw,
    balanceNormalized: row.balance_normalized,
    heldFlag: row.held_flag,
    autoTrackedFlag: row.auto_tracked_flag,
    usdValue: row.usd_value,
    valuationStatus: row.valuation_status
  };
}

export function createScansRepository({ pool }) {
  async function createScanRun({
    walletId,
    chainId,
    universeSnapshotId,
    status = 'queued',
    startedAt = null,
    finishedAt = null,
    errorMessage = null
  }) {
    const { rows } = await pool.query(
      `
        INSERT INTO wallet_universe_scans (
          wallet_id, chain_id, universe_snapshot_id, status, started_at, finished_at, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
          id, wallet_id, chain_id, universe_snapshot_id, status,
          started_at, finished_at, error_message, created_at
      `,
      [walletId, chainId, universeSnapshotId, status, startedAt, finishedAt, errorMessage]
    );

    return mapScanRow(rows[0]);
  }

  async function updateScanRun(scanId, { status, startedAt, finishedAt, errorMessage }) {
    const { rows } = await pool.query(
      `
        UPDATE wallet_universe_scans
        SET
          status = COALESCE($2, status),
          started_at = COALESCE($3, started_at),
          finished_at = COALESCE($4, finished_at),
          error_message = $5
        WHERE id = $1
        RETURNING
          id, wallet_id, chain_id, universe_snapshot_id, status,
          started_at, finished_at, error_message, created_at
      `,
      [scanId, status ?? null, startedAt ?? null, finishedAt ?? null, errorMessage ?? null]
    );

    return mapScanRow(rows[0]);
  }

  async function upsertScanItem(item) {
    const { rows } = await pool.query(
      `
        INSERT INTO wallet_universe_scan_items (
          scan_id, token_id, contract_or_mint, balance_raw, balance_normalized,
          held_flag, auto_tracked_flag, usd_value, valuation_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (scan_id, contract_or_mint)
        DO UPDATE SET
          token_id = EXCLUDED.token_id,
          balance_raw = EXCLUDED.balance_raw,
          balance_normalized = EXCLUDED.balance_normalized,
          held_flag = EXCLUDED.held_flag,
          auto_tracked_flag = EXCLUDED.auto_tracked_flag,
          usd_value = EXCLUDED.usd_value,
          valuation_status = EXCLUDED.valuation_status
        RETURNING
          id, scan_id, token_id, contract_or_mint, balance_raw, balance_normalized,
          held_flag, auto_tracked_flag, usd_value, valuation_status
      `,
      [
        item.scanId,
        item.tokenId ?? null,
        item.contractOrMint,
        item.balanceRaw,
        item.balanceNormalized,
        item.heldFlag,
        item.autoTrackedFlag,
        item.usdValue ?? null,
        item.valuationStatus
      ]
    );

    return mapScanItemRow(rows[0]);
  }

  async function listScanItems(scanId) {
    const { rows } = await pool.query(
      `
        SELECT
          id, scan_id, token_id, contract_or_mint, balance_raw, balance_normalized,
          held_flag, auto_tracked_flag, usd_value, valuation_status
        FROM wallet_universe_scan_items
        WHERE scan_id = $1
        ORDER BY contract_or_mint ASC
      `,
      [scanId]
    );

    return rows.map(mapScanItemRow);
  }

  async function getLatestScanByWallet(walletId) {
    const { rows } = await pool.query(
      `
        SELECT
          id, wallet_id, chain_id, universe_snapshot_id, status,
          started_at, finished_at, error_message, created_at
        FROM wallet_universe_scans
        WHERE wallet_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [walletId]
    );

    return mapScanRow(rows[0]);
  }

  async function getLatestSuccessfulScanItemsByWallet(walletId) {
    const latest = await pool.query(
      `
        SELECT id
        FROM wallet_universe_scans
        WHERE wallet_id = $1
          AND status IN ('success', 'partial')
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [walletId]
    );

    const latestScanId = latest.rows[0]?.id;
    if (!latestScanId) {
      return [];
    }

    return listScanItems(latestScanId);
  }

  return {
    createScanRun,
    getLatestScanByWallet,
    getLatestSuccessfulScanItemsByWallet,
    listScanItems,
    updateScanRun,
    upsertScanItem
  };
}
