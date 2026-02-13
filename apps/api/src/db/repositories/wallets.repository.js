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

  async function listWallets({ chainId = null } = {}) {
    const { rows } = await pool.query(
      `
        SELECT id, chain_id, address, label, is_active, created_at, updated_at
        FROM wallets
        WHERE ($1::uuid IS NULL OR chain_id = $1)
        ORDER BY created_at DESC
      `,
      [chainId]
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

  return {
    createWallet,
    getWalletById,
    listWallets
  };
}
