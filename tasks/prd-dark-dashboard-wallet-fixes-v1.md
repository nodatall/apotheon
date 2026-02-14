# PRD: Dark Mode + Dashboard Balance Visibility + Wallet Onboarding Reliability (V1.1)

## Pre-PRD Interrogation Output

### Assumptions
- This is an incremental release on top of the existing Apotheon V1 scaffold.
- Audience is the same single-owner operator running self-hosted.
- Existing route and repository structure remains in place and is extended, not replaced.
- `COINGECKO_API_KEY` remains required; Birdeye key is optional.

### Unknowns
- Exact preferred dark palette values may evolve after first visual pass.
- Which protocol contracts users will register first (affects live validation volume, not behavior).
- Long-term decision on theme toggle (out of this release).

### Business Decisions Needed
- None blocking. Product decisions were clarified during planning:
  - dark-only UI,
  - dashboard must show both token and protocol balances,
  - wallet should be created even if first scan fails, with clear warnings/actions,
  - CoinGecko required, Birdeye optional.

### Risk Register
- Medium: Provider mismatch (Birdeye auth/CoinGecko endpoint mode) can prevent universe creation.
- Medium: Protocol ABI mapping read failures can produce partial snapshot coverage.
- Medium: UI trust risk if wallet add appears successful but no assets appear and no reason is shown.
- Low: Dark styling changes may reduce contrast if not validated.

### Clarifying Questions and Answers Applied
- Q: Dark mode behavior? A: Dark-only UI for v1.1.
- Q: Dashboard data scope? A: Show latest snapshot assets and protocol positions.
- Q: Wallet add failure policy? A: Create wallet and surface explicit scan warning + recovery actions.
- Q: Provider key policy? A: Require CoinGecko key, keep Birdeye optional.
- Q: Protocol dashboard scope? A: Real protocol balances in snapshots (not placeholders).
- Q: Test strategy? A: Deterministic CI tests; separate operator-run `@live` smoke path.

## 1. Introduction / Overview
This feature release fixes three operator-facing issues:
1. UI is not dark mode as requested.
2. Dashboard does not expose actual asset/protocol balance rows, only totals/history.
3. Wallet add flow lacks clear result feedback and can appear to do nothing when scan prerequisites are missing.

Goal: make onboarding and daily monitoring explicit, reliable, and visually aligned with dark-mode preference.

## 2. Goals
- G1: Deliver dark-only UI across all pages with accessible contrast.
- G2: Display latest snapshot token balances and protocol balances directly on dashboard.
- G3: Ensure wallet add flow always shows explicit outcome (created, scan status, error, next actions).
- G4: Improve discovery reliability by enforcing CoinGecko-required/Birdeye-optional provider policy.
- G5: Keep deterministic CI coverage and preserve separate operator-run live smoke checks.

## 3. User Stories
- US-1: As the owner, I want the UI in dark mode so it matches my preferred operating environment.
- US-2: As the owner, I want dashboard tables for assets and protocols so I can inspect current portfolio composition quickly.
- US-3: As the owner, I want to see wallet add success/failure details immediately so I trust onboarding.
- US-4: As the owner, I want actionable recovery prompts when scan cannot run (e.g., refresh universe, rescan wallet).
- US-5: As the owner, I want protocol balances included in snapshots and dashboard so staking/protocol exposure is visible.
- US-6: As the operator, I want deterministic automated tests and separate live smoke tests so CI is stable and real-world checks are still available.

## 4. Functional Requirements
- FR-1: The web app must use a dark-only theme across shell, navigation, cards, forms, tables, pills, and status states.
- FR-2: The dashboard must show latest snapshot aggregate totals and separate token/protocol subtotals.
- FR-3: The dashboard must list latest snapshot asset rows grouped by `asset_type` (`token`, `protocol_position`).
- FR-4: The API must expose a dashboard payload endpoint for latest snapshot summary + rows.
- FR-5: Wallet creation must remain successful even when the initial scan fails due missing scan-eligible universe.
- FR-6: Wallet creation response and UI must show scan status, scan error, and recovery hints.
- FR-7: Settings page must display recent wallet rows and onboarding status after wallet add.
- FR-8: Settings page must provide one-click recovery actions: refresh selected chain universe and rescan selected wallet.
- FR-9: Daily snapshot service must include protocol-position snapshot items derived from active valid protocol mappings.
- FR-10: Protocol snapshot rows must follow same valuation semantics as token rows, including `valuation_status='unknown'` behavior.
- FR-11: Universe refresh must use provider policy: CoinGecko required, Birdeye optional (skip Birdeye when no key).
- FR-12: CoinGecko client must support configured base URL/key mode compatible with runtime key type.
- FR-13: Deterministic automated suites must avoid live external API calls.
- FR-14: Operator-run live smoke suite (`@live`) must remain separate from default CI runs.
- FR-15: Snapshot generation must tolerate per-protocol read failures by recording partial status and continuing other rows.

