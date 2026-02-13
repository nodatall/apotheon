See `rules/task-management.md` for task workflow and review guidelines.

## Requirement Coverage Map

| Requirement | Planned Sub-Tasks |
|---|---|
| FR-1 | 1.1, 5.2 |
| FR-2 | 1.2, 5.1 |
| FR-3 | 2.1, 5.1 |
| FR-4 | 2.2 |
| FR-5 | 2.3, 5.1 |
| FR-6 | 1.3 |
| FR-7 | 1.3, 1.4 |
| FR-8 | 1.5 |
| FR-9 | 1.5 |
| FR-10 | 2.4 |
| FR-11 | 3.1 |
| FR-12 | 3.2 |
| FR-13 | 3.3 |
| FR-14 | 4.1 |
| FR-15 | 4.2 |
| FR-16 | 4.3, 5.1 |
| FR-17 | 5.1 |
| FR-18 | 4.4, 5.1 |
| FR-19 | 6.1 |
| FR-20 | 6.2 |
| FR-21 | 1.2 |
| FR-22 | 2.5, 4.5 |
| FR-23 | 1.6 |
| FR-24 | 6.1, 6.2 |
| FR-25 | 6.3 |
| FR-26 | 6.4 |

## Relevant Files

- `apps/api/src/db/migrations/0001_core_schema.sql` - Core schema for chains, wallets, tokens, protocol contracts, universes, scans, and snapshots.
- `apps/api/src/db/migrations/0002_indexes_constraints.sql` - Performance indexes and additional constraints.
- `apps/api/src/db/repositories/chains.repository.js` - Chain CRUD and validation state access.
- `apps/api/src/db/repositories/wallets.repository.js` - Wallet persistence and idempotent lookups.
- `apps/api/src/db/repositories/token-universe.repository.js` - Universe snapshot/item persistence and retrieval.
- `apps/api/src/db/repositories/scans.repository.js` - Wallet scan run/item persistence.
- `apps/api/src/db/repositories/snapshots.repository.js` - Daily snapshot persistence and history reads.
- `apps/api/src/services/chains/chain-validation.service.js` - RPC validation and activation/deactivation logic.
- `apps/api/src/services/chains/rpc-url-safety.js` - SSRF-safe URL validation for custom RPC endpoints.
- `apps/api/src/services/universe/universe-refresh.service.js` - Birdeye primary + CoinGecko fallback flow.
- `apps/api/src/services/universe/universe-sources/birdeye.client.js` - Birdeye token list integration.
- `apps/api/src/services/universe/universe-sources/coingecko.client.js` - CoinGecko markets/platforms fallback integration.
- `apps/api/src/services/wallet-scan/wallet-scan.service.js` - Universe-based wallet scan and auto-track behavior.
- `apps/api/src/services/wallet-scan/balance-batcher.js` - Batch balance resolution abstraction to avoid N+1 RPC calls.
- `apps/api/src/services/tokens/manual-token.service.js` - Manual token registration + metadata override.
- `apps/api/src/services/protocols/protocol-contract.service.js` - Protocol registration and validation lifecycle.
- `apps/api/src/services/protocols/abi-mapping-validator.js` - ABI mapping schema and preview call validation.
- `apps/api/src/services/snapshots/daily-snapshot.service.js` - Daily snapshot orchestration.
- `apps/api/src/services/valuation/valuation.service.js` - CoinGecko primary + DEX fallback valuation.
- `apps/api/src/config/env.js` - Runtime environment validation including required CoinGecko API key.
- `apps/api/src/jobs/scheduler.js` - UTC daily schedules and guarded reruns.
- `apps/api/src/routes/chains.js` - Chain endpoints.
- `apps/api/src/routes/wallets.js` - Wallet add/list/rescan endpoints.
- `apps/api/src/routes/assets.js` - Manual token endpoints.
- `apps/api/src/routes/protocols.js` - Protocol contract endpoints.
- `apps/api/src/routes/universe.js` - Token universe read/refresh endpoints.
- `apps/api/src/routes/snapshots.js` - Snapshot run/read endpoints.
- `apps/api/src/routes/portfolio.js` - Portfolio history endpoints.
- `apps/web/src/pages/Dashboard.jsx` - Dashboard view.
- `apps/web/src/pages/Assets.jsx` - Assets and token tracking UI.
- `apps/web/src/pages/Protocols.jsx` - Protocol contract configuration UI.
- `apps/web/src/pages/History.jsx` - Snapshot and history charts/tables.
- `apps/web/src/pages/Settings.jsx` - Chain/wallet/admin actions UI.
- `apps/web/src/components/JobStatusPanel.jsx` - Job state and error visibility component.
- `apps/web/src/api/client.js` - Frontend API calls.
- `e2e/playwright.config.ts` - Playwright configuration and retries.
- `e2e/mocks/provider-fixtures.ts` - Deterministic mocks/fixtures for external providers in automated tests.
- `e2e/specs/wallet-onboarding.spec.ts` - E2E for wallet add and scan.
- `e2e/specs/universe-refresh.spec.ts` - E2E for token universe refresh and fallback.
- `e2e/specs/manual-token.spec.ts` - E2E for manual token add/override.
- `e2e/specs/protocol-contracts.spec.ts` - E2E for protocol ABI mapping flows.
- `e2e/specs/snapshot-history.spec.ts` - E2E for daily snapshots and history behavior.
- `e2e/specs/navigation-health.spec.ts` - E2E for required pages and job status views.
- `e2e/specs/live-smoke.spec.ts` - Operator-run live integration smoke tests tagged outside CI suite.
- `scripts/run-live-smoke.sh` - One-command live smoke runner for operators/automation agents.
- `artifacts/live-smoke/.gitkeep` - Artifact directory for live smoke traces and reports.
- `.github/workflows/ci.yml` - CI merge gate for deterministic suites only (live smoke excluded).
- `docs/e2e-traceability.md` - User Story -> E2E mapping document.
- `docs/live-smoke.md` - Operator instructions and artifact contract for live smoke runs.

