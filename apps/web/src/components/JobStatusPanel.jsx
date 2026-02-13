import React from 'react';

export function JobStatusPanel({ title, status, errorMessage, meta }) {
  return (
    <section className="card">
      <header className="card-header">
        <h3>{title}</h3>
      </header>
      <p className={`pill pill-${status || 'unknown'}`}>status: {status || 'unknown'}</p>
      {errorMessage ? <p className="error">{errorMessage}</p> : <p className="muted">No errors.</p>}
      {meta ? <pre className="meta">{JSON.stringify(meta, null, 2)}</pre> : null}
    </section>
  );
}
