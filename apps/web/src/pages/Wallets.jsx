import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

function shortAddress(address) {
  if (typeof address !== 'string' || address.length < 12) {
    return address || '-';
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function Wallets() {
  const [wallets, setWallets] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [chains, setChains] = useState([]);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');

  async function refresh() {
    const [walletRows, tokenRows, chainRows] = await Promise.all([
      api.getWallets(),
      api.getTokens(),
      api.getChains()
    ]);
    setWallets(walletRows || []);
    setTokens(tokenRows || []);
    setChains(chainRows || []);
  }

  useEffect(() => {
    refresh().catch((loadError) => setError(loadError.message));
  }, []);

  const chainNameById = useMemo(
    () => new Map(chains.map((chain) => [chain.id, chain.name])),
    [chains]
  );

  async function removeWallet(walletId) {
    setError('');
    setBusyKey(`wallet-${walletId}`);

    try {
      await api.setWalletActivation(walletId, false);
      await refresh();
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setBusyKey('');
    }
  }

  async function removeToken(tokenId) {
    setError('');
    setBusyKey(`token-${tokenId}`);

    try {
      await api.setTokenActivation(tokenId, false);
      await refresh();
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setBusyKey('');
    }
  }

  return (
    <div className="page-grid">
      <section className="card hero">
        <h2>Wallets</h2>
        <p className="muted">Manage tracked wallets and tracked tokens.</p>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="card">
        <h3>Tracked Wallets</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Address</th>
              <th>Chain</th>
              <th className="table-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {wallets.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No wallets added yet.
                </td>
              </tr>
            ) : (
              wallets.map((wallet) => (
                <tr key={wallet.id}>
                  <td>{wallet.label || '-'}</td>
                  <td title={wallet.address}>{shortAddress(wallet.address)}</td>
                  <td>{chainNameById.get(wallet.chainId) || wallet.chainId}</td>
                  <td className="table-right">
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => removeWallet(wallet.id)}
                      disabled={busyKey === `wallet-${wallet.id}`}
                    >
                      {busyKey === `wallet-${wallet.id}` ? 'Removing...' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>Tracked Tokens</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Name</th>
              <th>Chain</th>
              <th>Contract/Mint</th>
              <th className="table-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No tokens tracked yet.
                </td>
              </tr>
            ) : (
              tokens.map((token) => (
                <tr key={token.id || `${token.chainId}-${token.contractOrMint}`}>
                  <td>{token.symbol || '-'}</td>
                  <td>{token.name || '-'}</td>
                  <td>{chainNameById.get(token.chainId) || token.chainId}</td>
                  <td title={token.contractOrMint}>{shortAddress(token.contractOrMint)}</td>
                  <td className="table-right">
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => removeToken(token.id)}
                      disabled={!token.id || busyKey === `token-${token.id}`}
                    >
                      {busyKey === `token-${token.id}` ? 'Removing...' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