### Notes
- Co-locate unit tests beside source files when practical.
- Default CI tests must use deterministic mocks/fixtures and avoid live provider dependencies.
- Live provider validation is covered by a separate operator-run smoke command, not the automated merge gate.
- Keep DB migrations forward-only.

## Tasks

- [ ] 1.0 Build data foundation and token-universe ingestion first (highest risk)
  - [x] 1.1 Implement base schema for chains, wallets, tracked assets, protocols, universes, scans, and snapshots
    - covers: FR-1, FR-2, FR-3, FR-6, FR-12, FR-14
    - output: `apps/api/src/db/migrations/0001_core_schema.sql`
    - verify: `npm run db:migrate --workspace @apotheon/api`
    - done_when: all required tables/enums/constraints from PRD Appendix A exist and migration succeeds on clean DB
  - [x] 1.2 Implement chain CRUD + RPC validation flow
    - covers: FR-2, FR-18, FR-21
    - output: `apps/api/src/services/chains/chain-validation.service.js`, `apps/api/src/routes/chains.js`
    - verify: `npm run test --workspace @apotheon/api -- chains`
    - done_when: built-in chains load, custom chains validate or fail with explicit `validation_status`, and SSRF-unsafe RPC targets are rejected by default
  - [x] 1.3 Implement daily universe refresh job using Birdeye primary source
    - covers: FR-6, FR-7, FR-18
    - output: `apps/api/src/services/universe/universe-refresh.service.js`, `apps/api/src/services/universe/universe-sources/birdeye.client.js`
    - verify: `npm run test --workspace @apotheon/api -- universe-refresh`
    - done_when: refresh writes ranked per-chain snapshots with source `birdeye` when provider succeeds
  - [x] 1.4 Implement CoinGecko fallback universe derivation
    - covers: FR-7
    - output: `apps/api/src/services/universe/universe-sources/coingecko.client.js`
    - verify: `npm run test --workspace @apotheon/api -- universe-fallback`
    - done_when: fallback builds ordered per-chain universe from markets + platform contract mapping
  - [x] 1.5 Implement partial/failure handling and previous-snapshot retention
    - covers: FR-8, FR-9, FR-18
    - output: `apps/api/src/db/repositories/token-universe.repository.js`, `apps/api/src/routes/universe.js`
    - verify: `npm run test --workspace @apotheon/api -- universe-state`
    - done_when: `partial` universes are scan-eligible and dual-source failure preserves previous active universe
  - [ ] 1.6 Enforce required CoinGecko API key at startup
    - covers: FR-23
    - output: `apps/api/src/config/env.js`, `apps/api/src/index.js`
    - verify: `env -u COINGECKO_API_KEY npm run start --workspace @apotheon/api`
    - done_when: API exits non-zero with explicit config error when `COINGECKO_API_KEY` is missing/empty

