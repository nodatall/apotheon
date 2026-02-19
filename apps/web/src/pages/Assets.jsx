import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import Modal from '../components/Modal.jsx';

const AVATAR_COLORS = [
  ['#1d4ed8', '#3b82f6'],
  ['#0f766e', '#14b8a6'],
  ['#b45309', '#f59e0b'],
  ['#9333ea', '#7c3aed'],
  ['#be123c', '#f43f5e'],
  ['#0e7490', '#06b6d4']
];

function formatUsd(value, { minimumFractionDigits = 2, maximumFractionDigits = 2 } = {}) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }

  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits,
    maximumFractionDigits
  });
}

function formatAmount(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }

  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  });
}

function getTokenLabel(row) {
  const symbol = typeof row?.symbol === 'string' ? row.symbol.trim() : '';
  if (symbol) {
    return symbol.toUpperCase();
  }

  const contractOrMint = typeof row?.contractOrMint === 'string' ? row.contractOrMint.trim() : '';
  if (contractOrMint) {
    return contractOrMint.slice(0, 8);
  }

  return 'UNKNOWN';
}

function getAvatarStyle(label) {
  const seed = Array.from(label).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const [fromColor, toColor] = AVATAR_COLORS[seed % AVATAR_COLORS.length];
  return {
    background: `linear-gradient(135deg, ${fromColor} 0%, ${toColor} 100%)`
  };
}

export default function Assets() {
  const [dashboard, setDashboard] = useState(null);
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
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [submittingWallet, setSubmittingWallet] = useState(false);
  const [submittingToken, setSubmittingToken] = useState(false);

  async function refresh() {
    const [dashboardPayload, chainRows, walletRows] = await Promise.all([
      api.getDashboard(),
      api.getChains(),
      api.getWallets()
    ]);
    setDashboard(dashboardPayload || null);
    setChains(chainRows || []);
    setWallets(walletRows || []);
  }

  useEffect(() => {
    refresh().catch((loadError) => setError(loadError.message));
  }, []);

  async function submitWallet(event) {
    event.preventDefault();
    setError('');
    setSubmittingWallet(true);

    try {
      const createdWallet = await api.createWallet(walletForm);
      setWalletForm((previous) => ({
        ...previous,
        address: '',
        label: ''
      }));
      setTokenForm((previous) => ({
        ...previous,
        chainId: previous.chainId || createdWallet.chainId,
        walletId: createdWallet.id
      }));
      setWalletModalOpen(false);
      await refresh();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmittingWallet(false);
    }
  }

  async function submitToken(event) {
    event.preventDefault();
    setError('');
    setScanResult(null);
    setSubmittingToken(true);

    try {
      const token = await api.addToken({
        chainId: tokenForm.chainId,
        walletId: tokenForm.walletId || undefined,
        contractOrMint: tokenForm.contractOrMint,
        symbol: tokenForm.symbol || undefined
      });
      setTokenForm((previous) => ({
        ...previous,
        contractOrMint: '',
        symbol: ''
      }));
      setScanResult({
        status: token.walletScanStatus,
        error: token.walletScanError
      });
      setTokenModalOpen(false);
      await refresh();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmittingToken(false);
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
        <div className="asset-toolbar">
          <div>
            <h2>Wallet</h2>
            <p className="muted">
              Source:{' '}
              {dashboard?.jobs?.snapshot?.status === 'live_scan'
                ? 'Live wallet scans'
                : dashboard?.latestSnapshot?.snapshotDateUtc || 'No snapshots yet'}
            </p>
          </div>
          <div className="asset-toolbar-side">
            <p className="metric">
              {formatUsd(dashboard?.totals?.portfolioUsdValue, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
              })}
            </p>
            <div className="button-row">
              <button type="button" className="primary-button" onClick={() => setWalletModalOpen(true)}>
                Add Wallet
              </button>
              <button type="button" className="ghost-button" onClick={() => setTokenModalOpen(true)}>
                Add Token
              </button>
            </div>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {scanResult?.status ? <p className="muted">Wallet scan status: {scanResult.status}</p> : null}
        {scanResult?.error ? <p className="error">Wallet scan error: {scanResult.error}</p> : null}
      </section>

      <section className="card hero">
        <table className="table assets-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Price</th>
              <th>Amount</th>
              <th className="table-right">USD Value</th>
            </tr>
          </thead>
          <tbody>
            {tokenRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No token balances yet.
                </td>
              </tr>
            ) : (
              tokenRows.map((row) => {
                const label = getTokenLabel(row);
                return (
                  <tr key={row.snapshotItemId || `${row.assetRefId || 'row'}-${row.walletId || 'unknown'}`}>
                    <td>
                      <div className="token-cell">
                        <span className="token-avatar" style={getAvatarStyle(label)} aria-hidden>
                          {label.slice(0, 1)}
                        </span>
                        <span className="token-symbol">{label}</span>
                      </div>
                    </td>
                    <td>{formatUsd(row.usdPrice, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
                    <td>{formatAmount(row.quantity)}</td>
                    <td className="table-right">{formatUsd(row.usdValue)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {walletModalOpen ? (
        <Modal title="Add Wallet" onClose={() => setWalletModalOpen(false)}>
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
            <div className="button-row">
              <button type="button" className="ghost-button" onClick={() => setWalletModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={submittingWallet}>
                {submittingWallet ? 'Adding...' : 'Add Wallet'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {tokenModalOpen ? (
        <Modal title="Add Token" onClose={() => setTokenModalOpen(false)}>
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
                    {wallet.label || wallet.address}
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
            <div className="button-row">
              <button type="button" className="ghost-button" onClick={() => setTokenModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={submittingToken}>
                {submittingToken ? 'Adding...' : 'Add Token'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
