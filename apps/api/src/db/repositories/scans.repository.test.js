import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScansRepository } from './scans.repository.js';

test('scans repository: dashboard payload excludes inactive wallets and inactive tracked tokens', async () => {
  let queryIndex = 0;
  const pool = {
    query: async (sql) => {
      queryIndex += 1;
      if (queryIndex === 1) {
        assert.match(sql, /scan_count/i);
        return { rows: [{ scan_count: 3 }] };
      }

      assert.match(sql, /wallet_is_active/i);
      assert.match(sql, /token_is_active/i);

      return {
        rows: [
          {
            scan_item_id: 'scan-item-active',
            scan_id: 'scan-1',
            wallet_id: 'wallet-active',
            chain_id: 'chain-1',
            wallet_is_active: true,
            scan_finished_at: '2026-02-13T10:00:00.000Z',
            wallet_address: '0xactive',
            token_id: 'token-active',
            contract_or_mint: '0xaaa',
            balance_normalized: '2',
            usd_value: '20',
            valuation_status: 'known',
            tracked_symbol: 'AAA',
            token_is_active: true
          },
          {
            scan_item_id: 'scan-item-inactive-wallet',
            scan_id: 'scan-2',
            wallet_id: 'wallet-inactive',
            chain_id: 'chain-1',
            wallet_is_active: false,
            scan_finished_at: '2026-02-13T12:00:00.000Z',
            wallet_address: '0xinactive',
            token_id: 'token-inactive-wallet',
            contract_or_mint: '0xbbb',
            balance_normalized: '1',
            usd_value: '100',
            valuation_status: 'known',
            tracked_symbol: 'BBB',
            token_is_active: true
          },
          {
            scan_item_id: 'scan-item-inactive-token',
            scan_id: 'scan-3',
            wallet_id: 'wallet-active',
            chain_id: 'chain-1',
            wallet_is_active: true,
            scan_finished_at: '2026-02-13T11:00:00.000Z',
            wallet_address: '0xactive',
            token_id: 'token-inactive',
            contract_or_mint: '0xccc',
            balance_normalized: '1',
            usd_value: '100',
            valuation_status: 'known',
            tracked_symbol: 'CCC',
            token_is_active: false
          }
        ]
      };
    }
  };

  const repository = createScansRepository({ pool });
  const payload = await repository.getLatestDashboardPayloadFromScans();

  assert.equal(payload.hasLiveScans, true);
  assert.equal(payload.rows.tokens.length, 1);
  assert.equal(payload.rows.tokens[0].snapshotItemId, 'scan-item-active');
  assert.equal(payload.rows.tokens[0].symbol, 'AAA');
  assert.equal(payload.totals.portfolioUsdValue, 20);
  assert.equal(payload.totals.tokenUsdValue, 20);
  assert.equal(payload.latestLiveScan.finishedAt, '2026-02-13T10:00:00.000Z');
});
