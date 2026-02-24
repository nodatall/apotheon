import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const ALL_WALLETS_FILTER = '__all__';

const AVATAR_COLORS = [
  ['#1d4ed8', '#3b82f6'],
  ['#1e40af', '#60a5fa'],
  ['#b45309', '#f59e0b'],
  ['#7c3aed', '#a78bfa'],
  ['#be123c', '#f43f5e'],
  ['#155e75', '#38bdf8']
];

const CHAIN_BADGE_ICON_BY_SLUG = {
  ethereum: '/chains/ethereum.png',
  arbitrum: '/chains/arbitrum.png',
  'arbitrum-one': '/chains/arbitrum.png',
  optimism: '/chains/optimism.png',
  'optimistic-ethereum': '/chains/optimism.png',
  base: '/chains/base.png',
  polygon: '/chains/polygon.png',
  'polygon-pos': '/chains/polygon.png',
  bsc: '/chains/bsc.png',
  'binance-smart-chain': '/chains/bsc.png',
  avalanche: '/chains/avalanche.png',
  'avalanche-c-chain': '/chains/avalanche.png',
  solana: '/chains/solana.png'
};

function formatUsd(value, { minimumFractionDigits = 2, maximumFractionDigits = 2 } = {}) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }

  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits,
    maximumFractionDigits
  });
}

function formatAmount(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }

  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  });
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function normalizeAddressGroupKey(address) {
  const normalizedAddress = normalizeString(address);
  if (!normalizedAddress) {
    return '';
  }

  // Keep case-sensitive chains (like Solana) untouched; normalize EVM addresses only.
  if (/^0x[a-fA-F0-9]{40}$/.test(normalizedAddress)) {
    return normalizedAddress.toLowerCase();
  }

  return normalizedAddress;
}

