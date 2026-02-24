import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import Modal from '../components/Modal.jsx';

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
  const [scanResult, setScanResult] = useState(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [submittingWallet, setSubmittingWallet] = useState(false);
  const [submittingToken, setSubmittingToken] = useState(false);
  const [walletForm, setWalletForm] = useState({
    chainId: '',
    address: '',
    label: ''
  });
  const [tokenForm, setTokenForm] = useState({
    chainId: '',
    walletId: '',
    contractOrMint: '',
    symbol: ''
  });

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

  const filteredWallets = useMemo(
    () => wallets.filter((wallet) => !tokenForm.chainId || wallet.chainId === tokenForm.chainId),
    [wallets, tokenForm.chainId]
  );

  async function submitWallet(event) {
    event.preventDefault();
    setError('');
    setScanResult(null);
    setSubmittingWallet(true);

    try {
      if (walletForm.chainId === '__all__') {
        const summary = await api.createWallet(walletForm);
        const addedRows = Array.isArray(summary?.added) ? summary.added : [];
        const skippedRows = Array.isArray(summary?.skipped) ? summary.skipped : [];
        const checkedChainCount =
          typeof summary?.checkedChainCount === 'number' ? summary.checkedChainCount : 0;
        const noBalanceCount = skippedRows.filter((item) => item.reason === 'no_token_balances').length;
        const incompatibleCount = skippedRows.filter(
          (item) => item.reason === 'invalid_address_format'
        ).length;
        const alreadyTrackedCount = skippedRows.filter((item) => item.reason === 'already_tracked').length;
        const failedScanCount = skippedRows.filter((item) => item.reason === 'scan_failed').length;

        const details = [];
        if (noBalanceCount > 0) {
          details.push(`${noBalanceCount} with no balances`);
        }
        if (incompatibleCount > 0) {
          details.push(`${incompatibleCount} incompatible address format`);
        }
        if (alreadyTrackedCount > 0) {
          details.push(`${alreadyTrackedCount} already tracked`);
        }
        if (failedScanCount > 0) {
          details.push(`${failedScanCount} scan failures`);
        }

        setScanResult({
          status: `Added on ${addedRows.length} of ${checkedChainCount} active chains${
            details.length > 0 ? ` (${details.join(', ')})` : ''
          }.`,
          error:
            addedRows.length === 0 ? 'No token balances found for this address on active chains.' : null
        });
        if (addedRows.length === 1) {
          setTokenForm((previous) => ({
            ...previous,
            chainId: addedRows[0].chainId,
            walletId: addedRows[0].id
          }));
        }
        setWalletForm((previous) => ({
          ...previous,
          address: '',
          label: ''
        }));
        setWalletModalOpen(false);
        await refresh();
        return;
      }

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
        <div className="asset-toolbar">
          <div>
            <h2>Addresses</h2>
            <p className="muted">Manage tracked addresses and tracked tokens.</p>
          </div>
          <div className="asset-toolbar-side">
            <div className="button-row">
              <button type="button" className="primary-button" onClick={() => setWalletModalOpen(true)}>
                Add Address
              </button>
              <button type="button" className="primary-button" onClick={() => setTokenModalOpen(true)}>
                Add Token
              </button>
            </div>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {scanResult?.status ? <p className="muted">Address scan status: {scanResult.status}</p> : null}
        {scanResult?.error ? <p className="error">Address scan error: {scanResult.error}</p> : null}
      </section>

      <section className="card">
        <h3>Tracked Addresses</h3>
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
                  No addresses added yet.
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
                      className="table-x-button"
                      title="Remove address"
                      aria-label="Remove address"
                      onClick={() => removeWallet(wallet.id)}
                      disabled={busyKey === `wallet-${wallet.id}`}
                    >
                      {busyKey === `wallet-${wallet.id}` ? '…' : 'X'}
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
                      className="table-x-button"
                      title="Remove token"
                      aria-label="Remove token"
                      onClick={() => removeToken(token.id)}
                      disabled={!token.id || busyKey === `token-${token.id}`}
                    >
                      {busyKey === `token-${token.id}` ? '…' : 'X'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {walletModalOpen ? (
        <Modal title="Add Address" onClose={() => setWalletModalOpen(false)}>
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
                <option value="__all__">All active chains (auto-detect balances)</option>
                {chains.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Address
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
              <button
                type="submit"
                className={`primary-button${submittingWallet ? ' is-loading' : ''}`}
                disabled={submittingWallet}
                aria-busy={submittingWallet}
              >
                {submittingWallet ? (
                  <>
                    <span className="button-spinner" aria-hidden />
                    <span className="button-loading-text">Scanning chains</span>
                  </>
                ) : (
                  'Add Address'
                )}
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
              Address to update (optional)
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
