import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Assets() {
  const [tokens, setTokens] = useState([]);
  const [chains, setChains] = useState([]);
  const [form, setForm] = useState({ chainId: '', contractOrMint: '', symbol: '', name: '', decimals: '' });
  const [error, setError] = useState('');

  async function refresh() {
    const [tokenRows, chainRows] = await Promise.all([api.getTokens(), api.getChains()]);
    setTokens(tokenRows || []);
    setChains(chainRows || []);
  }

  useEffect(() => {
    refresh().catch((loadError) => setError(loadError.message));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');

    try {
      await api.addToken({
        chainId: form.chainId,
        contractOrMint: form.contractOrMint,
        symbol: form.symbol || undefined,
        name: form.name || undefined,
        decimals: form.decimals === '' ? undefined : Number(form.decimals)
      });
      setForm({ chainId: form.chainId, contractOrMint: '', symbol: '', name: '', decimals: '' });
      await refresh();
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  return (
    <div className="page-grid">
      <section className="card">
        <h2>Tracked Assets</h2>
        {error ? <p className="error">{error}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Contract/Mint</th>
              <th>Symbol</th>
              <th>Name</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => (
              <tr key={`${token.chainId}-${token.contractOrMint}`}>
                <td>{token.contractOrMint}</td>
                <td>{token.symbol || '-'}</td>
                <td>{token.name || '-'}</td>
                <td>{token.trackingSource}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>Add Manual Token</h3>
        <form className="form" onSubmit={submit}>
          <label>
            Chain
            <select
              value={form.chainId}
              onChange={(event) => setForm((prev) => ({ ...prev, chainId: event.target.value }))}
              required
            >
              <option value="">Select chain</option>
              {chains.map((chain) => (
                <option key={chain.id} value={chain.id}>
                  {chain.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Contract or Mint
            <input
              value={form.contractOrMint}
              onChange={(event) => setForm((prev) => ({ ...prev, contractOrMint: event.target.value }))}
              required
            />
          </label>
          <label>
            Symbol override
            <input
              value={form.symbol}
              onChange={(event) => setForm((prev) => ({ ...prev, symbol: event.target.value }))}
            />
          </label>
          <button type="submit">Add Token</button>
        </form>
      </section>
    </div>
  );
}
