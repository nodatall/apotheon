import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardBody,
  CardHeader
} from '@heroui/react';
import { LineChart } from '@mui/x-charts/LineChart';
import { api } from '../api/client.js';

function formatUsd(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '$0.00';
  }
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function normalizeDateKey(dateValue) {
  if (dateValue instanceof Date) {
    if (Number.isNaN(dateValue.getTime())) {
      return '';
    }
    return dateValue.toISOString().slice(0, 10);
  }

  if (typeof dateValue === 'string') {
    const trimmed = dateValue.trim();
    if (!trimmed) {
      return '';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  if (typeof dateValue === 'number') {
    const parsed = new Date(dateValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return '';
}

function formatShortDate(dateValue) {
  const dateKey = normalizeDateKey(dateValue);
  if (!dateKey) {
    return 'Unknown date';
  }

  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}

function sumUsdRows(rows) {
  if (!Array.isArray(rows)) {
    return 0;
  }

  return rows.reduce((total, row) => {
    const usdValue = Number(row?.usdValue);
    return total + (Number.isFinite(usdValue) ? usdValue : 0);
  }, 0);
}

function upsertLivePoint(rows, livePoint) {
  if (!livePoint?.snapshotDateUtc) {
    return rows;
  }

  const next = [...rows];
  const index = next.findIndex((row) => row.snapshotDateUtc === livePoint.snapshotDateUtc);
  if (index >= 0) {
    next[index] = {
      ...next[index],
      ...livePoint
    };
  } else {
    next.push(livePoint);
  }

  next.sort((left, right) => {
    if (!left.snapshotDateUtc && !right.snapshotDateUtc) {
      return 0;
    }
    if (!left.snapshotDateUtc) {
      return 1;
    }
    if (!right.snapshotDateUtc) {
      return -1;
    }
    return left.snapshotDateUtc.localeCompare(right.snapshotDateUtc);
  });

  return next;
}

export default function History() {
  const [totals, setTotals] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.getHistory(), api.getDashboard()])
      .then(([historyData, dashboardData]) => {
        let rows = (historyData?.totals || [])
          .map((row) => ({
            ...row,
            snapshotDateUtc: normalizeDateKey(row?.snapshotDateUtc),
            isLive: false
          }))
          .sort((left, right) => {
            if (!left.snapshotDateUtc && !right.snapshotDateUtc) {
              return 0;
            }
            if (!left.snapshotDateUtc) {
              return 1;
            }
            if (!right.snapshotDateUtc) {
              return -1;
            }
            return left.snapshotDateUtc.localeCompare(right.snapshotDateUtc);
          });

        const tokenRowsUsdValue = sumUsdRows(dashboardData?.rows?.tokens);
        const protocolRowsUsdValue = sumUsdRows(dashboardData?.rows?.protocols);
        const rawTotalUsdValue = Number(dashboardData?.totals?.portfolioUsdValue);
        const rawTokenUsdValue = Number(dashboardData?.totals?.tokenUsdValue);
        const rawProtocolUsdValue = Number(dashboardData?.totals?.protocolUsdValue);
        const tokenUsdValue = Number.isFinite(rawTokenUsdValue) ? rawTokenUsdValue : tokenRowsUsdValue;
        const protocolUsdValue = Number.isFinite(rawProtocolUsdValue)
          ? rawProtocolUsdValue
          : protocolRowsUsdValue;
        const totalUsdValue = Number.isFinite(rawTotalUsdValue)
          ? rawTotalUsdValue
          : tokenUsdValue + protocolUsdValue;
        const hasDashboardTotals = [totalUsdValue, tokenUsdValue, protocolUsdValue]
          .some((value) => Number.isFinite(value));

        if (hasDashboardTotals) {
          const snapshotDateUtc = normalizeDateKey(new Date());

          rows = upsertLivePoint(rows, {
            snapshotDateUtc,
            totalUsdValue: Number.isFinite(totalUsdValue) ? totalUsdValue : 0,
            tokenUsdValue: Number.isFinite(tokenUsdValue) ? tokenUsdValue : 0,
            protocolUsdValue: Number.isFinite(protocolUsdValue) ? protocolUsdValue : 0,
            isLive: dashboardData?.jobs?.snapshot?.status === 'live_scan'
          });
        }

        setTotals(rows);
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  const hasLivePoint = useMemo(() => totals.some((row) => row.isLive === true), [totals]);

  const chartLabels = useMemo(
    () => totals.map((row) => formatShortDate(row.snapshotDateUtc)),
    [totals]
  );

  const chartValues = useMemo(
    () => totals.map((row) => Number(row.totalUsdValue) || 0),
    [totals]
  );

  return (
    <div className="page-grid">
      <Card className="hero-card">
        <CardHeader>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Snapshot History</h2>
            {error ? <p className="error">{error}</p> : null}
            {hasLivePoint ? <p className="muted">Latest point is from live scan data.</p> : null}
          </div>
        </CardHeader>
        <CardBody className="pt-0 gap-4">
          <div className="history-chart">
            <LineChart
              height={420}
              margin={{ top: 12, right: 16, bottom: 8, left: 24 }}
              xAxis={[{
                scaleType: 'point',
                data: chartLabels,
                tickLabelStyle: { fill: '#C8C8C8' }
              }]}
              yAxis={[{
                valueFormatter: (value) => formatUsd(Number(value) || 0),
                tickLabelStyle: { fill: '#C8C8C8' }
              }]}
              series={[
                {
                  data: chartValues,
                  label: 'Total USD',
                  area: true,
                  showMark: false,
                  color: 'hsl(var(--heroui-primary))',
                  valueFormatter: (value) => formatUsd(Number(value) || 0)
                }
              ]}
              axisHighlight={{ x: 'line' }}
              grid={{ horizontal: true, vertical: false }}
              hideLegend
              sx={{
                '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': {
                  stroke: 'hsl(var(--heroui-default-400))'
                },
                '& .MuiChartsAxis-tickLabel, & .MuiChartsAxis-label, & .MuiChartsAxis-root text': {
                  fill: '#C8C8C8 !important'
                },
                '& .MuiChartsGrid-line': {
                  stroke: 'hsl(var(--heroui-default-200))',
                  strokeDasharray: '3 4'
                },
                '& .MuiLineElement-root': {
                  strokeWidth: 2.5
                },
                '& .MuiAreaElement-root': {
                  fillOpacity: 0.2
                }
              }}
            />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
