See `rules/task-management.md` for task workflow and review guidelines.

## Requirement Coverage Map

| Requirement | Planned Sub-Tasks |
|---|---|
| FR-1 | 3.1 |
| FR-2 | 2.2, 3.2 |
| FR-3 | 2.2, 3.2 |
| FR-4 | 2.1 |
| FR-5 | 1.1 |
| FR-6 | 1.1, 3.3 |
| FR-7 | 3.3 |
| FR-8 | 1.2, 3.3 |
| FR-9 | 2.3 |
| FR-10 | 2.3 |
| FR-11 | 1.3 |
| FR-12 | 1.4 |
| FR-13 | 4.1, 4.2 |
| FR-14 | 4.3 |
| FR-15 | 2.4, 4.1 |

## Relevant Files

- `apps/api/src/routes/wallets.js` - Wallet create/rescan and onboarding status responses.
- `apps/api/src/routes/portfolio.js` - New dashboard aggregate endpoint.
- `apps/api/src/services/wallet-scan/wallet-scan.service.js` - Initial scan error metadata and hint generation.
- `apps/api/src/services/universe/universe-refresh.service.js` - Provider-selection policy (CoinGecko required, Birdeye optional).
- `apps/api/src/services/universe/universe-sources/birdeye.client.js` - Optional-key behavior.
- `apps/api/src/services/universe/universe-sources/coingecko.client.js` - Base URL/key-mode compatibility.
- `apps/api/src/config/env.js` - Config validation for provider settings.
- `apps/api/src/db/repositories/snapshots.repository.js` - Dashboard aggregate and grouped latest-snapshot row queries.
- `apps/api/src/services/snapshots/daily-snapshot.service.js` - Protocol-position snapshot ingestion.
- `apps/api/src/services/protocols/protocol-contract.service.js` - Protocol contract retrieval/eligibility in snapshot pipeline.
- `apps/api/src/services/valuation/valuation.service.js` - Protocol valuation semantics.
- `apps/api/src/routes/wallets.test.js` - Wallet onboarding behavior tests.
- `apps/api/src/routes/history.test.js` - Portfolio/dashboard route tests.
- `apps/api/src/services/universe/universe-refresh.service.test.js` - Provider policy tests.
- `apps/api/src/services/universe/universe-fallback.test.js` - CoinGecko fallback/base URL coverage.
- `apps/api/src/services/snapshots/snapshot-batching.test.js` - Snapshot protocol-row persistence checks.
- `apps/web/src/styles.css` - Dark-only theme token system.
- `apps/web/src/App.jsx` - Shell-level dark-mode consistency hooks if needed.
- `apps/web/src/pages/Dashboard.jsx` - Totals + token/protocol tables.
- `apps/web/src/pages/Settings.jsx` - Wallet outcome panel and recovery actions UX.
- `apps/web/src/api/client.js` - Dashboard and onboarding status API calls.
- `apps/web/src/components/JobStatusPanel.jsx` - Status visuals on dark theme.
- `e2e/mocks/provider-fixtures.ts` - Deterministic fixtures for CI suites.
- `e2e/specs/wallet-onboarding.spec.ts` - Wallet add/result visibility test.
- `e2e/specs/dashboard-balances.spec.ts` - Dashboard token/protocol rendering test.
- `e2e/specs/live-smoke.spec.ts` - Operator-run live smoke coverage.
- `e2e/playwright.config.ts` - `@live` exclusion in default runs.
- `.github/workflows/ci.yml` - Deterministic gating and live-test exclusion.
- `docs/live-smoke.md` - Operator command and artifact expectations.

### Notes
- Keep deterministic automated suites fully mock/fixture backed.
- Keep `@live` smoke tests operator-triggered only.
- Ensure wallet add path never appears silent; always emit explicit UI feedback.

## Tasks

- [x] 1.0 Fix wallet onboarding reliability and provider prerequisites first (highest risk)
  - [x] 1.1 Make wallet creation success independent from initial scan success and return onboarding hints
    - covers: FR-5, FR-6
    - output: `apps/api/src/routes/wallets.js`, `apps/api/src/services/wallet-scan/wallet-scan.service.js`, `apps/api/src/routes/wallets.test.js`
    - verify: `npm run test --workspace @apotheon/api -- wallets`
    - done_when: wallet POST returns `201` for valid input, includes `scanStatus`, `scanError`, `needsUniverseRefresh`, `canRescan` when scan fails
  - [x] 1.2 Add wallet onboarding status endpoint and recovery wiring
    - covers: FR-8
    - output: `apps/api/src/routes/wallets.js`, `apps/api/src/routes/wallets.test.js`
    - verify: `npm run test --workspace @apotheon/api -- wallets`
    - done_when: `GET /api/wallets/:id/onboarding-status` returns latest scan state plus actionable recovery hints
  - [x] 1.3 Implement provider policy: CoinGecko required, Birdeye optional
    - covers: FR-11
    - output: `apps/api/src/services/universe/universe-refresh.service.js`, `apps/api/src/services/universe/universe-sources/birdeye.client.js`, `apps/api/src/services/universe/universe-refresh.service.test.js`
    - verify: `npm run test --workspace @apotheon/api -- universe-refresh`
    - done_when: refresh flow skips Birdeye when key is absent and still executes CoinGecko path
  - [x] 1.4 Make CoinGecko client runtime-compatible with configured base URL/key mode
    - covers: FR-12
    - output: `apps/api/src/services/universe/universe-sources/coingecko.client.js`, `apps/api/src/config/env.js`, `apps/api/src/services/universe/universe-fallback.test.js`
    - verify: `npm run test --workspace @apotheon/api -- universe-fallback`
    - done_when: valid config succeeds and misconfiguration surfaces explicit actionable errors

