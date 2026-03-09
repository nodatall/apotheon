import { Router } from 'express';

const POLYGON_NATIVE_REF = 'native:polygon';
const POLYGON_MAPPED_NATIVE_CONTRACT = '0x0000000000000000000000000000000000001010';
const MIN_VISIBLE_TOKEN_USD_VALUE = 5;

function toFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseWalletIdsQueryParam(value) {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((item) => normalizeString(item))
    .filter(Boolean);
}

function normalizeContract(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function toPreferredPolygonNativeSymbol(value) {
  const symbol = normalizeString(value);
  if (!symbol) {
    return 'POL';
  }

  const upper = symbol.toUpperCase();
  if (upper === 'MATIC' || upper === 'POL') {
    return 'POL';
  }

  return symbol;
}

function dedupePolygonNativeAliasRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    const contract = normalizeContract(row?.contractOrMint);
    const isPolygonNativeAlias =
      contract === POLYGON_NATIVE_REF || contract === POLYGON_MAPPED_NATIVE_CONTRACT;
    if (!isPolygonNativeAlias) {
      continue;
    }

    const groupKey = [
      normalizeString(row?.chainId) ?? 'unknown-chain',
      normalizeString(row?.walletId) ?? 'aggregate-wallet',
      normalizeString(row?.scanId) ?? 'no-scan'
    ].join('|');

    const current = groups.get(groupKey) ?? { nativeRefRow: null, mappedAliasRow: null };
    if (contract === POLYGON_NATIVE_REF) {
      current.nativeRefRow = row;
    } else {
      current.mappedAliasRow = row;
    }
    groups.set(groupKey, current);
  }

  const rowsToDrop = new Set();
  const replacements = new Map();

  for (const { nativeRefRow, mappedAliasRow } of groups.values()) {
    if (!nativeRefRow || !mappedAliasRow) {
      continue;
    }

    const preferred = normalizeString(mappedAliasRow.symbol)?.toUpperCase() === 'POL'
      ? mappedAliasRow
      : nativeRefRow;
    const other = preferred === mappedAliasRow ? nativeRefRow : mappedAliasRow;
    rowsToDrop.add(other);
    replacements.set(preferred, {
      ...preferred,
      contractOrMint: POLYGON_NATIVE_REF,
      symbol: toPreferredPolygonNativeSymbol(preferred.symbol)
    });
  }

  return rows
    .filter((row) => !rowsToDrop.has(row))
    .map((row) => {
      if (replacements.has(row)) {
        return replacements.get(row);
      }

      if (normalizeContract(row?.contractOrMint) === POLYGON_NATIVE_REF) {
        return {
          ...row,
          symbol: toPreferredPolygonNativeSymbol(row.symbol)
        };
      }

      return row;
    });
}

function buildTokenAggregateKey(row, index) {
  const chainKey = normalizeString(row?.chainId) ?? 'unknown-chain';
  const contractKey = normalizeString(row?.contractOrMint);
  if (contractKey) {
    return `${chainKey}|contract|${contractKey.toLowerCase()}`;
  }

  const assetRefKey = normalizeString(row?.assetRefId);
  if (assetRefKey) {
    return `${chainKey}|asset|${assetRefKey}`;
  }

  const snapshotItemKey = normalizeString(row?.snapshotItemId);
  const scanKey = normalizeString(row?.scanId);
  const walletKey = normalizeString(row?.walletId);
  return `${chainKey}|row|${snapshotItemKey ?? 'none'}|${scanKey ?? 'none'}|${walletKey ?? index}`;
}

