CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  family TEXT NOT NULL CHECK (family IN ('evm', 'solana')),
  chain_id BIGINT NULL,
  rpc_url TEXT NOT NULL,
  is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  validation_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chains_evm_chain_id_required CHECK (
    (family = 'evm' AND chain_id IS NOT NULL) OR
    (family = 'solana' AND chain_id IS NULL)
  )
);

CREATE TRIGGER chains_set_updated_at
BEFORE UPDATE ON chains
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id UUID NOT NULL REFERENCES chains(id),
  address TEXT NOT NULL,
  label TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, address)
);

CREATE TRIGGER wallets_set_updated_at
BEFORE UPDATE ON wallets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS tracked_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id UUID NOT NULL REFERENCES chains(id),
  contract_or_mint TEXT NOT NULL,
  symbol TEXT NULL,
  name TEXT NULL,
  decimals INTEGER NULL,
  metadata_source TEXT NOT NULL CHECK (metadata_source IN ('auto', 'manual_override')),
  tracking_source TEXT NOT NULL CHECK (tracking_source IN ('manual', 'scan')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, contract_or_mint)
);

CREATE TRIGGER tracked_tokens_set_updated_at
BEFORE UPDATE ON tracked_tokens
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS protocol_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id UUID NOT NULL REFERENCES chains(id),
  contract_address TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  abi_mapping JSONB NOT NULL,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('draft', 'valid', 'invalid')),
  validation_error TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, contract_address, label)
);

CREATE TRIGGER protocol_contracts_set_updated_at
BEFORE UPDATE ON protocol_contracts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS token_universe_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id UUID NOT NULL REFERENCES chains(id),
  as_of_date_utc DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('birdeye', 'coingecko_fallback')),
  status TEXT NOT NULL CHECK (status IN ('ready', 'partial', 'failed')),
  item_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, as_of_date_utc)
);

CREATE TABLE IF NOT EXISTS token_universe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES token_universe_snapshots(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  contract_or_mint TEXT NOT NULL,
  symbol TEXT NULL,
  name TEXT NULL,
  decimals INTEGER NULL,
  market_cap_usd NUMERIC NULL,
  source_payload_hash TEXT NULL,
  UNIQUE (snapshot_id, rank),
  UNIQUE (snapshot_id, contract_or_mint)
);

CREATE TABLE IF NOT EXISTS wallet_universe_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  chain_id UUID NOT NULL REFERENCES chains(id),
  universe_snapshot_id UUID NOT NULL REFERENCES token_universe_snapshots(id),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'success', 'partial', 'failed')),
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_universe_scan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES wallet_universe_scans(id) ON DELETE CASCADE,
  token_id UUID NULL REFERENCES tracked_tokens(id),
  contract_or_mint TEXT NOT NULL,
  balance_raw TEXT NOT NULL,
  balance_normalized NUMERIC NOT NULL,
  held_flag BOOLEAN NOT NULL,
  auto_tracked_flag BOOLEAN NOT NULL DEFAULT FALSE,
  usd_value NUMERIC NULL,
  valuation_status TEXT NOT NULL CHECK (valuation_status IN ('known', 'unknown')),
  UNIQUE (scan_id, contract_or_mint)
);

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date_utc DATE NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'success', 'partial', 'failed')),
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS snapshot_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES daily_snapshots(id) ON DELETE CASCADE,
  wallet_id UUID NULL REFERENCES wallets(id),
  asset_type TEXT NOT NULL CHECK (asset_type IN ('token', 'protocol_position')),
  asset_ref_id UUID NULL,
  symbol TEXT NULL,
  quantity NUMERIC NOT NULL,
  usd_price NUMERIC NULL,
  usd_value NUMERIC NULL,
  valuation_status TEXT NOT NULL CHECK (valuation_status IN ('known', 'unknown')),
  UNIQUE (snapshot_id, wallet_id, asset_type, asset_ref_id)
);
