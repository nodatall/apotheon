import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { JobStatusPanel } from '../components/JobStatusPanel.jsx';

export default function Dashboard() {
  const [history, setHistory] = useState([]);
  const [snapshotStatus, setSnapshotStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [historyData, snapshotJob] = await Promise.all([
          api.getHistory(),
          api.getSnapshotJobStatus().catch(() => null)
        ]);

        if (!mounted) {
          return;
        }

        setHistory(historyData?.totals || []);
        setSnapshotStatus(snapshotJob);
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

  const latest = history[history.length - 1];

  return (
    <div className="page-grid">
      <section className="card hero">
        <h2>Portfolio Dashboard</h2>
        {loading ? <p className="muted">Loading...</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <p className="metric">${latest ? latest.totalUsdValue.toFixed(2) : '0.00'}</p>
        <p className="muted">Latest UTC date: {latest?.snapshotDateUtc || 'n/a'}</p>
      </section>

      <JobStatusPanel
        title="Snapshot Job"
        status={snapshotStatus?.status}
        errorMessage={snapshotStatus?.errorMessage}
        meta={{ snapshotDateUtc: snapshotStatus?.snapshotDateUtc }}
      />

      <section className="card">
        <h3>Recent Totals</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Total USD</th>
            </tr>
          </thead>
          <tbody>
            {history.slice(-7).map((row) => (
              <tr key={row.snapshotDateUtc}>
                <td>{row.snapshotDateUtc}</td>
                <td>${row.totalUsdValue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
