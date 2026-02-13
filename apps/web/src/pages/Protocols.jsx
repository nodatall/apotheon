import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const DEFAULT_ABI_MAPPING = JSON.stringify(
  {
    positionRead: {
      function: 'balanceOf',
      args: ['$walletAddress'],
      returns: 'uint256'
    }
  },
  null,
  2
);

export default function Protocols() {
  const [protocols, setProtocols] = useState([]);
  const [chains, setChains] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    chainId: '',
    contractAddress: '',
    label: '',
    category: 'staking',
    abiMappingText: DEFAULT_ABI_MAPPING
  });

  async function refresh() {
    const [protocolRows, chainRows] = await Promise.all([api.getProtocols(), api.getChains()]);
    setProtocols(protocolRows || []);
    setChains(chainRows || []);
  }

  useEffect(() => {
    refresh().catch((loadError) => setError(loadError.message));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');

    try {
      const abiMapping = JSON.parse(form.abiMappingText);
      await api.addProtocol({
        chainId: form.chainId,
        contractAddress: form.contractAddress,
        label: form.label,
        category: form.category,
        abiMapping
      });
      await refresh();
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  return (
    <div className="page-grid">
      <section className="card">
        <h2>Protocol Contracts</h2>
        {error ? <p className="error">{error}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Category</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {protocols.map((item) => (
              <tr key={item.id}>
                <td>{item.label}</td>
                <td>{item.category}</td>
                <td>{item.validationStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>Add Protocol Contract</h3>
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
            Contract Address
            <input
              value={form.contractAddress}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, contractAddress: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Label
            <input
              value={form.label}
              onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
              required
            />
          </label>
          <label>
            ABI Mapping JSON
            <textarea
              rows={8}
              value={form.abiMappingText}
              onChange={(event) => setForm((prev) => ({ ...prev, abiMappingText: event.target.value }))}
              required
            />
          </label>
          <button type="submit">Save Protocol</button>
        </form>
      </section>
    </div>
  );
}