function shortAddress(address) {
  if (typeof address !== 'string' || address.length < 12) {
    return address || '-';
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getTokenLabel(row) {
  const symbol = typeof row?.symbol === 'string' ? row.symbol.trim() : '';
  if (symbol) {
    return symbol.toUpperCase();
  }

  const contractOrMint = typeof row?.contractOrMint === 'string' ? row.contractOrMint.trim() : '';
  if (contractOrMint) {
    return contractOrMint.slice(0, 8);
  }

  return 'UNKNOWN';
}

function getAvatarStyle(label) {
  const seed = Array.from(label).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const [fromColor, toColor] = AVATAR_COLORS[seed % AVATAR_COLORS.length];
  return {
    background: `linear-gradient(135deg, ${fromColor} 0%, ${toColor} 100%)`
  };
}

function getChainBadge(chain) {
  if (!chain) {
    return null;
  }

  const slug = typeof chain.slug === 'string' ? chain.slug.trim().toLowerCase() : '';
  const name = typeof chain.name === 'string' ? chain.name.trim() : '';
  const iconUrl = CHAIN_BADGE_ICON_BY_SLUG[slug] ?? null;
  if (iconUrl) {
    return {
      title: name || slug,
      iconUrl
    };
  }

  const fallbackText = name || slug || '?';
  return {
    label: fallbackText.slice(0, 1).toUpperCase(),
    title: fallbackText
  };
}

function buildWalletGroups(wallets) {
  const groups = new Map();

  for (const wallet of wallets) {
    const walletId = normalizeString(wallet?.id);
    if (!walletId) {
      continue;
    }

    const address = normalizeString(wallet?.address);
    const addressGroupKey = normalizeAddressGroupKey(wallet?.address);
    const label = normalizeString(wallet?.label);
    const groupKey = addressGroupKey ? `address:${addressGroupKey}` : `wallet:${walletId}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: groupKey,
        label,
        address,
        walletIds: []
      });
    }

    const group = groups.get(groupKey);
    if (!group.label && label) {
      group.label = label;
    }
    if (!group.address && address) {
      group.address = address;
    }
    group.walletIds.push(walletId);
  }

  return Array.from(groups.values())
    .map((group) => {
      const uniqueWalletIds = Array.from(new Set(group.walletIds));
      const chainCount = uniqueWalletIds.length;
      const baseLabel = group.label || shortAddress(group.address);
      const displayLabel = group.label && group.address
        ? `${group.label} (${shortAddress(group.address)})`
        : baseLabel;
      const suffix = chainCount > 1 ? ` - ${chainCount} chains` : '';

      return {
        ...group,
        walletIds: uniqueWalletIds,
        chainCount,
        displayLabel: `${displayLabel}${suffix}`
      };
    })
    .sort((left, right) => left.displayLabel.localeCompare(right.displayLabel));
}

export default function Assets() {
  const [dashboard, setDashboard] = useState(null);
  const [chains, setChains] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [selectedWalletGroup, setSelectedWalletGroup] = useState(ALL_WALLETS_FILTER);
  const [error, setError] = useState('');
  const [brokenIcons, setBrokenIcons] = useState({});

  async function loadWalletsAndChains() {
    const [chainRows, walletRows] = await Promise.all([api.getChains(), api.getWallets()]);
    setChains(chainRows || []);
    setWallets(walletRows || []);
    setError('');
  }

  useEffect(() => {
    loadWalletsAndChains().catch((loadError) => setError(loadError.message));
  }, []);

  const walletGroups = useMemo(() => buildWalletGroups(wallets), [wallets]);
  const walletGroupById = useMemo(
    () => new Map(walletGroups.map((group) => [group.id, group])),
    [walletGroups]
  );

  useEffect(() => {
    if (selectedWalletGroup === ALL_WALLETS_FILTER) {
      return;
    }

    if (!walletGroupById.has(selectedWalletGroup)) {
      setSelectedWalletGroup(ALL_WALLETS_FILTER);
    }
  }, [selectedWalletGroup, walletGroupById]);

  const selectedWalletIds = useMemo(() => {
    if (selectedWalletGroup === ALL_WALLETS_FILTER) {
      return [];
    }

    const selectedGroup = walletGroupById.get(selectedWalletGroup);
    return selectedGroup?.walletIds || [];
  }, [selectedWalletGroup, walletGroupById]);
  const selectedWalletIdsKey = selectedWalletIds.join(',');

  useEffect(() => {
    let isCancelled = false;

    api
      .getDashboard({ walletIds: selectedWalletIds })
      .then((dashboardPayload) => {
        if (isCancelled) {
          return;
        }

        setDashboard(dashboardPayload || null);
        setError('');
      })
      .catch((loadError) => {
        if (isCancelled) {
          return;
        }

        setError(loadError.message);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedWalletIdsKey]);

  const chainById = useMemo(() => new Map(chains.map((chain) => [chain.id, chain])), [chains]);

  const tokenRows = useMemo(
    () =>
      [...(dashboard?.rows?.tokens || [])].sort((left, right) => {
        const leftValue = typeof left.usdValue === 'number' ? left.usdValue : -1;
        const rightValue = typeof right.usdValue === 'number' ? right.usdValue : -1;
        return rightValue - leftValue;
      }),
    [dashboard?.rows?.tokens]
  );

  const selectedWalletUsdValue = useMemo(
    () =>
      tokenRows.reduce(
        (total, row) =>
          total + (typeof row?.usdValue === 'number' && Number.isFinite(row.usdValue) ? row.usdValue : 0),
        0
      ),
    [tokenRows]
  );

  const totalAssetsValue =
    selectedWalletGroup === ALL_WALLETS_FILTER
      ? dashboard?.totals?.portfolioUsdValue
      : selectedWalletUsdValue;

  return (
    <div className="page-grid">
      <section className="card hero">
        <div className="asset-toolbar">
          <div>
            <h2>
              Total assets:{' '}
              {formatUsd(totalAssetsValue, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
              })}
            </h2>
          </div>
          <div className="asset-toolbar-side">
            <label className="asset-filter-control">
              <span className="muted">Address filter</span>
              <select
                value={selectedWalletGroup}
                onChange={(event) => setSelectedWalletGroup(event.target.value)}
              >
                <option value={ALL_WALLETS_FILTER}>All addresses</option>
                {walletGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.displayLabel}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="card hero">
        <table className="table assets-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Price</th>
              <th>Amount</th>
              <th className="table-right">USD Value</th>
            </tr>
          </thead>
          <tbody>
            {tokenRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No token balances yet.
                </td>
              </tr>
            ) : (
              tokenRows.map((row) => {
                const label = getTokenLabel(row);
                const rowKey =
                  row.snapshotItemId ||
                  `${row.chainId || 'chain'}-${row.assetRefId || row.contractOrMint || 'row'}-${
                    row.walletId || 'aggregate'
                  }`;
                const hasIconUrl = typeof row.iconUrl === 'string' && row.iconUrl.trim().length > 0;
                const iconFailed = brokenIcons[rowKey] === true;
                const chainBadge = getChainBadge(chainById.get(row.chainId));
                return (
                  <tr key={rowKey}>
                    <td>
                      <div className="token-cell">
                        <span className="token-avatar-stack">
                          {hasIconUrl && !iconFailed ? (
                            <img
                              className="token-avatar-image"
                              src={row.iconUrl}
                              alt={`${label} icon`}
                              loading="lazy"
                              onError={() =>
                                setBrokenIcons((previous) => ({
                                  ...previous,
                                  [rowKey]: true
                                }))
                              }
                            />
                          ) : (
                            <span className="token-avatar" style={getAvatarStyle(label)} aria-hidden>
                              {label.slice(0, 1)}
                            </span>
                          )}
                          {chainBadge ? (
                            <span
                              className="token-chain-badge"
                              title={chainBadge.title}
                              aria-label={chainBadge.title}
                            >
                              {chainBadge.iconUrl ? (
                                <img
                                  className="token-chain-badge-image"
                                  src={chainBadge.iconUrl}
                                  alt=""
                                  loading="lazy"
                                  aria-hidden
                                />
                              ) : (
                                chainBadge.label
                              )}
                            </span>
                          ) : null}
                        </span>
                        <span className="token-symbol">{label}</span>
                      </div>
                    </td>
                    <td>{formatUsd(row.usdPrice, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
                    <td>{formatAmount(row.quantity)}</td>
                    <td className="table-right">{formatUsd(row.usdValue)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
