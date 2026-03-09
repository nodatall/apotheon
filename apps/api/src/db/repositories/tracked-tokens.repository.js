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

  async function listTrackedTokens({ chainId = null, includeInactive = false } = {}) {
    const { rows } = await pool.query(
      `
        SELECT
          id, chain_id, contract_or_mint, symbol, name, decimals,
          metadata_source, tracking_source, is_active, created_at, updated_at
        FROM tracked_tokens
        WHERE ($1::uuid IS NULL OR chain_id = $1)
          AND ($2::boolean = TRUE OR is_active = TRUE)
        ORDER BY created_at DESC
      `,
      [chainId, includeInactive]
    );

    return rows.map(mapTrackedTokenRow);
  }

  async function countTrackedTokensByChain({ chainId, includeInactive = false } = {}) {
    const { rows } = await pool.query(
      `
        SELECT COUNT(*)::int AS token_count
        FROM tracked_tokens
        WHERE chain_id = $1
          AND ($2::boolean = TRUE OR is_active = TRUE)
      `,
      [chainId, includeInactive]
    );

    return Number(rows[0]?.token_count ?? 0);
  }

  async function upsertTrackedTokensBatch({
    chainId,
    tokens,
    metadataSource = 'auto',
    trackingSource = 'scan'
  }) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return [];
    }

    const upserted = [];
    for (const token of tokens) {
      const contractOrMint =
        typeof token?.contractOrMint === 'string' ? token.contractOrMint.trim() : '';
      if (!contractOrMint) {
        continue;
      }

      const upsertedToken = await upsertTrackedToken({
        chainId,
        contractOrMint,
        symbol: typeof token?.symbol === 'string' ? token.symbol : null,
        name: typeof token?.name === 'string' ? token.name : null,
        decimals: Number.isInteger(token?.decimals) ? token.decimals : null,
        metadataSource,
        trackingSource
      });
      upserted.push(upsertedToken);
    }

    return upserted;
  }

  async function setTrackedTokenActive(id, isActive) {
    const { rows } = await pool.query(
      `
        UPDATE tracked_tokens
        SET is_active = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING
          id, chain_id, contract_or_mint, symbol, name, decimals,
          metadata_source, tracking_source, is_active, created_at, updated_at
      `,
      [id, isActive]
    );

    return mapTrackedTokenRow(rows[0]);
  }

  return {
    countTrackedTokensByChain,
    listTrackedTokens,
    setTrackedTokenActive,
    upsertTrackedToken,
    upsertTrackedTokensBatch
  };
}
