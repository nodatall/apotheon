import { validateAbiMappingWithPreview } from './abi-mapping-validator.js';
import { assertProtocolAbiMappingSupported } from './protocol-position-resolver.js';

function mapProtocolRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    chainId: row.chain_id,
    contractAddress: row.contract_address,
    label: row.label,
    category: row.category,
    abiMapping: row.abi_mapping,
    validationStatus: row.validation_status,
    validationError: row.validation_error,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createDefaultPreviewExecutor() {
  return async (abiMapping) => {
    try {
      assertProtocolAbiMappingSupported(abiMapping);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  };
}

export function createProtocolContractService({
  pool,
  previewExecutor = createDefaultPreviewExecutor()
}) {
  async function createProtocolContract({ chainId, contractAddress, label, category, abiMapping }) {
    await validateAbiMappingWithPreview({ abiMapping, previewExecutor });

    const { rows } = await pool.query(
      `
        INSERT INTO protocol_contracts (
          chain_id, contract_address, label, category, abi_mapping,
          validation_status, validation_error, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          id, chain_id, contract_address, label, category, abi_mapping,
          validation_status, validation_error, is_active, created_at, updated_at
      `,
      [
        chainId,
        contractAddress,
        label,
        category,
        abiMapping,
        'valid',
        null,
        true
      ]
    );

    return mapProtocolRow(rows[0]);
  }

  async function listProtocolContracts({ chainId = null } = {}) {
    const { rows } = await pool.query(
      `
        SELECT
          id, chain_id, contract_address, label, category, abi_mapping,
          validation_status, validation_error, is_active, created_at, updated_at
        FROM protocol_contracts
        WHERE ($1::uuid IS NULL OR chain_id = $1)
        ORDER BY created_at DESC
      `,
      [chainId]
    );

    return rows.map(mapProtocolRow);
  }

  async function listSnapshotEligibleContracts({ chainId }) {
    const { rows } = await pool.query(
      `
        SELECT
          id, chain_id, contract_address, label, category, abi_mapping,
          validation_status, validation_error, is_active, created_at, updated_at
        FROM protocol_contracts
        WHERE chain_id = $1
          AND is_active = TRUE
          AND validation_status = 'valid'
        ORDER BY created_at DESC
      `,
      [chainId]
    );

    return rows.map(mapProtocolRow);
  }

  return {
    createProtocolContract,
    listProtocolContracts,
    listSnapshotEligibleContracts
  };
}