- [x] 2.0 Add backend data surfaces for dashboard visibility
  - [x] 2.1 Implement `/api/portfolio/dashboard` aggregate endpoint
    - covers: FR-4
    - output: `apps/api/src/routes/portfolio.js`, `apps/api/src/routes/history.test.js`
    - verify: `npm run test --workspace @apotheon/api -- history`
    - done_when: endpoint returns latest snapshot metadata, grouped rows, and totals per PRD contract
  - [x] 2.2 Add repository helpers to fetch grouped latest snapshot asset/protocol rows and totals
    - covers: FR-2, FR-3
    - output: `apps/api/src/db/repositories/snapshots.repository.js`, `apps/api/src/routes/history.test.js`
    - verify: `npm run test --workspace @apotheon/api -- history`
    - done_when: backend returns token and protocol_position rows separately and computes portfolio/token/protocol subtotals
  - [x] 2.3 Extend daily snapshots to include protocol-position items with unknown-value semantics
    - covers: FR-9, FR-10
    - output: `apps/api/src/services/snapshots/daily-snapshot.service.js`, `apps/api/src/services/valuation/valuation.service.js`, `apps/api/src/services/snapshots/snapshot-batching.test.js`
    - verify: `npm run test --workspace @apotheon/api -- snapshot-batching`
    - done_when: snapshot writes protocol rows and preserves quantity when valuation is unknown
  - [x] 2.4 Make snapshot protocol-read failures degrade to partial rather than hard fail
    - covers: FR-15
    - output: `apps/api/src/services/snapshots/daily-snapshot.service.js`, `apps/api/src/services/snapshots/snapshot-batching.test.js`
    - verify: `npm run test --workspace @apotheon/api -- snapshot-batching`
    - done_when: a single failing protocol mapping marks snapshot `partial` and preserves successfully computed rows

- [x] 3.0 Deliver UI behavior changes (dark mode + dashboard + onboarding feedback)
  - [x] 3.1 Convert web experience to dark-only visual system
    - covers: FR-1
    - output: `apps/web/src/styles.css`, `apps/web/src/App.jsx`, `apps/web/src/components/JobStatusPanel.jsx`
    - verify: `npm run build --workspace @apotheon/web`
    - done_when: all primary components use dark tokens and no light-theme core backgrounds remain
  - [x] 3.2 Upgrade dashboard to show totals and grouped token/protocol tables from new endpoint
    - covers: FR-2, FR-3
    - output: `apps/web/src/pages/Dashboard.jsx`, `apps/web/src/api/client.js`
    - verify: `npm run build --workspace @apotheon/web`
    - done_when: dashboard renders portfolio/token/protocol totals and both tables with unknown valuation markers, sorted by USD value descending
  - [x] 3.3 Improve settings wallet add flow with explicit outcome panel, recent wallets, and recovery actions
    - covers: FR-6, FR-7, FR-8
    - output: `apps/web/src/pages/Settings.jsx`, `apps/web/src/api/client.js`
    - verify: `npm run build --workspace @apotheon/web`
    - done_when: wallet add visibly reports created wallet + scan result and supports refresh/rescan actions from same view

- [x] 4.0 Lock test strategy and CI behavior
  - [x] 4.1 Add deterministic API/UI coverage for wallet onboarding and dashboard balances
    - covers: FR-13, FR-15
    - output: `apps/api/src/routes/wallets.test.js`, `apps/api/src/routes/history.test.js`, `e2e/mocks/provider-fixtures.ts`, `e2e/specs/wallet-onboarding.spec.ts`, `e2e/specs/dashboard-balances.spec.ts`
    - verify: `npm run test --workspace @apotheon/api && npx playwright test --grep-invert @live`
    - done_when: deterministic tests cover onboarding failure/success messaging, partial snapshot behavior from protocol errors, and dashboard grouped balance rendering
  - [x] 4.2 Enforce deterministic CI gate excluding `@live` tests
    - covers: FR-13
    - output: `.github/workflows/ci.yml`, `e2e/playwright.config.ts`
    - verify: CI run confirms `@live` exclusion and deterministic failures block merge
    - done_when: default pipeline executes only deterministic suites and fails when live-tagged tests leak in
  - [x] 4.3 Maintain operator-run live smoke suite as separate path
    - covers: FR-14
    - output: `e2e/specs/live-smoke.spec.ts`, `scripts/run-live-smoke.sh`, `docs/live-smoke.md`
    - verify: `COINGECKO_API_KEY=<key> /Volumes/Code/apotheon/scripts/run-live-smoke.sh`
    - done_when: operator can execute live checks independently, with expected artifacts, without affecting CI gate

- [x] 5.0 Final hardening and release-readiness checks
  - [x] 5.1 Add regression checks for provider error messaging and recovery hints in UI text
    - covers: FR-6, FR-11, FR-12
    - output: `apps/api/src/routes/wallets.test.js`, `apps/web/src/pages/Settings.jsx`, `e2e/specs/wallet-onboarding.spec.ts`
    - verify: `npm run test --workspace @apotheon/api && npx playwright test --grep "wallet-onboarding" --grep-invert @live`
    - done_when: provider and scan failures produce explicit user-facing messages with actionable next steps
  - [x] 5.2 Validate dashboard behavior with empty-state and partial-snapshot cases
    - covers: FR-2, FR-3, FR-10
    - output: `apps/web/src/pages/Dashboard.jsx`, `e2e/specs/dashboard-balances.spec.ts`
    - verify: `npx playwright test --grep "dashboard-balances" --grep-invert @live`
    - done_when: dashboard clearly handles no snapshot, partial snapshot, and unknown valuation states without ambiguity
