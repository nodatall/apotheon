function mapSnapshotRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    chainId: row.chain_id,
    asOfDateUtc: row.as_of_date_utc,
    source: row.source,
    status: row.status,
    itemCount: row.item_count,
    errorMessage: row.error_message,
    createdAt: row.created_at
  };
}

function mapItemRow(row) {
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    rank: row.rank,
    contractOrMint: row.contract_or_mint,
    symbol: row.symbol,
    name: row.name,
    decimals: row.decimals,
    marketCapUsd: row.market_cap_usd,
    sourcePayloadHash: row.source_payload_hash
  };
}

export function createTokenUniverseRepository({ pool }) {
  async function upsertSnapshot({
    chainId,
    asOfDateUtc,
    source,
    status,
    itemCount,
    errorMessage
  }) {
    const { rows } = await pool.query(
      `
        INSERT INTO token_universe_snapshots (
          chain_id, as_of_date_utc, source, status, item_count, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (chain_id, as_of_date_utc)
        DO UPDATE SET
          source = EXCLUDED.source,
          status = EXCLUDED.status,
          item_count = EXCLUDED.item_count,
          error_message = EXCLUDED.error_message
        RETURNING id, chain_id, as_of_date_utc, source, status, item_count, error_message, created_at
      `,
      [chainId, asOfDateUtc, source, status, itemCount, errorMessage ?? null]
    );

    return mapSnapshotRow(rows[0]);
  }

  async function replaceSnapshotItems(snapshotId, items) {
    await pool.query('DELETE FROM token_universe_items WHERE snapshot_id = $1', [snapshotId]);

    if (items.length === 0) {
      return [];
    }

    const inserted = [];
    for (const item of items) {
      const { rows } = await pool.query(
        `
          INSERT INTO token_universe_items (
            snapshot_id, rank, contract_or_mint, symbol, name, decimals, market_cap_usd, source_payload_hash
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING
            id, snapshot_id, rank, contract_or_mint, symbol, name, decimals, market_cap_usd, source_payload_hash
        `,
        [
          snapshotId,
          item.rank,
          item.contractOrMint,
          item.symbol ?? null,
          item.name ?? null,
          item.decimals ?? null,
          item.marketCapUsd ?? null,
          item.sourcePayloadHash ?? null
        ]
      );

      inserted.push(mapItemRow(rows[0]));
    }

    return inserted;
  }

  async function getLatestSnapshotByChain(chainId) {
    const { rows } = await pool.query(
      `
        SELECT id, chain_id, as_of_date_utc, source, status, item_count, error_message, created_at
        FROM token_universe_snapshots
        WHERE chain_id = $1
        ORDER BY as_of_date_utc DESC, created_at DESC
        LIMIT 1
      `,
      [chainId]
    );

    return mapSnapshotRow(rows[0]);
  }

  async function getSnapshotByChainAndDate(chainId, asOfDateUtc) {
    const { rows } = await pool.query(
      `
        SELECT id, chain_id, as_of_date_utc, source, status, item_count, error_message, created_at
        FROM token_universe_snapshots
        WHERE chain_id = $1
          AND as_of_date_utc = $2
        LIMIT 1
      `,
      [chainId, asOfDateUtc]
    );

    return mapSnapshotRow(rows[0]);
  }

  async function getLatestScanEligibleSnapshot(chainId) {
    const { rows } = await pool.query(
      `
        SELECT id, chain_id, as_of_date_utc, source, status, item_count, error_message, created_at
        FROM token_universe_snapshots
        WHERE chain_id = $1
          AND status IN ('ready', 'partial')
        ORDER BY as_of_date_utc DESC, created_at DESC
        LIMIT 1
      `,
      [chainId]
    );

    return mapSnapshotRow(rows[0]);
  }

  async function getSnapshotItems(snapshotId) {
    const { rows } = await pool.query(
      `
        SELECT
          id, snapshot_id, rank, contract_or_mint, symbol, name, decimals, market_cap_usd, source_payload_hash
        FROM token_universe_items
        WHERE snapshot_id = $1
        ORDER BY rank ASC
      `,
      [snapshotId]
    );

    return rows.map(mapItemRow);
  }

  async function getSnapshotWithItems(snapshotId) {
    const { rows } = await pool.query(
      `
        SELECT id, chain_id, as_of_date_utc, source, status, item_count, error_message, created_at
        FROM token_universe_snapshots
        WHERE id = $1
        LIMIT 1
      `,
      [snapshotId]
    );

    const snapshot = mapSnapshotRow(rows[0]);
    if (!snapshot) {
      return null;
    }

    const items = await getSnapshotItems(snapshot.id);
    return {
      ...snapshot,
      items
    };
  }

  return {
    getLatestScanEligibleSnapshot,
    getLatestSnapshotByChain,
    getSnapshotByChainAndDate,
    getSnapshotItems,
    getSnapshotWithItems,
    replaceSnapshotItems,
    upsertSnapshot
  };
}
