import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function History() {
  const [totals, setTotals] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getHistory()
      .then((data) => setTotals(data?.totals || []))
      .catch((loadError) => setError(loadError.message));
  }, []);

  const sparklinePoints = totals.map((row) => row.totalUsdValue || 0);
  const max = Math.max(...sparklinePoints, 1);

  return (
    <div className="page-grid">
      <section className="card">
        <h2>Snapshot History</h2>
        {error ? <p className="error">{error}</p> : null}
        <div className="sparkline" aria-hidden>
          {sparklinePoints.map((value, index) => (
            <span
              key={`${totals[index]?.snapshotDateUtc}-${index}`}
              style={{ height: `${(value / max) * 100}%` }}
            />
          ))}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Total USD</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((row) => (
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
