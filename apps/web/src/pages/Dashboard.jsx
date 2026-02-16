import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { JobStatusPanel } from '../components/JobStatusPanel.jsx';

function formatUsd(value) {
  if (typeof value !== 'number') {
    return 'Unknown';
  }
  return `$${value.toFixed(2)}`;
}

function sortByUsdDesc(rows) {
  return [...rows].sort((left, right) => {
    const leftValue = typeof left.usdValue === 'number' ? left.usdValue : -1;
    const rightValue = typeof right.usdValue === 'number' ? right.usdValue : -1;
    if (leftValue !== rightValue) {
      return rightValue - leftValue;
    }

    const leftSymbol = String(left.symbol || '').toLowerCase();
    const rightSymbol = String(right.symbol || '').toLowerCase();
    return leftSymbol.localeCompare(rightSymbol);
  });
}

export default function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const payload = await api.getDashboard();
        if (mounted) {
          setDashboard(payload);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const tokenRows = useMemo(
    () => sortByUsdDesc(dashboard?.rows?.tokens || []),
    [dashboard?.rows?.tokens]
  );
  const protocolRows = useMemo(
    () => sortByUsdDesc(dashboard?.rows?.protocols || []),
    [dashboard?.rows?.protocols]
  );

  return (
    <div className="page-grid">
      <section className="card hero">
        <h2>Portfolio Dashboard</h2>
        {loading ? <p className="muted">Loading dashboard…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <p className="metric">{formatUsd(dashboard?.totals?.portfolioUsdValue)}</p>
        <p className="muted">
          Latest UTC date: {dashboard?.latestSnapshot?.snapshotDateUtc || 'No snapshots yet'}
        </p>
      </section>

      <section className="card">
        <h3>Totals</h3>
        <table className="table">
          <tbody>
            <tr>
              <th>Portfolio</th>
              <td>{formatUsd(dashboard?.totals?.portfolioUsdValue)}</td>
            </tr>
            <tr>
              <th>Tokens</th>
              <td>{formatUsd(dashboard?.totals?.tokenUsdValue)}</td>
            </tr>
            <tr>
              <th>Protocols</th>
              <td>{formatUsd(dashboard?.totals?.protocolUsdValue)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <JobStatusPanel
        title="Snapshot Job"
        status={dashboard?.jobs?.snapshot?.status}
        errorMessage={dashboard?.jobs?.snapshot?.errorMessage}
        meta={{ snapshotDateUtc: dashboard?.latestSnapshot?.snapshotDateUtc || null }}
      />

      <section className="card hero">
        <h3>Token Positions</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Quantity</th>
              <th>USD Price</th>
              <th>USD Value</th>
              <th>Valuation</th>
            </tr>
          </thead>
          <tbody>
            {tokenRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No token rows in latest snapshot.
                </td>
              </tr>
            ) : (
              tokenRows.map((row) => (
                <tr key={row.snapshotItemId}>
                  <td>{row.symbol || 'n/a'}</td>
                  <td>{Number(row.quantity).toFixed(6)}</td>
                  <td>{formatUsd(row.usdPrice)}</td>
                  <td>{formatUsd(row.usdValue)}</td>
                  <td>{row.valuationStatus}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="card hero">
        <h3>Protocol Positions</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Protocol</th>
              <th>Category</th>
              <th>Symbol</th>
              <th>Quantity</th>
              <th>USD Price</th>
              <th>USD Value</th>
              <th>Valuation</th>
            </tr>
          </thead>
          <tbody>
            {protocolRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No protocol rows in latest snapshot.
                </td>
              </tr>
            ) : (
              protocolRows.map((row) => (
                <tr key={row.snapshotItemId}>
                  <td>{row.protocolLabel || 'n/a'}</td>
                  <td>{row.protocolCategory || 'n/a'}</td>
                  <td>{row.symbol || 'n/a'}</td>
                  <td>{Number(row.quantity).toFixed(6)}</td>
                  <td>{formatUsd(row.usdPrice)}</td>
                  <td>{formatUsd(row.usdValue)}</td>
                  <td>{row.valuationStatus}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
