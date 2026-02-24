const UNIQUE_VIOLATION = '23505';

function mapWalletRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    chainId: row.chain_id,
    address: row.address,
    label: row.label,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function isWalletUniqueViolation(error) {
  return error?.code === UNIQUE_VIOLATION;
}

export function createWalletsRepository({ pool }) {
  async function createWallet({ chainId, address, label = null, isActive = true }) {
    const { rows } = await pool.query(
      `
        INSERT INTO wallets (chain_id, address, label, is_active)
        VALUES ($1, $2, $3, $4)
        RETURNING id, chain_id, address, label, is_active, created_at, updated_at
      `,
      [chainId, address, label, isActive]
    );

    return mapWalletRow(rows[0]);
  }

  async function listWallets({ chainId = null, includeInactive = false } = {}) {
    const { rows } = await pool.query(
      `
        SELECT id, chain_id, address, label, is_active, created_at, updated_at
        FROM wallets
        WHERE ($1::uuid IS NULL OR chain_id = $1)
          AND ($2::boolean = TRUE OR is_active = TRUE)
        ORDER BY created_at DESC
      `,
      [chainId, includeInactive]
    );

    return rows.map(mapWalletRow);
  }

  async function getWalletById(id) {
    const { rows } = await pool.query(
      `
        SELECT id, chain_id, address, label, is_active, created_at, updated_at
        FROM wallets
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    return mapWalletRow(rows[0]);
  }

  async function getWalletByChainAndAddress(chainId, address) {
    const { rows } = await pool.query(
      `
        SELECT id, chain_id, address, label, is_active, created_at, updated_at
        FROM wallets
        WHERE chain_id = $1
          AND address = $2
        LIMIT 1
      `,
      [chainId, address]
    );

    return mapWalletRow(rows[0]);
  }

  async function reactivateWallet(id, { label = null } = {}) {
    const { rows } = await pool.query(
      `
        UPDATE wallets
        SET
          is_active = TRUE,
          label = COALESCE($2, label),
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, chain_id, address, label, is_active, created_at, updated_at
      `,
      [id, label]
    );

    return mapWalletRow(rows[0]);
  }

  async function setWalletActive(id, isActive) {
    const { rows } = await pool.query(
      `
        UPDATE wallets
        SET is_active = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING id, chain_id, address, label, is_active, created_at, updated_at
      `,
      [id, isActive]
    );

    return mapWalletRow(rows[0]);
  }

  return {
    createWallet,
    getWalletByChainAndAddress,
    getWalletById,
    listWallets,
    reactivateWallet,
    setWalletActive
  };
}
