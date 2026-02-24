import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotsRepository } from './snapshots.repository.js';

test('snapshots repository: dashboard payload excludes inactive wallets and inactive tracked tokens', async () => {
  let queryIndex = 0;
  const pool = {
    query: async (sql) => {
      queryIndex += 1;
      if (queryIndex === 1) {
        assert.match(sql, /FROM daily_snapshots/i);
        return {
          rows: [
            {
              id: 'snapshot-1',
              snapshot_date_utc: '2026-02-13',
              status: 'success',
              started_at: '2026-02-13T00:00:00.000Z',
              finished_at: '2026-02-13T00:30:00.000Z',
              error_message: null,
              created_at: '2026-02-13T00:00:00.000Z'
            }
          ]
        };
      }

      assert.match(sql, /wallet_is_active/i);
      assert.match(sql, /token_is_active/i);

      return {
        rows: [
          {
            snapshot_item_id: 'token-active',
            wallet_id: 'wallet-active',
            wallet_chain_id: 'chain-1',
            wallet_is_active: true,
            asset_type: 'token',
            asset_ref_id: 'tracked-token-1',
            symbol: 'AAA',
            quantity: '2',
            usd_price: '25',
            usd_value: '50',
            valuation_status: 'known',
            token_chain_id: 'chain-1',
            token_contract_or_mint: '0xaaa',
            token_is_active: true,
            protocol_label: null,
            protocol_category: null
          },
          {
            snapshot_item_id: 'token-inactive-wallet',
            wallet_id: 'wallet-inactive',
            wallet_chain_id: 'chain-1',
            wallet_is_active: false,
            asset_type: 'token',
            asset_ref_id: 'tracked-token-2',
            symbol: 'BBB',
            quantity: '1',
            usd_price: '100',
            usd_value: '100',
            valuation_status: 'known',
            token_chain_id: 'chain-1',
            token_contract_or_mint: '0xbbb',
            token_is_active: true,
            protocol_label: null,
            protocol_category: null
          },
          {
            snapshot_item_id: 'token-inactive-token',
            wallet_id: 'wallet-active',
            wallet_chain_id: 'chain-1',
            wallet_is_active: true,
            asset_type: 'token',
            asset_ref_id: 'tracked-token-3',
            symbol: 'CCC',
            quantity: '1',
            usd_price: '100',
            usd_value: '100',
            valuation_status: 'known',
            token_chain_id: 'chain-1',
            token_contract_or_mint: '0xccc',
            token_is_active: false,
            protocol_label: null,
            protocol_category: null
          },
          {
            snapshot_item_id: 'protocol-active',
            wallet_id: 'wallet-active',
            wallet_chain_id: 'chain-1',
            wallet_is_active: true,
            asset_type: 'protocol_position',
            asset_ref_id: 'protocol-1',
            symbol: 'stAAA',
            quantity: '1',
            usd_price: '30',
            usd_value: '30',
            valuation_status: 'known',
            token_chain_id: null,
            token_contract_or_mint: null,
            token_is_active: null,
            protocol_label: 'Stake Vault',
            protocol_category: 'staking'
          }
        ]
      };
    }
  };

  const repository = createSnapshotsRepository({ pool });
  const payload = await repository.getLatestDashboardPayload();

  assert.equal(payload.rows.tokens.length, 1);
  assert.equal(payload.rows.tokens[0].snapshotItemId, 'token-active');
  assert.equal(payload.rows.protocols.length, 1);
  assert.equal(payload.rows.protocols[0].snapshotItemId, 'protocol-active');
  assert.equal(payload.totals.tokenUsdValue, 50);
  assert.equal(payload.totals.protocolUsdValue, 30);
  assert.equal(payload.totals.portfolioUsdValue, 80);
});
