import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow
} from '@heroui/react';
import { api } from '../api/client.js';

const ALL_WALLETS_FILTER = '__all__';

const AVATAR_COLORS = [
  ['#3A2A5C', '#B089FF'],
  ['#513042', '#E58DB2'],
  ['#6D4B2D', '#E3AE76'],
  ['#2E4337', '#81B096'],
  ['#6A3D4B', '#D67B8F'],
  ['#2B3750', '#A7A0C9']
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
  beam: '/chains/beam.png',
  solana: '/chains/solana.png',
  ronin: '/chains/ronin.png'
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

function toFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeAddressGroupKey(address) {
  const normalizedAddress = normalizeString(address);
  if (!normalizedAddress) {
    return '';
  }

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

function getFirstSelectionKey(selection, fallbackValue) {
  if (selection === 'all') {
    return fallbackValue;
  }

  const first = Array.from(selection)[0];
  if (typeof first === 'string') {
    return first;
  }

  if (first === null || first === undefined) {
    return fallbackValue;
  }

  return String(first);
}

function buildSymbolCollapseKey(row, index) {
  const symbol = normalizeString(row?.symbol).toUpperCase();
  if (symbol) {
    return `symbol:${symbol}`;
  }

  const contractOrMint = normalizeString(row?.contractOrMint).toLowerCase();
  if (contractOrMint) {
    return `contract:${contractOrMint}`;
  }

  return `row:${index}`;
}

function collapseRowsBySymbol(rows) {
  const grouped = new Map();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const key = buildSymbolCollapseKey(row, index);
    const quantity = toFiniteNumber(row?.quantity) ?? 0;
    const usdValue = toFiniteNumber(row?.usdValue);
    const usdPrice = toFiniteNumber(row?.usdPrice);
    const chainId = normalizeString(row?.chainId);

    if (!grouped.has(key)) {
      const chainIds = new Set();
      if (chainId) {
        chainIds.add(chainId);
      }
      grouped.set(key, {
        key,
        row: {
          ...row,
          walletId: null
        },
        quantityTotal: quantity,
        usdValueTotal: usdValue ?? 0,
        hasUsdValue: usdValue !== null,
        fallbackUsdPrice: usdPrice,
        chainIds
      });
      continue;
    }

    const current = grouped.get(key);
    current.quantityTotal += quantity;
    if (usdValue !== null) {
      current.usdValueTotal += usdValue;
      current.hasUsdValue = true;
    }
    if (current.fallbackUsdPrice === null && usdPrice !== null) {
      current.fallbackUsdPrice = usdPrice;
    }
    if (chainId) {
      current.chainIds.add(chainId);
    }

    if (!normalizeString(current.row.iconUrl) && normalizeString(row?.iconUrl)) {
      current.row.iconUrl = row.iconUrl;
    }
    if (!normalizeString(current.row.symbol) && normalizeString(row?.symbol)) {
      current.row.symbol = row.symbol;
    }
  }

  return Array.from(grouped.values())
    .map((group) => {
      const chainIds = Array.from(group.chainIds);
      const chainCount = chainIds.length;
      const usdValue = group.hasUsdValue ? group.usdValueTotal : null;
      const usdPrice =
        usdValue !== null && group.quantityTotal > 0
          ? usdValue / group.quantityTotal
          : group.fallbackUsdPrice;

      return {
        ...group.row,
        snapshotItemId: group.row.snapshotItemId || `collapsed-${group.key}`,
        walletId: null,
        chainId: chainCount === 1 ? chainIds[0] : null,
        chainIds,
        chainCount,
        quantity: group.quantityTotal,
        usdValue,
        usdPrice
      };
    })
    .sort((left, right) => {
      const leftValue = typeof left.usdValue === 'number' ? left.usdValue : -1;
      const rightValue = typeof right.usdValue === 'number' ? right.usdValue : -1;
      return rightValue - leftValue;
    });
}

export default function Assets() {
  const [dashboard, setDashboard] = useState(null);
  const [chains, setChains] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [selectedWalletGroup, setSelectedWalletGroup] = useState(ALL_WALLETS_FILTER);
  const [collapseDuplicateSymbols, setCollapseDuplicateSymbols] = useState(false);
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

  const rawTokenRows = useMemo(
    () =>
      [...(dashboard?.rows?.tokens || [])].sort((left, right) => {
        const leftValue = typeof left.usdValue === 'number' ? left.usdValue : -1;
        const rightValue = typeof right.usdValue === 'number' ? right.usdValue : -1;
        return rightValue - leftValue;
      }),
    [dashboard?.rows?.tokens]
  );

  const tokenRows = useMemo(() => {
    if (!collapseDuplicateSymbols) {
      return rawTokenRows;
    }
    return collapseRowsBySymbol(rawTokenRows);
  }, [collapseDuplicateSymbols, rawTokenRows]);

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
      <Card className="hero-card">
        <CardHeader className="asset-toolbar">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Total assets:{' '}
              {formatUsd(totalAssetsValue, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
              })}
            </h2>
          </div>
          <div className="asset-toolbar-side">
            <Select
              aria-label="Address filter"
              selectedKeys={[selectedWalletGroup]}
              onSelectionChange={(keys) =>
                setSelectedWalletGroup(getFirstSelectionKey(keys, ALL_WALLETS_FILTER))
              }
              className="asset-filter"
              disallowEmptySelection
            >
              <SelectItem key={ALL_WALLETS_FILTER}>All addresses</SelectItem>
              {walletGroups.map((group) => (
                <SelectItem key={group.id}>{group.displayLabel}</SelectItem>
              ))}
            </Select>
          </div>
        </CardHeader>
        {error ? (
          <CardBody className="pt-0">
            <p className="error">{error}</p>
          </CardBody>
        ) : null}
      </Card>

      <Card className="hero-card">
        <CardBody>
          <Table
            aria-label="Token balances table"
            removeWrapper
            classNames={{
              th: 'px-4 py-3',
              td: 'px-4 py-3'
            }}
          >
            <TableHeader>
              <TableColumn>
                <button
                  type="button"
                  className="token-header-toggle"
                  aria-pressed={collapseDuplicateSymbols}
                  title={
                    collapseDuplicateSymbols
                      ? 'Show rows by chain'
                      : 'Collapse duplicate symbols across chains'
                  }
                  onClick={() => setCollapseDuplicateSymbols((previous) => !previous)}
                >
                  <span>Token</span>
                  {collapseDuplicateSymbols ? (
                    <span className="token-header-toggle-icon" aria-hidden>
                      <svg viewBox="0 0 16 16" role="img" focusable="false" aria-hidden="true">
                        <ellipse cx="8" cy="3.5" rx="5.5" ry="2.2" />
                        <path d="M2.5 3.5v3.2c0 1.2 2.4 2.2 5.5 2.2s5.5-1 5.5-2.2V3.5" />
                        <path d="M2.5 6.7v3.2c0 1.2 2.4 2.2 5.5 2.2s5.5-1 5.5-2.2V6.7" />
                      </svg>
                    </span>
                  ) : null}
                </button>
              </TableColumn>
              <TableColumn>Price</TableColumn>
              <TableColumn>Amount</TableColumn>
              <TableColumn className="text-right">USD Value</TableColumn>
            </TableHeader>
            <TableBody emptyContent="No token balances yet.">
              {tokenRows.map((row) => {
                const label = getTokenLabel(row);
                const rowKey =
                  row.snapshotItemId ||
                  `${row.chainId || 'chain'}-${row.assetRefId || row.contractOrMint || 'row'}-${
                    row.walletId || 'aggregate'
                  }`;
                const hasIconUrl = typeof row.iconUrl === 'string' && row.iconUrl.trim().length > 0;
                const iconFailed = brokenIcons[rowKey] === true;
                const chainBadge = getChainBadge(chainById.get(row.chainId));
                const collapsedChainCount =
                  collapseDuplicateSymbols && Number.isInteger(row.chainCount) ? row.chainCount : 0;
                return (
                  <TableRow key={rowKey}>
                    <TableCell>
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
                          {collapsedChainCount > 1 ? (
                            <span
                              className="token-chain-badge token-chain-count-badge"
                              title={`${collapsedChainCount} chains`}
                              aria-label={`${collapsedChainCount} chains`}
                            >
                              {collapsedChainCount}
                            </span>
                          ) : chainBadge ? (
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
                    </TableCell>
                    <TableCell>
                      {formatUsd(row.usdPrice, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                    </TableCell>
                    <TableCell>{formatAmount(row.quantity)}</TableCell>
                    <TableCell className="text-right">{formatUsd(row.usdValue)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