## 5. Acceptance Criteria
- AC-1 (FR-1): All primary UI surfaces render with dark palette; no light background tokens remain in core layout/components.
- AC-2 (FR-2): Dashboard summary shows portfolio total, token subtotal, protocol subtotal from latest snapshot data.
- AC-3 (FR-3): Dashboard renders separate token and protocol tables using latest snapshot items.
- AC-4 (FR-4): `GET /api/portfolio/dashboard` returns a structured payload with latest snapshot metadata, totals, and grouped item rows.
- AC-5 (FR-5): `POST /api/wallets` returns `201` for valid chain/address even when scan cannot run.
- AC-6 (FR-6): Wallet response/UI exposes `scanStatus`, `scanError`, and guidance flags (`needsUniverseRefresh`, `canRescan`).
- AC-7 (FR-7): After wallet add, Settings shows wallet row and onboarding result panel without requiring manual page refresh.
- AC-8 (FR-8): Recovery buttons execute universe refresh and wallet rescan and display updated status.
- AC-9 (FR-9): Daily snapshot writes `snapshot_items` rows with `asset_type='protocol_position'` when protocol mappings resolve positions.
- AC-10 (FR-10): Unknown protocol valuations persist quantity and set `valuation_status='unknown'`.
- AC-11 (FR-11): Universe refresh path skips Birdeye when key absent and proceeds via CoinGecko path.
- AC-12 (FR-12): CoinGecko requests succeed with configured key/base-url mode; misconfiguration produces explicit error.
- AC-13 (FR-13): CI deterministic tests run with mocks/fixtures and fail if live-tagged tests are included.
- AC-14 (FR-14): `@live` smoke tests run only via operator command and are excluded from default CI.
- AC-15 (FR-15): If one protocol read fails, snapshot run remains `partial` (not full `failed`) and still persists successful token/protocol rows.

## 6. Non-Goals (Out of Scope)
- Adding a theme toggle or light-mode support.
- Redesigning full navigation/information architecture.
- Building advanced protocol analytics (APY/rewards modeling) beyond balance visibility.
- Replacing existing chain/provider architecture wholesale.

## 7. Design Considerations
- Dark mode should maintain existing layout and information hierarchy.
- Status readability requirements:
  - success/ready/valid badges remain visually distinct,
  - failed/error states must preserve high-contrast visibility,
  - muted text remains legible against dark card/background layers.
- Dashboard should prioritize scanability:
  - summary metrics first,
  - token/protocol tables directly below (default sort: `usdValue DESC`, secondary `symbol ASC`),
  - unknown valuation markers visible inline.
- Settings onboarding UX must be explicit:
  - add-wallet outcome banner/panel,
  - recent wallets list,
  - immediate recovery actions.

## 8. Technical Considerations
- Extend existing API/router structure; do not introduce parallel app stacks.
- Use repository/service aggregation for dashboard payload to avoid N+1 queries.
- Protocol snapshot ingestion should reuse existing ABI mapping service patterns and snapshot write path.
- Provider configuration:
  - `COINGECKO_API_KEY` required,
  - `BIRDEYE_API_KEY` optional,
  - `COINGECKO_BASE_URL` configurable with safe defaults.
- Testing model remains dual-track:
  - deterministic default CI,
  - separate operator-run live smoke checks.

## 9. Success Metrics
- SM-1: 100% of pages render in dark mode with no critical contrast regressions in QA checklist.
- SM-2: Wallet onboarding shows explicit result state for 100% of add attempts.
- SM-3: Dashboard shows both token and protocol tables when latest snapshot exists.
- SM-4: Universe refresh failures attributable to missing optional Birdeye key drop to 0 blocking incidents.
- SM-5: Deterministic CI remains stable; live smoke remains runnable on-demand with artifacts.

## 10. Open Questions
- None blocking for implementation.

