# PRD: Apotheon On-Chain Portfolio Tracker (V1)

## Pre-PRD Interrogation Output

### Assumptions
- Primary user is one local owner running a self-hosted instance.
- Portfolio is watch-only and read-only (no signing, trading, or custody).
- V1 supports Solana and built-in EVM chains: Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, Avalanche.
- V1 also supports custom chain registration with RPC-based validation.
- Daily UTC jobs drive both token universe refresh and portfolio snapshots.
- `COINGECKO_API_KEY` is required in runtime environments.

### Unknowns
- API limits/quotas for external providers per deployment environment.
- Exact fallback DEX quote providers by chain when CoinGecko pricing is unavailable.
- Long-term policy for expanding default built-in chain list.

### Business Decisions Needed
- None blocking for V1 implementation.
- Future decision (post-V1): whether to support NFT/SFT tracking.

### Risk Register
- Medium: Arbitrary protocol ABI mappings can return incorrect balances if user mapping is invalid.
- Medium: External provider instability (Birdeye/CoinGecko/RPCs) may impact discovery and valuation.
- Medium: Chain coverage gaps for custom networks in fallback universe generation.
- Low: Daily job drift if host clock or scheduler configuration is wrong.

### High-Risk Gate Resolution
High-risk ambiguity was reduced via explicit product decisions gathered before drafting:
- protocol positions use manual ABI read mapping with validation,
- token universe uses Birdeye primary and CoinGecko fallback,
- CI E2E policy is deterministic by default, with separate operator-run live smoke tests.

## 1. Introduction / Overview
Apotheon V1 is a personal, watch-only, on-chain portfolio tracker for Solana and multiple EVM chains. The product solves two major problems:
1. Existing portfolio tools frequently miss long-tail chains/tokens/protocol contracts.
2. Users need reliable daily history even when pricing and protocol support are incomplete.

The V1 goal is to provide accurate quantity tracking, practical valuation, and stable historical snapshots, while allowing manual extension for custom chains, tokens, and protocol contracts.

## 2. Goals
- G1: Allow the user to add watch-only wallets (Solana + EVM) and see holdings within 2 minutes.
- G2: Automatically discover holdings from a per-chain top-200 token universe on wallet add and re-scan.
- G3: Allow manual onboarding of unsupported tokens and protocol/staking contracts.
- G4: Produce one portfolio snapshot per UTC day and expose historical value/balance trends.
- G5: Guarantee traceable E2E coverage for all user stories before merge.

## 3. User Stories
- US-1: As the owner, I want to add a wallet address so I can track holdings without connecting private keys.
- US-2: As the owner, I want the app to check top tokens for that chain automatically so I do not manually add common assets one by one.
- US-3: As the owner, I want to add custom chains (RPC + chain metadata) so unsupported networks can still be tracked.
- US-4: As the owner, I want to add manual token contracts so long-tail assets appear in the portfolio.
- US-5: As the owner, I want to add protocol/staking contracts with read mappings so protocol balances are visible.
- US-6: As the owner, I want a daily historical record of quantity and USD value so I can monitor long-term performance.
- US-7: As the owner, I want valuation gaps explicitly marked (not silently dropped) so history remains trustworthy.
- US-8: As the owner, I want dashboard, assets, protocols, history, and settings pages for full operation.
- US-9: As the owner, I want deterministic automated testing that proves each story works end to end.
- US-10: As the operator, I want a separate live-integration smoke test I can run on demand so I can verify real provider behavior and feed artifacts to an LLM fixer workflow without manual copy/paste.