function aggregateTokenRows(rows) {
  const grouped = new Map();
  const normalizedRows = dedupePolygonNativeAliasRows(rows);

  for (let index = 0; index < normalizedRows.length; index += 1) {
    const row = normalizedRows[index];
    const key = buildTokenAggregateKey(row, index);
    const quantity = toFiniteNumber(row?.quantity) ?? 0;
    const usdValue = toFiniteNumber(row?.usdValue);
    const usdPrice = toFiniteNumber(row?.usdPrice);
    const valuationStatus = normalizeString(row?.valuationStatus);

    if (!grouped.has(key)) {
      grouped.set(key, {
        row: {
          ...row,
          walletId: null
        },
        quantityTotal: quantity,
        usdValueTotal: usdValue ?? 0,
        hasUsdValue: usdValue !== null,
        fallbackUsdPrice: usdPrice,
        hasUnknownValuation: valuationStatus === 'unknown'
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
    if (valuationStatus === 'unknown') {
      current.hasUnknownValuation = true;
    }

    if (!normalizeString(current.row.symbol) && normalizeString(row?.symbol)) {
      current.row.symbol = row.symbol;
    }
    if (!normalizeString(current.row.contractOrMint) && normalizeString(row?.contractOrMint)) {
      current.row.contractOrMint = row.contractOrMint;
    }
    if (!normalizeString(current.row.assetRefId) && normalizeString(row?.assetRefId)) {
      current.row.assetRefId = row.assetRefId;
    }
    if (!normalizeString(current.row.chainId) && normalizeString(row?.chainId)) {
      current.row.chainId = row.chainId;
    }
  }

  return Array.from(grouped.values()).map((entry) => {
    const usdValue = entry.hasUsdValue ? entry.usdValueTotal : null;
    const usdPrice =
      usdValue !== null && entry.quantityTotal > 0 ? usdValue / entry.quantityTotal : entry.fallbackUsdPrice;

    return {
      ...entry.row,
      quantity: entry.quantityTotal,
      usdValue,
      usdPrice,
      valuationStatus: entry.hasUsdValue ? 'known' : 'unknown'
    };
  });
}

function filterTokenRowsByMinUsdValue(rows) {
  const knownSymbols = new Set();

  for (const row of rows) {
    const usdValue = toFiniteNumber(row?.usdValue);
    if (usdValue === null || usdValue < MIN_VISIBLE_TOKEN_USD_VALUE) {
      continue;
    }

    const symbol = normalizeString(row?.symbol);
    if (symbol) {
      knownSymbols.add(symbol.toUpperCase());
    }
  }

  return rows.filter((row) => {
    const usdValue = toFiniteNumber(row?.usdValue);
    if (usdValue !== null) {
      return usdValue >= MIN_VISIBLE_TOKEN_USD_VALUE;
    }

    const valuationStatus = normalizeString(row?.valuationStatus);
    if (valuationStatus !== 'unknown') {
      return false;
    }

    const quantity = toFiniteNumber(row?.quantity) ?? 0;
    if (quantity <= 0) {
      return false;
    }

    const symbol = normalizeString(row?.symbol);
    if (!symbol) {
      return true;
    }

    return !knownSymbols.has(symbol.toUpperCase());
  });
}

export function createPortfolioRouter({
  snapshotsRepository,
  scansRepository = null,
  tokenIconService = null
}) {
  const router = Router();

  router.get('/dashboard', async (req, res, next) => {
    try {
      const walletIds = parseWalletIdsQueryParam(req.query.walletIds);
      const walletFilterSet = walletIds.length > 0 ? new Set(walletIds) : null;
      const [snapshotPayload, liveScanPayload] = await Promise.all([
        snapshotsRepository.getLatestDashboardPayload(),
        scansRepository?.getLatestDashboardPayloadFromScans
          ? scansRepository.getLatestDashboardPayloadFromScans()
          : Promise.resolve(null)
      ]);
      const useLiveScans = liveScanPayload?.hasLiveScans === true;
      const payload = useLiveScans ? liveScanPayload : snapshotPayload;
      const snapshotStatus = useLiveScans ? 'live_scan' : payload.latestSnapshot?.status ?? 'queued';
      const baseRows = payload?.rows || { tokens: [], protocols: [] };
      const sourceTokenRows = baseRows.tokens || [];
      const scopedTokenRows = walletFilterSet
        ? sourceTokenRows.filter((row) => walletFilterSet.has(normalizeString(row?.walletId)))
        : sourceTokenRows;
      const aggregatedTokenRows = aggregateTokenRows(scopedTokenRows);
      const visibleTokenRows = filterTokenRowsByMinUsdValue(aggregatedTokenRows);
      const tokenRows = tokenIconService?.enrichTokenRows
        ? await tokenIconService.enrichTokenRows(visibleTokenRows)
        : visibleTokenRows;
      res.json({
        data: {
          ...payload,
          rows: {
            ...baseRows,
            tokens: tokenRows
          },
          jobs: {
            snapshot: {
              status: snapshotStatus,
              errorMessage: useLiveScans ? null : payload.latestSnapshot?.errorMessage ?? null
            }
          }
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/history', async (req, res, next) => {
    try {
      const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : null;
      const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : null;

      const totals = await snapshotsRepository.getHistory({ fromDate, toDate });
      res.json({ data: { totals } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
