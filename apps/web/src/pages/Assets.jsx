import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

function formatUsd(value) {
  if (typeof value !== 'number') {
    return 'Unknown';
  }
  return `$${value.toFixed(2)}`;
}

export default function Assets() {
  const [dashboard, setDashboard] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [chains, setChains] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [tokenForm, setTokenForm] = useState({
    chainId: '',
    walletId: '',
    contractOrMint: '',
    symbol: ''
  });
  const [walletForm, setWalletForm] = useState({
    chainId: '',
    address: '',
    label: ''
  });
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState('');

  async function refresh() {
    const [dashboardPayload, tokenRows, chainRows, walletRows] = await Promise.all([
      api.getDashboard(),
      api.getTokens(),
      api.getChains(),
      api.getWallets()
    ]);
    setDashboard(dashboardPayload || null);
    setTokens(tokenRows || []);
    setChains(chainRows || []);
    setWallets(walletRows || []);
  }

  useEffect(() => {
    refresh().catch((loadError) => setError(loadError.message));
  }, []);

  async function submitWallet(event) {
    event.preventDefault();
    setError('');

    try {
      const createdWallet = await api.createWallet(walletForm);
      setWalletForm({
        chainId: walletForm.chainId,
        address: '',
        label: ''
      });
      setTokenForm((previous) => ({
        ...previous,
        chainId: previous.chainId || createdWallet.chainId,
        walletId: createdWallet.id
      }));
      await refresh();
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  async function submitToken(event) {
    event.preventDefault();
    setError('');
    setScanResult(null);

    try {
      const token = await api.addToken({
        chainId: tokenForm.chainId,
        walletId: tokenForm.walletId || undefined,
        contractOrMint: tokenForm.contractOrMint,
        symbol: tokenForm.symbol || undefined
      });
      setTokenForm({
        chainId: tokenForm.chainId,
        walletId: tokenForm.walletId,
        contractOrMint: '',
        symbol: ''
      });
      setScanResult({
        status: token.walletScanStatus,
        error: token.walletScanError
      });
      await refresh();
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  const filteredWallets = useMemo(
    () => wallets.filter((wallet) => !tokenForm.chainId || wallet.chainId === tokenForm.chainId),
    [wallets, tokenForm.chainId]
  );

  const tokenRows = useMemo(
    () =>
      [...(dashboard?.rows?.tokens || [])].sort((left, right) => {
        const leftValue = typeof left.usdValue === 'number' ? left.usdValue : -1;
        const rightValue = typeof right.usdValue === 'number' ? right.usdValue : -1;
        return rightValue - leftValue;
      }),
    [dashboard?.rows?.tokens]
  );

  return (
    <div className="page-grid">
      <section className="card hero">
        <h2>Assets</h2>
        <p className="metric">{formatUsd(dashboard?.totals?.portfolioUsdValue)}</p>
        <p className="muted">
          Source:{' '}
          {dashboard?.jobs?.snapshot?.status === 'live_scan'
            ? 'Live wallet scans'
            : dashboard?.latestSnapshot?.snapshotDateUtc || 'No snapshots yet'}
        </p>
      </section>

      <section className="card hero">
        <h3>Asset Values</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Quantity</th>
              <th>USD Value</th>
              <th>Valuation</th>
            </tr>
          </thead>
          <tbody>
            {tokenRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No valued token positions yet.
                </td>
              </tr>
            ) : (
              tokenRows.map((row) => (
                <tr key={row.snapshotItemId}>
                  <td>{row.symbol || row.contractOrMint || 'n/a'}</td>
                  <td>{Number(row.quantity).toFixed(6)}</td>
                  <td>{formatUsd(row.usdValue)}</td>
                  <td>{row.valuationStatus}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>Add Wallet</h3>
        {error ? <p className="error">{error}</p> : null}
        <form className="form" onSubmit={submitWallet}>
          <label>
            Chain
            <select
              value={walletForm.chainId}
              onChange={(event) =>
                setWalletForm((previous) => ({ ...previous, chainId: event.target.value }))
              }
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
            Wallet address
            <input
              value={walletForm.address}
              onChange={(event) =>
                setWalletForm((previous) => ({ ...previous, address: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Label (optional)
            <input
              value={walletForm.label}
              onChange={(event) =>
                setWalletForm((previous) => ({ ...previous, label: event.target.value }))
              }
            />
          </label>
          <button type="submit">Add Wallet</button>
        </form>
      </section>

      <section className="card">
        <h3>Add Token</h3>
        <form className="form" onSubmit={submitToken}>
          <label>
            Chain
            <select
              value={tokenForm.chainId}
              onChange={(event) =>
                setTokenForm((previous) => ({
                  ...previous,
                  chainId: event.target.value,
                  walletId: ''
                }))
              }
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
            Wallet to update (optional)
            <select
              value={tokenForm.walletId}
              onChange={(event) =>
                setTokenForm((previous) => ({ ...previous, walletId: event.target.value }))
              }
            >
              <option value="">None</option>
              {filteredWallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.address}
                </option>
              ))}
            </select>
          </label>
          <label>
            Contract or mint
            <input
              value={tokenForm.contractOrMint}
              onChange={(event) =>
                setTokenForm((previous) => ({ ...previous, contractOrMint: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Symbol override (optional)
            <input
              value={tokenForm.symbol}
              onChange={(event) =>
                setTokenForm((previous) => ({ ...previous, symbol: event.target.value }))
              }
            />
          </label>
          <button type="submit">Add Token</button>
        </form>
        {scanResult?.status ? <p className="muted">Wallet scan status: {scanResult.status}</p> : null}
        {scanResult?.error ? <p className="error">Wallet scan error: {scanResult.error}</p> : null}
      </section>

      <section className="card">
        <h3>Tracked Tokens</h3>
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
    </div>
  );
}