## 4. Functional Requirements
- FR-1: The system must run as a single-user, self-hosted application with one owner profile and no authentication in V1.
- FR-2: The system must allow creation, listing, and deactivation of chains with built-in defaults and custom chain support.
- FR-3: The system must allow adding watch-only wallet addresses for EVM and Solana.
- FR-4: On wallet creation, the system must trigger a wallet universe scan against the latest token universe for that wallet's chain.
- FR-5: The system must support manual wallet re-scan.
- FR-6: The system must refresh a per-chain fungible token universe daily (target size 200).
- FR-7: Universe sourcing must use Birdeye Token List V3 as primary and CoinGecko-derived fallback when Birdeye is unsupported or fails.
- FR-8: If a universe cannot produce 200 tokens, the system must save a partial universe and still allow scans.
- FR-9: If both primary and fallback universe refresh fail, the system must keep the previous successful universe active.
- FR-10: The system must auto-track tokens from universe scan results when the wallet balance is greater than zero.
- FR-11: The system must allow manual token registration (chain + contract/mint) with metadata auto-fetch and editable overrides.
- FR-12: The system must allow protocol/staking contract registration with chain, contract, label/category, and ABI read mapping configuration.
- FR-13: The system must validate ABI read mappings before activation and reject invalid mappings with actionable errors.
- FR-14: The system must execute one daily snapshot job per UTC date and support manual rerun.
- FR-15: Snapshot records must preserve quantity even when USD valuation is unavailable and mark valuation status as unknown.
- FR-16: The system must expose portfolio history and daily snapshot APIs and show them in the History UI.
- FR-17: The frontend must include Dashboard, Assets, Protocols, History, and Settings pages.
- FR-18: The system must expose job status and error details for universe refresh, wallet scans, and snapshots.
- FR-19: The delivery must include a User Story -> E2E Traceability Matrix where every user story maps to at least one Playwright E2E test.
- FR-20: CI must block merges unless all mapped deterministic E2E tests pass.
- FR-21: Custom RPC URL handling must enforce SSRF-safe validation (deny localhost/private-network targets by default).
- FR-22: Wallet scan and snapshot balance resolution must use batched reads to avoid N+1 RPC/query patterns.
- FR-23: API startup must fail fast when `COINGECKO_API_KEY` is missing or empty.
- FR-24: Default automated test suites (unit/integration/E2E in CI) must use deterministic mocks/fixtures and must not call live external APIs.
- FR-25: The project must provide an operator-run Playwright live smoke test suite tagged separately from the automated suite.
- FR-26: The live smoke command must produce an artifact bundle (logs, traces, and structured failure report) designed for LLM-driven debugging/fix loops without manual copy/paste.

## 5. Acceptance Criteria
- AC-1 (FR-1): Starting the stack yields one owner context without any auth routes; all resources are implicitly owner-scoped.
- AC-2 (FR-2): Built-in chains exist on boot; custom chain creation requires valid RPC URL and chain family (`evm` or `solana`).
- AC-3 (FR-3): Wallet creation validates address format by chain family and stores watch-only metadata.
- AC-4 (FR-4): Creating a wallet enqueues/starts a scan that references a concrete token universe snapshot ID.
- AC-5 (FR-5): Manual re-scan endpoint creates a new scan record and updates held token statuses idempotently.
- AC-6 (FR-6): Daily job writes exactly one active universe snapshot per chain/date with ordered ranks.
- AC-7 (FR-7): Universe refresh attempts Birdeye first; on failure/unsupported chain it attempts CoinGecko fallback.
- AC-8 (FR-8): Universe with fewer than 200 items is stored with `status=partial` and remains scan-eligible.
- AC-9 (FR-9): If both sources fail, latest prior successful snapshot remains active and failure is logged.
- AC-10 (FR-10): Scan auto-tracks only tokens with positive balances and records held/not-held outcomes.
- AC-11 (FR-11): Manual token form accepts chain + contract/mint; metadata is auto-populated when available and can be overridden.
- AC-12 (FR-12): Protocol form requires chain + contract + label/category + ABI mapping payload.
- AC-13 (FR-13): Invalid ABI mapping fails validation and is not activated; valid mapping passes preview/read check.
- AC-14 (FR-14): Daily snapshot job is UTC-based, idempotent by date, and manually rerunnable.
- AC-15 (FR-15): For missing price, snapshot item stores quantity and sets `valuation_status=unknown`.
- AC-16 (FR-16): History endpoints return time series of totals and component assets/protocol positions per snapshot date.
- AC-17 (FR-17): UI includes functional navigation and basic CRUD/visibility for all required pages.
- AC-18 (FR-18): Job status APIs surface states (`queued/running/success/partial/failed`) and error messages.
- AC-19 (FR-19): Traceability matrix has no unmapped user stories.
- AC-20 (FR-20): CI fails when a mapped deterministic Playwright test fails.
- AC-21 (FR-21): RPC validation rejects localhost/private-network URLs unless explicitly enabled by environment override for local development.
- AC-22 (FR-22): Scan and snapshot execution paths use batch resolution primitives and complete within configured provider budget thresholds.
- AC-23 (FR-23): Starting API without `COINGECKO_API_KEY` exits with non-zero status and clear error message.
- AC-24 (FR-24): CI test commands run with deterministic mocks/fixtures and no live external API calls; pipeline fails if live-only tagged tests are included in default suite.
- AC-25 (FR-25): Operator can run a dedicated command (for example `npm run test:e2e:live`) that executes only live-tagged smoke scenarios.
- AC-26 (FR-26): Live smoke run writes timestamped artifact directory with Playwright traces and a machine-readable summary consumable by automation agents.