- [ ] 2.0 Implement wallet onboarding and universe-based scanning
  - [ ] 2.1 Implement wallet add/list with chain-aware address validation
    - covers: FR-3
    - output: `apps/api/src/routes/wallets.js`, `apps/api/src/db/repositories/wallets.repository.js`
    - verify: `npm run test --workspace @apotheon/api -- wallets`
    - done_when: invalid address/chain combinations are rejected and duplicate wallets blocked by API + DB constraint
  - [ ] 2.2 Trigger scan automatically on wallet creation with immutable universe snapshot reference
    - covers: FR-4
    - output: `apps/api/src/services/wallet-scan/wallet-scan.service.js`
    - verify: `npm run test --workspace @apotheon/api -- wallet-scan-trigger`
    - done_when: creating wallet records one scan run tied to a specific universe snapshot
  - [ ] 2.3 Implement manual re-scan endpoint and idempotent state update
    - covers: FR-5, FR-18
    - output: `apps/api/src/routes/wallets.js`, `apps/api/src/db/repositories/scans.repository.js`
    - verify: `npm run test --workspace @apotheon/api -- wallet-rescan`
    - done_when: repeated re-scan calls create traceable runs and do not duplicate held-token tracking records
  - [ ] 2.4 Implement auto-tracking for held universe tokens
    - covers: FR-10
    - output: `apps/api/src/services/wallet-scan/wallet-scan.service.js`, `apps/api/src/db/repositories/scans.repository.js`
    - verify: `npm run test --workspace @apotheon/api -- auto-track`
    - done_when: tokens with positive balances are marked tracked, non-held tokens remain untracked but recorded
  - [ ] 2.5 Implement batched wallet balance resolution path
    - covers: FR-22
    - output: `apps/api/src/services/wallet-scan/wallet-scan.service.js`, `apps/api/src/services/wallet-scan/balance-batcher.js`
    - verify: `npm run test --workspace @apotheon/api -- wallet-scan-batching`
    - done_when: wallet scan avoids per-token RPC loops and uses chain-appropriate batch reads within timeout budget

- [ ] 3.0 Implement manual token and protocol contract extension paths
  - [ ] 3.1 Implement manual token registration with auto metadata + override persistence
    - covers: FR-11
    - output: `apps/api/src/services/tokens/manual-token.service.js`, `apps/api/src/routes/assets.js`
    - verify: `npm run test --workspace @apotheon/api -- manual-token`
    - done_when: user can add token by contract/mint and override metadata fields without breaking unique constraints
  - [ ] 3.2 Implement protocol contract registration model and endpoints
    - covers: FR-12
    - output: `apps/api/src/services/protocols/protocol-contract.service.js`, `apps/api/src/routes/protocols.js`
    - verify: `npm run test --workspace @apotheon/api -- protocols`
    - done_when: protocol contracts persist with label/category and draft validation status
  - [ ] 3.3 Implement ABI mapping validator with preview call requirement
    - covers: FR-13
    - output: `apps/api/src/services/protocols/abi-mapping-validator.js`
    - verify: `npm run test --workspace @apotheon/api -- abi-mapping`
    - done_when: invalid mapping payloads are rejected with actionable errors and valid mappings can be activated

