const UNIQUE_VIOLATION = '23505';

function mapChainRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    family: row.family,
    chainId: row.chain_id,
    rpcUrl: row.rpc_url,
    isBuiltin: row.is_builtin,
    isActive: row.is_active,
    validationStatus: row.validation_status,
    validationError: row.validation_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function isUniqueViolation(error) {
  return error?.code === UNIQUE_VIOLATION;
}

export function createChainsRepository({ pool }) {
  async function listChains() {
    const { rows } = await pool.query(`
      SELECT
        id, slug, name, family, chain_id, rpc_url, is_builtin, is_active,
        validation_status, validation_error, created_at, updated_at
      FROM chains
      ORDER BY is_builtin DESC, name ASC
    `);

    return rows.map(mapChainRow);
  }

  async function createChain(input) {
    const { rows } = await pool.query(
      `
        INSERT INTO chains (
          slug, name, family, chain_id, rpc_url, is_builtin, is_active, validation_status, validation_error
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING
          id, slug, name, family, chain_id, rpc_url, is_builtin, is_active,
          validation_status, validation_error, created_at, updated_at
      `,
      [
        input.slug,
        input.name,
        input.family,
        input.chainId ?? null,
        input.rpcUrl,
        Boolean(input.isBuiltin),
        input.isActive ?? true,
        input.validationStatus,
        input.validationError ?? null
      ]
    );

    return mapChainRow(rows[0]);
  }

  async function setChainActive(id, isActive) {
    const { rows } = await pool.query(
      `
        UPDATE chains
        SET is_active = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING
          id, slug, name, family, chain_id, rpc_url, is_builtin, is_active,
          validation_status, validation_error, created_at, updated_at
      `,
      [id, isActive]
    );

    return mapChainRow(rows[0]);
  }

  async function upsertBuiltInChains(chains) {
    for (const chain of chains) {
      await pool.query(
        `
          INSERT INTO chains (
            slug, name, family, chain_id, rpc_url, is_builtin, is_active, validation_status, validation_error
          ) VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, 'pending', NULL)
          ON CONFLICT (slug) DO UPDATE
          SET
            name = EXCLUDED.name,
            family = EXCLUDED.family,
            chain_id = EXCLUDED.chain_id,
            rpc_url = EXCLUDED.rpc_url,
            is_builtin = TRUE,
            updated_at = NOW()
        `,
        [chain.slug, chain.name, chain.family, chain.chainId ?? null, chain.rpcUrl]
      );
    }
  }

  return {
    createChain,
    listChains,
    setChainActive,
    upsertBuiltInChains
  };
}