## 6. Non-Goals (Out of Scope)
- Trading, swaps, bridging, or order routing.
- Private key management, signing, or custody.
- Tax report generation.
- NFT/SFT asset tracking.
- Full protocol-specific APY/reward analytics across all protocols.
- Historical backfill prior to wallet/token/protocol add date.

## 7. Design Considerations
- Keep UI intentionally utilitarian for V1; prioritize reliability and inspectability over visual complexity.
- Required pages:
  - Dashboard: total value, top holdings, latest snapshot health.
  - Assets: tracked tokens, discovery source (`manual` or `scan`), per-wallet holdings.
  - Protocols: configured contracts, validation status, current balances.
  - History: daily totals and component breakdown with unknown valuation markers.
  - Settings: chain configuration, wallet management, universe refresh, snapshot rerun.
- Surfaces that mutate state must show last-run status and errors.

## 8. Technical Considerations
- Stack: React (web), Express Node.js (API), Postgres (data store), in-process scheduler for daily jobs.
- Universe refresh and snapshot jobs must be idempotent and auditable.
- Provider clients must use bounded retries with exponential backoff and jitter to reduce transient failure impact.
- Balance resolution must use batching/multicall-style strategies per chain where available.
- Custom chain support depends on RPC health checks; chain can be inactive if failing.
- RPC URL validation must include SSRF protection defaults.
- Runtime must enforce presence of `COINGECKO_API_KEY` before serving requests or running scheduled jobs.
- Automated test pipeline must default to deterministic mocks/fixtures; live provider tests are operator-triggered only.
- External dependencies:
  - Birdeye Token List V3 (primary universe source)
  - CoinGecko markets + platforms mapping (fallback universe source)
  - CoinGecko token pricing (primary valuation)
  - DEX pricing fallback per chain for valuation gaps
- For custom chains not represented by fallback source mapping, the system must:
  - mark universe as unavailable,
  - skip auto universe scan,
  - rely on manual token tracking.

## 9. Success Metrics
- SM-1: 95%+ of daily universe refresh jobs complete (`ready` or `partial`) over rolling 30 days.
- SM-2: 95%+ of daily snapshot jobs complete successfully over rolling 30 days.
- SM-3: 100% of user stories have at least one mapped passing deterministic Playwright test in CI.
- SM-4: Wallet onboarding median time (address add to first holdings visible) <= 2 minutes.
- SM-5: 0 snapshot rows lost due to missing price data (unknown valuation recorded instead).
- SM-6: Operator live smoke run succeeds on demand with artifact bundle generation for every run.

## 10. Open Questions
- OQ-1: Non-blocking - decide whether to use one DEX fallback provider or a ranked chain-specific provider list in V2.

## 11. User Story -> E2E Traceability Matrix

