# Architecture

## API
- Node/Express service in `apps/api`.
- PostgreSQL-backed repositories for chains, wallets, scans, token universe, tracked tokens, and snapshots.
- Background scheduler runs universe refresh and daily snapshot jobs.

## Data Flow
1. Chains are seeded/managed and validated for safe RPC usage.
2. Universe refresh stores ranked per-chain token snapshots.
3. Wallet scans resolve balances against the latest scan-eligible snapshot and auto-track held tokens.
4. Daily snapshots aggregate wallet positions and valuation outputs for history endpoints.

## Web
- Vite/React UI in `apps/web`.
- Settings page manages chains, wallets, token tracking, protocol contracts, and operational jobs.
- Dashboard/History pages consume API status and snapshot history endpoints.
