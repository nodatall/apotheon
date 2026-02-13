function mapTrackedTokenRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    chainId: row.chain_id,
    contractOrMint: row.contract_or_mint,
    symbol: row.symbol,
    name: row.name,
    decimals: row.decimals,
    metadataSource: row.metadata_source,
    trackingSource: row.tracking_source,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createTrackedTokensRepository({ pool }) {
  async function upsertTrackedToken({
    chainId,
    contractOrMint,
    symbol,
    name,
    decimals,
    metadataSource,
    trackingSource
  }) {
    const { rows } = await pool.query(
      `
        INSERT INTO tracked_tokens (
          chain_id, contract_or_mint, symbol, name, decimals, metadata_source, tracking_source, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
        ON CONFLICT (chain_id, contract_or_mint)
        DO UPDATE SET
          symbol = COALESCE(EXCLUDED.symbol, tracked_tokens.symbol),
          name = COALESCE(EXCLUDED.name, tracked_tokens.name),
          decimals = COALESCE(EXCLUDED.decimals, tracked_tokens.decimals),
          metadata_source = EXCLUDED.metadata_source,
          tracking_source = EXCLUDED.tracking_source,
          is_active = TRUE,
          updated_at = NOW()
        RETURNING
          id, chain_id, contract_or_mint, symbol, name, decimals,
          metadata_source, tracking_source, is_active, created_at, updated_at
      `,
      [chainId, contractOrMint, symbol ?? null, name ?? null, decimals ?? null, metadataSource, trackingSource]
    );

    return mapTrackedTokenRow(rows[0]);
  }

  async function listTrackedTokens({ chainId = null } = {}) {
    const { rows } = await pool.query(
      `
        SELECT
          id, chain_id, contract_or_mint, symbol, name, decimals,
          metadata_source, tracking_source, is_active, created_at, updated_at
        FROM tracked_tokens
        WHERE ($1::uuid IS NULL OR chain_id = $1)
        ORDER BY created_at DESC
      `,
      [chainId]
    );

    return rows.map(mapTrackedTokenRow);
  }

  return {
    listTrackedTokens,
    upsertTrackedToken
  };
}