| User Story | Covered FRs | Required E2E Scenario IDs |
|---|---|---|
| US-1 | FR-3, FR-4 | E2E-WALLET-ADD-001 |
| US-2 | FR-6, FR-7, FR-10 | E2E-UNIVERSE-SCAN-001, E2E-UNIVERSE-SCAN-002 |
| US-3 | FR-2 | E2E-CHAIN-CUSTOM-001 |
| US-4 | FR-11 | E2E-TOKEN-MANUAL-001 |
| US-5 | FR-12, FR-13 | E2E-PROTOCOL-ABI-001, E2E-PROTOCOL-ABI-002 |
| US-6 | FR-14, FR-16 | E2E-SNAPSHOT-HISTORY-001 |
| US-7 | FR-15 | E2E-VALUATION-UNKNOWN-001 |
| US-8 | FR-17, FR-18 | E2E-NAV-HEALTH-001 |
| US-9 | FR-19, FR-20, FR-24 | E2E-CI-GATE-001 |
| US-10 | FR-25, FR-26 | E2E-LIVE-SMOKE-001 |

---

## Appendix A: Data Model Contracts

### A.1 `chains`
- `id` UUID PK
- `slug` TEXT UNIQUE NOT NULL
- `name` TEXT NOT NULL
- `family` TEXT NOT NULL CHECK (`family IN ('evm','solana')`)
- `chain_id` BIGINT NULL (required when `family='evm'`)
- `rpc_url` TEXT NOT NULL
- `is_builtin` BOOLEAN NOT NULL DEFAULT FALSE
- `is_active` BOOLEAN NOT NULL DEFAULT TRUE
- `validation_status` TEXT NOT NULL DEFAULT 'pending' CHECK (`validation_status IN ('pending','valid','invalid')`)
- `validation_error` TEXT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()

### A.2 `wallets`
- `id` UUID PK
- `chain_id` UUID NOT NULL REFERENCES `chains(id)`
- `address` TEXT NOT NULL
- `label` TEXT NULL
- `is_active` BOOLEAN NOT NULL DEFAULT TRUE
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- UNIQUE (`chain_id`, `address`)

### A.3 `tracked_tokens`
- `id` UUID PK
- `chain_id` UUID NOT NULL REFERENCES `chains(id)`
- `contract_or_mint` TEXT NOT NULL
- `symbol` TEXT NULL
- `name` TEXT NULL
- `decimals` INTEGER NULL
- `metadata_source` TEXT NOT NULL CHECK (`metadata_source IN ('auto','manual_override')`)
- `tracking_source` TEXT NOT NULL CHECK (`tracking_source IN ('manual','scan')`)
- `is_active` BOOLEAN NOT NULL DEFAULT TRUE
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- UNIQUE (`chain_id`, `contract_or_mint`)

### A.4 `protocol_contracts`
- `id` UUID PK
- `chain_id` UUID NOT NULL REFERENCES `chains(id)`
- `contract_address` TEXT NOT NULL
- `label` TEXT NOT NULL
- `category` TEXT NOT NULL
- `abi_mapping` JSONB NOT NULL
- `validation_status` TEXT NOT NULL CHECK (`validation_status IN ('draft','valid','invalid')`)
- `validation_error` TEXT NULL
- `is_active` BOOLEAN NOT NULL DEFAULT FALSE
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- UNIQUE (`chain_id`, `contract_address`, `label`)

### A.5 `token_universe_snapshots`
- `id` UUID PK
- `chain_id` UUID NOT NULL REFERENCES `chains(id)`
- `as_of_date_utc` DATE NOT NULL
- `source` TEXT NOT NULL CHECK (`source IN ('birdeye','coingecko_fallback')`)
- `status` TEXT NOT NULL CHECK (`status IN ('ready','partial','failed')`)
- `item_count` INTEGER NOT NULL DEFAULT 0
- `error_message` TEXT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- UNIQUE (`chain_id`, `as_of_date_utc`)

### A.6 `token_universe_items`
- `id` UUID PK
- `snapshot_id` UUID NOT NULL REFERENCES `token_universe_snapshots(id)`
- `rank` INTEGER NOT NULL
- `contract_or_mint` TEXT NOT NULL
- `symbol` TEXT NULL
- `name` TEXT NULL
- `decimals` INTEGER NULL
- `market_cap_usd` NUMERIC NULL
- `source_payload_hash` TEXT NULL
- UNIQUE (`snapshot_id`, `rank`)
- UNIQUE (`snapshot_id`, `contract_or_mint`)

