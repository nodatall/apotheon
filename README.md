# Apotheon

Bare-bones monorepo scaffold for an on-chain crypto portfolio app.

## Stack

- `apps/web`: React + Vite
- `apps/api`: Express + Node.js
- PostgreSQL via Docker Compose
- Local `rules/` copied from AutoProphet for planning workflows

## Quick start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start PostgreSQL:
   ```bash
   docker compose up -d postgres
   ```
3. Start API + web:
   ```bash
   npm run dev
   ```

## Current status

This repository currently contains framework scaffolding only.
Business logic for wallets, token discovery, protocol contracts, valuation, and snapshots is intentionally not implemented yet.