## 11. Appendices

### Appendix A: Data Model Contracts
No new mandatory tables are required.

Normative usage contract on existing `snapshot_items`:
- `asset_type` MUST include:
  - `token`
  - `protocol_position`
- For protocol rows:
  - `asset_ref_id`: protocol contract id (UUID) or stable reference id used by service.
  - `symbol`: nullable protocol position symbol/label.
  - `quantity`: numeric position quantity (required).
  - `usd_price`: nullable.
  - `usd_value`: nullable.
  - `valuation_status`: `known` or `unknown`.

### Appendix B: External API Contracts
#### B.1 Internal HTTP API Contracts (additions)

`GET /api/portfolio/dashboard`
- Response `200`:
```json
{
  "data": {
    "latestSnapshot": {
      "id": "uuid",
      "snapshotDateUtc": "YYYY-MM-DD",
      "status": "success|partial|failed",
      "finishedAt": "timestamp|null"
    },
    "totals": {
      "portfolioUsdValue": 0,
      "tokenUsdValue": 0,
      "protocolUsdValue": 0
    },
    "rows": {
      "tokens": [
        {
          "snapshotItemId": "uuid",
          "walletId": "uuid|null",
          "assetRefId": "uuid|null",
          "symbol": "string|null",
          "quantity": 0,
          "usdPrice": 0,
          "usdValue": 0,
          "valuationStatus": "known|unknown"
        }
      ],
      "protocols": [
        {
          "snapshotItemId": "uuid",
          "walletId": "uuid|null",
          "assetRefId": "uuid|null",
          "symbol": "string|null",
          "protocolLabel": "string|null",
          "protocolCategory": "string|null",
          "quantity": 0,
          "usdPrice": 0,
          "usdValue": 0,
          "valuationStatus": "known|unknown"
        }
      ]
    },
    "jobs": {
      "snapshot": {
        "status": "queued|running|success|partial|failed",
        "errorMessage": "string|null"
      }
    }
  }
}
```

`GET /api/wallets/:id/onboarding-status`
- Response `200`:
```json
{
  "data": {
    "walletId": "uuid",
    "scanStatus": "queued|running|success|partial|failed|null",
    "scanError": "string|null",
    "needsUniverseRefresh": true,
    "canRescan": true
  }
}
```

`POST /api/wallets` (contract addition)
- Existing `201` response MUST include:
  - `walletUniverseScanId`
  - `scanStatus`
  - `scanError`
  - `needsUniverseRefresh`
  - `canRescan`

#### B.2 Provider Contracts (updates)
- CoinGecko is required for universe fallback/valuation.
- Birdeye is optional:
  - If key absent, system MUST skip Birdeye call and proceed to CoinGecko path.
- CoinGecko client must support configured `COINGECKO_BASE_URL` and key header mode expected by selected base URL.

### Appendix C: Event/State Enums and Constraints
Required enum values:
- `asset_type`: `token`, `protocol_position`
- Wallet scan status: `queued`, `running`, `success`, `partial`, `failed`
- Snapshot status: `queued`, `running`, `success`, `partial`, `failed`
- Valuation status: `known`, `unknown`

Constraints:
- Wallet creation MUST NOT be rolled back purely due scan failure.
- Deterministic suite MUST exclude tests tagged `@live`.
- Live smoke suite MUST be executable independently by operator command.
- Dashboard row sorting MUST be `usdValue DESC`, then `symbol ASC`.

### Appendix D: Invariants and Ordering Guarantees
1. Wallet onboarding ordering:
   1. Validate chain/address.
   2. Persist wallet.
   3. Attempt initial scan.
   4. Return wallet payload including scan outcome metadata.
2. Dashboard payload ordering:
   1. Resolve latest snapshot.
   2. Load snapshot items.
   3. Group by `asset_type`.
   4. Compute portfolio/token/protocol totals.
3. Snapshot invariants:
   - Protocol and token rows share valuation semantics (`known`/`unknown`).
   - Unknown valuation never removes quantity rows.
   - Single protocol read failures must not abort entire snapshot run; run degrades to `partial`.
4. Provider invariants:
   - CoinGecko key required at runtime.
   - Missing Birdeye key is non-fatal and cannot block universe refresh path selection.
5. Test invariants:
   - CI default commands are deterministic and mock-backed.
   - `@live` suite runs separately and is operator-triggered.