### A.7 `wallet_universe_scans`
- `id` UUID PK
- `wallet_id` UUID NOT NULL REFERENCES `wallets(id)`
- `chain_id` UUID NOT NULL REFERENCES `chains(id)`
- `universe_snapshot_id` UUID NOT NULL REFERENCES `token_universe_snapshots(id)`
- `status` TEXT NOT NULL CHECK (`status IN ('queued','running','success','partial','failed')`)
- `started_at` TIMESTAMPTZ NULL
- `finished_at` TIMESTAMPTZ NULL
- `error_message` TEXT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()

### A.8 `wallet_universe_scan_items`
- `id` UUID PK
- `scan_id` UUID NOT NULL REFERENCES `wallet_universe_scans(id)`
- `token_id` UUID NULL REFERENCES `tracked_tokens(id)`
- `contract_or_mint` TEXT NOT NULL
- `balance_raw` TEXT NOT NULL
- `balance_normalized` NUMERIC NOT NULL
- `held_flag` BOOLEAN NOT NULL
- `auto_tracked_flag` BOOLEAN NOT NULL DEFAULT FALSE
- `usd_value` NUMERIC NULL
- `valuation_status` TEXT NOT NULL CHECK (`valuation_status IN ('known','unknown')`)
- UNIQUE (`scan_id`, `contract_or_mint`)

### A.9 `daily_snapshots`
- `id` UUID PK
- `snapshot_date_utc` DATE NOT NULL UNIQUE
- `status` TEXT NOT NULL CHECK (`status IN ('queued','running','success','partial','failed')`)
- `started_at` TIMESTAMPTZ NULL
- `finished_at` TIMESTAMPTZ NULL
- `error_message` TEXT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()

### A.10 `snapshot_items`
- `id` UUID PK
- `snapshot_id` UUID NOT NULL REFERENCES `daily_snapshots(id)`
- `wallet_id` UUID NULL REFERENCES `wallets(id)`
- `asset_type` TEXT NOT NULL CHECK (`asset_type IN ('token','protocol_position')`)
- `asset_ref_id` UUID NULL
- `symbol` TEXT NULL
- `quantity` NUMERIC NOT NULL
- `usd_price` NUMERIC NULL
- `usd_value` NUMERIC NULL
- `valuation_status` TEXT NOT NULL CHECK (`valuation_status IN ('known','unknown')`)
- UNIQUE (`snapshot_id`, `wallet_id`, `asset_type`, `asset_ref_id`)

---

## Appendix B: External API Contracts

### B.1 Internal HTTP API Contracts

#### `POST /api/chains`
Request body:
```json
{
  "name": "Beam",
  "slug": "beam",
  "family": "evm",
  "chainId": 4337,
  "rpcUrl": "https://example-rpc"
}
```
Responses:
- `201`: chain created with `validationStatus`.
- `400`: invalid family/chain fields.
- `409`: slug conflict.

#### `POST /api/wallets`
Request body:
```json
{
  "chainId": "<uuid>",
  "address": "0x...",
  "label": "Main wallet"
}
```
Responses:
- `201`: wallet created + initial `walletUniverseScanId`.
- `400`: invalid address/chain mismatch.
- `409`: duplicate wallet on chain.

#### `POST /api/wallets/:id/rescan`
Response:
- `202`: re-scan queued with scan id.

#### `POST /api/assets/tokens`
Request body:
```json
{
  "chainId": "<uuid>",
  "contractOrMint": "0x...",
  "symbol": "OPTIONAL",
  "name": "OPTIONAL",
  "decimals": 18
}
```
Response:
- `201`: tracked token created/updated.

#### `POST /api/protocols/contracts`
Request body:
```json
{
  "chainId": "<uuid>",
  "contractAddress": "0x...",
  "label": "Beam Staking",
  "category": "staking",
  "abiMapping": {
    "positionRead": {
      "function": "balanceOf",
      "args": ["$walletAddress"],
      "returns": "uint256"
    },
    "decimalsRead": {
      "function": "decimals",
      "args": [],
      "returns": "uint8"
    }
  }
}
```
Responses:
- `201`: protocol contract created in `draft` or `valid` state.
- `400`: invalid abiMapping schema.

