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
    usdValue: row.usd_value === null ? null : Number(row.usd_value),
    valuationStatus: row.valuation_status
  };
}

function toNumberOrNull(value) {
  return value === null ? null : Number(value);
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

  async function getLatestDashboardPayloadFromScans() {
    const latestScans = await pool.query(
      `
        SELECT COUNT(*)::int AS scan_count
        FROM (
          SELECT DISTINCT ON (wallet_id) id
          FROM wallet_universe_scans
          WHERE status IN ('success', 'partial')
          ORDER BY wallet_id, created_at DESC
        ) latest_wallet_scans
      `
    );
    const scanCount = Number(latestScans.rows[0]?.scan_count ?? 0);

    const { rows } = await pool.query(
      `
        WITH latest_wallet_scans AS (
          SELECT DISTINCT ON (wallet_id)
            id,
            wallet_id,
            finished_at,
            created_at
          FROM wallet_universe_scans
          WHERE status IN ('success', 'partial')
          ORDER BY wallet_id, created_at DESC
        )
        SELECT
          wusi.id AS scan_item_id,
          lws.id AS scan_id,
          lws.wallet_id,
          lws.finished_at AS scan_finished_at,
          w.address AS wallet_address,
          wusi.token_id,
          wusi.contract_or_mint,
          wusi.balance_normalized,
          wusi.usd_value,
          wusi.valuation_status,
          tt.symbol AS tracked_symbol
        FROM latest_wallet_scans lws
        JOIN wallets w ON w.id = lws.wallet_id
        JOIN wallet_universe_scan_items wusi ON wusi.scan_id = lws.id
        LEFT JOIN tracked_tokens tt ON tt.id = wusi.token_id
        WHERE wusi.held_flag = TRUE
        ORDER BY wusi.usd_value DESC NULLS LAST, wusi.contract_or_mint ASC
      `
    );

    let portfolioUsdValue = 0;
    let latestScanFinishedAt = null;
    const tokens = [];

    for (const row of rows) {
      const quantity = Number(row.balance_normalized);
      const usdValue = toNumberOrNull(row.usd_value);
      const usdPrice =
        usdValue !== null && Number.isFinite(quantity) && quantity > 0 ? usdValue / quantity : null;
      const numericValue = usdValue ?? 0;
      portfolioUsdValue += numericValue;
      const finishedAt = row.scan_finished_at ?? null;
      if (finishedAt && (!latestScanFinishedAt || finishedAt > latestScanFinishedAt)) {
        latestScanFinishedAt = finishedAt;
      }

      tokens.push({
        snapshotItemId: row.scan_item_id,
        scanId: row.scan_id,
        walletId: row.wallet_id,
        walletAddress: row.wallet_address,
        assetRefId: row.token_id,
        contractOrMint: row.contract_or_mint,
        symbol: row.tracked_symbol ?? null,
        quantity,
        usdPrice,
        usdValue,
        valuationStatus: row.valuation_status
      });
    }

    return {
      latestSnapshot: null,
      latestLiveScan: {
        finishedAt: latestScanFinishedAt
      },
      hasLiveScans: scanCount > 0,
      totals: {
        portfolioUsdValue,
        tokenUsdValue: portfolioUsdValue,
        protocolUsdValue: 0
      },
      rows: {
        tokens,
        protocols: []
      }
    };
  }

  return {
    createScanRun,
    getLatestScanByWallet,
    getLatestDashboardPayloadFromScans,
    getLatestSuccessfulScanItemsByWallet,
    listScanItems,
    updateScanRun,
    upsertScanItem
  };
}
