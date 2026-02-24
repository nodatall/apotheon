import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const CHART_WIDTH = 960;
const CHART_HEIGHT = 280;
const MARGIN = { top: 20, right: 18, bottom: 44, left: 64 };

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

function buildTickIndexes(length) {
  if (length <= 6) {
    return Array.from({ length }, (_, index) => index);
  }

  const step = Math.ceil((length - 1) / 5);
  const indexes = [];
  for (let index = 0; index < length; index += step) {
    indexes.push(index);
  }
  if (indexes[indexes.length - 1] !== length - 1) {
    indexes.push(length - 1);
  }
  return indexes;
}

function getX(index, count, plotWidth) {
  if (count <= 1) {
    return MARGIN.left + plotWidth / 2;
  }
  return MARGIN.left + (index / (count - 1)) * plotWidth;
}

function buildLinePath(points) {
  if (points.length === 0) {
    return '';
  }

  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

export default function History() {
  const [totals, setTotals] = useState([]);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getHistory()
      .then((data) => {
        const rows = (data?.totals || [])
          .map((row) => ({
            ...row,
            snapshotDateUtc: normalizeDateKey(row?.snapshotDateUtc)
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
        setTotals(rows);
        setHoveredIndex(rows.length > 0 ? rows.length - 1 : null);
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  const plotWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxValue = useMemo(
    () => Math.max(...totals.map((row) => Number(row.totalUsdValue) || 0), 1),
    [totals]
  );

  const points = useMemo(
    () =>
      totals.map((row, index) => {
        const value = Number(row.totalUsdValue) || 0;
        const x = getX(index, totals.length, plotWidth);
        const y = MARGIN.top + (1 - value / maxValue) * plotHeight;
        return { x, y, value };
      }),
    [totals, maxValue, plotHeight, plotWidth]
  );

  const linePath = useMemo(() => buildLinePath(points), [points]);
  const areaPath = useMemo(() => {
    if (points.length === 0) {
      return '';
    }
    const first = points[0];
    const last = points[points.length - 1];
    return `${linePath} L ${last.x} ${MARGIN.top + plotHeight} L ${first.x} ${MARGIN.top + plotHeight} Z`;
  }, [points, linePath, plotHeight]);

  const tickIndexes = useMemo(() => buildTickIndexes(totals.length), [totals.length]);
  const activeIndex = hoveredIndex ?? (totals.length > 0 ? totals.length - 1 : null);
  const activeRow = activeIndex === null ? null : totals[activeIndex];
  const activePoint = activeIndex === null ? null : points[activeIndex];

  function handleMouseMove(event) {
    if (totals.length === 0) {
      return;
    }

    const { left, width } = event.currentTarget.getBoundingClientRect();
    const mouseX = ((event.clientX - left) / width) * CHART_WIDTH;
    const clampedX = Math.min(Math.max(mouseX, MARGIN.left), MARGIN.left + plotWidth);
    const ratio = plotWidth === 0 ? 0 : (clampedX - MARGIN.left) / plotWidth;
    const nearestIndex = Math.round(ratio * (totals.length - 1));
    setHoveredIndex(nearestIndex);
  }

  return (
    <div className="page-grid">
      <section className="card hero">
        <h2>Snapshot History</h2>
        {error ? <p className="error">{error}</p> : null}

        <div className="history-chart" onMouseMove={handleMouseMove} onMouseLeave={() => setHoveredIndex(null)}>
          <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="Asset value history chart">
            <line
              x1={MARGIN.left}
              y1={MARGIN.top + plotHeight}
              x2={CHART_WIDTH - MARGIN.right}
              y2={MARGIN.top + plotHeight}
              className="history-axis-line"
            />
            {[0.25, 0.5, 0.75, 1].map((fraction) => {
              const y = MARGIN.top + plotHeight - plotHeight * fraction;
              return (
                <line
                  key={fraction}
                  x1={MARGIN.left}
                  y1={y}
                  x2={CHART_WIDTH - MARGIN.right}
                  y2={y}
                  className="history-grid-line"
                />
              );
            })}

            {areaPath ? <path d={areaPath} className="history-area" /> : null}
            {linePath ? <path d={linePath} className="history-line" /> : null}

            {activePoint ? (
              <>
                <line
                  x1={activePoint.x}
                  y1={MARGIN.top}
                  x2={activePoint.x}
                  y2={MARGIN.top + plotHeight}
                  className="history-hover-line"
                />
                <circle cx={activePoint.x} cy={activePoint.y} r="4.5" className="history-point-active" />
              </>
            ) : null}

            {points.map((point, index) => (
              <circle
                key={`${totals[index].snapshotDateUtc || 'unknown'}-${index}-hit`}
                cx={point.x}
                cy={point.y}
                r="14"
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(index)}
              />
            ))}

            {tickIndexes.map((index) => {
              const row = totals[index];
              const x = getX(index, totals.length, plotWidth);
              return (
                <g key={`${row.snapshotDateUtc || 'unknown'}-${index}-tick`}>
                  <line
                    x1={x}
                    y1={MARGIN.top + plotHeight}
                    x2={x}
                    y2={MARGIN.top + plotHeight + 6}
                    className="history-axis-line"
                  />
                  <text x={x} y={CHART_HEIGHT - 14} textAnchor="middle" className="history-tick-label">
                    {formatShortDate(row.snapshotDateUtc)}
                  </text>
                </g>
              );
            })}
          </svg>

          {activeRow && activePoint ? (
            <div
              className="history-tooltip"
              style={{
                left: `${Math.min(Math.max(activePoint.x, 150), CHART_WIDTH - 150)}px`,
                top: `${Math.max(activePoint.y - 10, 28)}px`
              }}
            >
              <p>{formatShortDate(activeRow.snapshotDateUtc)}</p>
              <p>Total: {formatUsd(Number(activeRow.totalUsdValue) || 0)}</p>
              <p>Tokens: {formatUsd(Number(activeRow.tokenUsdValue) || 0)}</p>
              <p>Protocols: {formatUsd(Number(activeRow.protocolUsdValue) || 0)}</p>
            </div>
          ) : null}
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Total USD</th>
              <th>Tokens USD</th>
              <th>Protocols USD</th>
            </tr>
          </thead>
          <tbody>
            {totals.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No snapshot history yet.
                </td>
              </tr>
            ) : (
              totals.map((row, index) => (
                <tr key={`${row.snapshotDateUtc || 'unknown'}-${index}`}>
                  <td>{row.snapshotDateUtc || 'Unknown date'}</td>
                  <td>{formatUsd(Number(row.totalUsdValue) || 0)}</td>
                  <td>{formatUsd(Number(row.tokenUsdValue) || 0)}</td>
                  <td>{formatUsd(Number(row.protocolUsdValue) || 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
