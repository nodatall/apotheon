# Apotheon

Bare-bones monorepo scaffold for an on-chain crypto portfolio app.

## Stack

- `apps/web`: React + Vite
- `apps/api`: Express + Node.js
- PostgreSQL
- Local `rules/` copied from AutoProphet for planning workflows

## Quick start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment:
   ```bash
   cp .env.example .env
   ```
3. Ensure PostgreSQL is running locally and `DATABASE_URL` in `.env` points to it.
4. Start API + web:
   ```bash
   npm run dev
   ```

## Current status

This repository currently contains framework scaffolding only.
Business logic for wallets, token discovery, protocol contracts, valuation, and snapshots is intentionally not implemented yet.