#### `POST /api/token-universe/:chainId/refresh`
Response:
- `202`: refresh job accepted.

#### `POST /api/snapshots/run`
Response:
- `202`: snapshot run accepted for current UTC date or explicit date input.

### B.2 External Provider Contracts (Normative)

#### Birdeye (Primary universe source)
- Endpoint family: Token List V3 (`GET /defi/v3/token/list`)
- Required behavior: request chain-scoped tokens and rank by market cap descending.
- Output consumed: token address/mint, symbol, name, decimals, market cap, rank.

#### CoinGecko (Fallback universe source)
- Endpoint 1: markets list by market cap descending.
- Endpoint 2: coin platform addresses mapping.
- Required behavior: derive per-chain list by filtering for target chain contract presence; keep rank order; take first 200.
- Required auth: requests must include API key from environment variable `COINGECKO_API_KEY`.

#### CoinGecko / DEX valuation
- Primary valuation source: CoinGecko token pricing endpoints by contract/mint.
- Fallback valuation source: configured DEX quote providers by chain.
- Required auth: CoinGecko valuation calls must include API key from `COINGECKO_API_KEY`.

---

## Appendix C: Event/State Enums and Constraints

### C.1 Enum Values
- Chain family: `evm`, `solana`
- Chain validation: `pending`, `valid`, `invalid`
- Universe source: `birdeye`, `coingecko_fallback`
- Universe status: `ready`, `partial`, `failed`
- Job status: `queued`, `running`, `success`, `partial`, `failed`
- Token metadata source: `auto`, `manual_override`
- Token tracking source: `manual`, `scan`
- Asset type: `token`, `protocol_position`
- Valuation status: `known`, `unknown`
- Protocol validation: `draft`, `valid`, `invalid`

### C.2 Constraints
- Universe target is 200 fungible tokens per chain snapshot.
- Wallet universe scans must reference one immutable universe snapshot.
- Duplicate tracked tokens per (`chain_id`,`contract_or_mint`) are forbidden.
- Duplicate wallet per (`chain_id`,`address`) is forbidden.
- Snapshot and scan processes are idempotent by unique date/run identity.
- Default RPC validation policy must deny localhost and RFC1918/private ranges.
- `COINGECKO_API_KEY` must be non-empty at runtime.
- Live smoke tests must be tagged and excluded from default CI E2E command.

---

## Appendix D: Invariants and Ordering Guarantees

1. Universe refresh ordering:
   1. Attempt Birdeye.
   2. If Birdeye unsupported/fails, attempt CoinGecko fallback.
   3. If fallback fails, keep previous successful universe active.

2. Wallet add ordering:
   1. Persist wallet.
   2. Resolve latest active universe snapshot for wallet chain.
   3. Start scan against that snapshot.
   4. Persist scan items.
   5. Auto-track held tokens.

3. Snapshot ordering:
   1. Select current tracked wallets/tokens/protocols.
   2. Resolve balances.
   3. Resolve valuations.
   4. Persist snapshot row.
   5. Persist item rows, preserving quantity even for unknown prices.

4. Data integrity invariants:
   - Missing valuation must not drop quantity rows.
   - Historical records are append-only by date; rerun may update same-date run result, not create duplicate date rows.
   - Scan and snapshot records must retain error details when partial/failed.

5. Testing invariants:
   - Every user story must map to one or more Playwright E2E scenarios.
   - CI merge gate requires passing mapped deterministic tests.
   - Live smoke tests are operator-triggered and excluded from default CI run.
6. Performance invariants:
   - Scan and snapshot pipelines must avoid per-token/per-wallet N+1 query loops.
   - Universe and pricing calls must enforce per-provider timeout and retry ceilings.
7. Operability invariants:
   - Each live smoke execution must emit machine-readable diagnostics for automation agents.