- [ ] 4.0 Implement daily snapshots, valuation resilience, and history APIs
  - [ ] 4.1 Implement UTC daily snapshot scheduler and manual rerun endpoint
    - covers: FR-14
    - output: `apps/api/src/jobs/scheduler.js`, `apps/api/src/routes/snapshots.js`, `apps/api/src/services/snapshots/daily-snapshot.service.js`
    - verify: `npm run test --workspace @apotheon/api -- snapshots-scheduler`
    - done_when: one snapshot per UTC date is enforced with rerun semantics and audit trail
  - [ ] 4.2 Implement valuation pipeline with unknown-value preservation
    - covers: FR-15
    - output: `apps/api/src/services/valuation/valuation.service.js`, `apps/api/src/db/repositories/snapshots.repository.js`
    - verify: `npm run test --workspace @apotheon/api -- valuation`
    - done_when: missing prices yield `valuation_status=unknown` while quantity rows remain persisted
  - [ ] 4.3 Implement portfolio history query APIs
    - covers: FR-16
    - output: `apps/api/src/routes/portfolio.js`, `apps/api/src/routes/snapshots.js`
    - verify: `npm run test --workspace @apotheon/api -- history`
    - done_when: API returns daily total and per-asset/protocol breakdown from snapshot data
  - [ ] 4.4 Implement job status and error visibility endpoints
    - covers: FR-18
    - output: `apps/api/src/routes/universe.js`, `apps/api/src/routes/snapshots.js`, `apps/api/src/routes/wallets.js`
    - verify: `npm run test --workspace @apotheon/api -- jobs-status`
    - done_when: UI/API can retrieve current/last run status and error details for universe, scan, and snapshot jobs
  - [ ] 4.5 Implement batched snapshot valuation and aggregation path
    - covers: FR-22
    - output: `apps/api/src/services/snapshots/daily-snapshot.service.js`, `apps/api/src/services/valuation/valuation.service.js`
    - verify: `npm run test --workspace @apotheon/api -- snapshot-batching`
    - done_when: snapshot computation uses batched data fetch/valuation primitives and avoids N+1 query behavior

- [ ] 5.0 Implement required frontend surfaces and operational UX
  - [ ] 5.1 Build required pages and API integrations (Dashboard, Assets, Protocols, History, Settings)
    - covers: FR-2, FR-3, FR-5, FR-16, FR-17, FR-18
    - output: `apps/web/src/pages/Dashboard.jsx`, `apps/web/src/pages/Assets.jsx`, `apps/web/src/pages/Protocols.jsx`, `apps/web/src/pages/History.jsx`, `apps/web/src/pages/Settings.jsx`, `apps/web/src/api/client.js`
    - verify: `npm run build --workspace @apotheon/web`
    - done_when: all pages render, route correctly, and perform required read/write actions against API
  - [ ] 5.2 Add single-owner app shell constraints and non-auth operation UX
    - covers: FR-1
    - output: `apps/web/src/App.jsx`, `apps/web/src/components/JobStatusPanel.jsx`
    - verify: `npm run dev --workspace @apotheon/web`
    - done_when: app runs without auth dependencies and surfaces owner-only operational context cleanly

- [ ] 6.0 Enforce end-to-end quality gates and traceability
  - [ ] 6.1 Implement deterministic Playwright E2E suite, mocks/fixtures, and story traceability matrix
    - covers: FR-19, FR-24
    - output: `e2e/mocks/provider-fixtures.ts`, `e2e/specs/wallet-onboarding.spec.ts`, `e2e/specs/universe-refresh.spec.ts`, `e2e/specs/manual-token.spec.ts`, `e2e/specs/protocol-contracts.spec.ts`, `e2e/specs/snapshot-history.spec.ts`, `e2e/specs/navigation-health.spec.ts`, `docs/e2e-traceability.md`
    - verify: `npx playwright test --grep-invert @live`
    - done_when: every user story is mapped and passing in deterministic E2E mode with no live external API calls
  - [ ] 6.2 Add CI merge gate for deterministic suites and enforce live-test exclusion
    - covers: FR-20, FR-24
    - output: `.github/workflows/ci.yml`, `e2e/playwright.config.ts`
    - verify: CI pipeline run where `@live` tests are excluded and deterministic failures block merge
    - done_when: merge is blocked on deterministic E2E failures and CI never executes `@live` smoke specs by default
  - [ ] 6.3 Add operator-run live smoke E2E suite and command
    - covers: FR-25
    - output: `e2e/specs/live-smoke.spec.ts`, `scripts/run-live-smoke.sh`, `docs/live-smoke.md`
    - verify: `COINGECKO_API_KEY=<key> scripts/run-live-smoke.sh`
    - done_when: operator can run only live-tagged smoke tests independently of CI using one documented command
  - [ ] 6.4 Emit machine-readable artifact bundle for live smoke runs
    - covers: FR-26
    - output: `scripts/run-live-smoke.sh`, `artifacts/live-smoke/.gitkeep`, `docs/live-smoke.md`
    - verify: `COINGECKO_API_KEY=<key> scripts/run-live-smoke.sh` and inspect generated artifact directory
    - done_when: each live smoke run writes timestamped trace/log/report artifacts consumable by automation agents
