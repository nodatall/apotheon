import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { JobStatusPanel } from '../components/JobStatusPanel.jsx';

function formatScanStatus(status) {
  return status || 'not_started';
}

export default function Settings() {
  const [chains, setChains] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [error, setError] = useState('');
  const [newChain, setNewChain] = useState({
    name: '',
    slug: '',
    family: 'evm',
    chainId: '',
    rpcUrl: ''
  });
  const [newWallet, setNewWallet] = useState({ chainId: '', address: '', label: '' });
  const [selectedChainId, setSelectedChainId] = useState('');
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const [universeStatus, setUniverseStatus] = useState(null);
  const [walletStatus, setWalletStatus] = useState(null);
  const [snapshotStatus, setSnapshotStatus] = useState(null);
  const [walletOutcome, setWalletOutcome] = useState(null);

  const selectedChain = useMemo(
    () => chains.find((chain) => chain.id === selectedChainId) || null,
    [chains, selectedChainId]
  );
  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.id === selectedWalletId) || null,
    [wallets, selectedWalletId]
  );
  const chainNameById = useMemo(
    () =>
      chains.reduce((accumulator, chain) => {
        accumulator[chain.id] = chain.name;
        return accumulator;
      }, {}),
    [chains]
  );
  const recentWallets = useMemo(() => wallets.slice(0, 5), [wallets]);
  const walletDisplay =
    selectedWallet?.address || walletOutcome?.address || walletOutcome?.walletId || selectedWalletId || 'n/a';

  async function refresh() {
    const [chainRows, walletRows] = await Promise.all([api.getChains(), api.getWallets()]);
    let snapshotJob = null;
    try {
      snapshotJob = await api.getSnapshotJobStatus();
    } catch (snapshotError) {
      setError(snapshotError instanceof Error ? snapshotError.message : String(snapshotError));
    }

    setChains(chainRows || []);
    setWallets(walletRows || []);
    setSnapshotStatus(snapshotJob);
  }

  async function refreshWalletOutcome(walletId) {
    if (!walletId) {
      setWalletOutcome(null);
      return;
    }

    const [statusResult, onboardingResult] = await Promise.allSettled([
      api.getWalletJobStatus(walletId),
      api.getWalletOnboardingStatus(walletId)
    ]);

    if (statusResult.status === 'fulfilled') {
      setWalletStatus(statusResult.value);
    } else {
      setWalletStatus(null);
      setError(statusResult.reason instanceof Error ? statusResult.reason.message : String(statusResult.reason));
    }

    if (onboardingResult.status === 'fulfilled') {
      const onboarding = onboardingResult.value;
      const onboardingWallet = wallets.find((wallet) => wallet.id === onboarding.walletId) || null;
      setWalletOutcome({
        walletId: onboarding.walletId,
        address: onboardingWallet?.address || null,
        scanStatus: onboarding.scanStatus,
        scanError: onboarding.scanError,
        needsUniverseRefresh: onboarding.needsUniverseRefresh,
        canRescan: onboarding.canRescan
      });
    } else {
      setWalletOutcome({
        walletId,
        address: wallets.find((wallet) => wallet.id === walletId)?.address || null,
        scanStatus: null,
        scanError: 'Unable to load onboarding status.',
        needsUniverseRefresh: false,
        canRescan: true
      });
      setError(
        onboardingResult.reason instanceof Error
          ? onboardingResult.reason.message
          : String(onboardingResult.reason)
      );
    }
  }

  useEffect(() => {
    refresh().catch((loadError) => setError(loadError.message));
  }, []);

  useEffect(() => {
    if (!selectedChainId) {
      setUniverseStatus(null);
      return;
    }

    api
      .getUniverseJobStatus(selectedChainId)
      .then((data) => setUniverseStatus(data))
      .catch((loadError) => setError(loadError.message));
  }, [selectedChainId]);

  useEffect(() => {
    if (!selectedWalletId) {
      setWalletStatus(null);
      setWalletOutcome(null);
      return;
    }

    setWalletOutcome(null);
    refreshWalletOutcome(selectedWalletId).catch((loadError) => setError(loadError.message));
  }, [selectedWalletId]);

  async function submitChain(event) {
    event.preventDefault();
    setError('');

    try {
      await api.createChain({
        name: newChain.name,
        slug: newChain.slug,
        family: newChain.family,
        chainId: newChain.family === 'evm' ? Number(newChain.chainId) : undefined,
        rpcUrl: newChain.rpcUrl
      });
      setNewChain({ name: '', slug: '', family: 'evm', chainId: '', rpcUrl: '' });
      await refresh();
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  async function submitWallet(event) {
    event.preventDefault();
    setError('');

    try {
      const createdWallet = await api.createWallet(newWallet);
      setNewWallet({ chainId: newWallet.chainId, address: '', label: '' });
      setSelectedWalletId(createdWallet.id);
      setSelectedChainId(createdWallet.chainId);
      setWalletOutcome({
        walletId: createdWallet.id,
        address: createdWallet.address,
        scanStatus: createdWallet.scanStatus,
        scanError: createdWallet.scanError,
        needsUniverseRefresh: createdWallet.needsUniverseRefresh,
        canRescan: createdWallet.canRescan
      });
      await refresh();
      await refreshWalletOutcome(createdWallet.id);
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  async function refreshUniverse() {
    if (!selectedChainId) {
      return;
    }

    setError('');
    try {
      await api.refreshUniverse(selectedChainId);
      const status = await api.getUniverseJobStatus(selectedChainId);
      setUniverseStatus(status);
    } catch (runError) {
      setError(runError.message);
    }
  }

  async function runSnapshot() {
    setError('');
    try {
      await api.runSnapshot({ force: true });
      const status = await api.getSnapshotJobStatus();
      setSnapshotStatus(status);
    } catch (runError) {
      setError(runError.message);
    }
  }

  async function rescanSelectedWallet() {
    if (!selectedWalletId) {
      return;
    }

    setError('');
    try {
      await api.rescanWallet(selectedWalletId);
      await refreshWalletOutcome(selectedWalletId);
    } catch (runError) {
      setError(runError.message);
    }
  }

  async function refreshSelectedWalletOnboarding() {
    if (!selectedWalletId) {
      return;
    }

    setError('');
    try {
      await refreshWalletOutcome(selectedWalletId);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    }
  }

  return (
    <div className="page-grid">
      <section className="card">
        <h2>Operations</h2>
        {error ? <p className="error">{error}</p> : null}

        <div className="button-row">
          <button type="button" onClick={runSnapshot}>
            Run Snapshot Now
          </button>
          <button type="button" onClick={refreshUniverse} disabled={!selectedChainId}>
            Refresh Selected Chain Universe
          </button>
          <button type="button" onClick={rescanSelectedWallet} disabled={!selectedWalletId}>
            Re-Scan Selected Wallet
          </button>
          <button
            type="button"
            onClick={refreshSelectedWalletOnboarding}
            disabled={!selectedWalletId}
          >
            Refresh Onboarding Status
          </button>
        </div>

        <label>
          Active chain for job actions
          <select
            value={selectedChainId}
            onChange={(event) => setSelectedChainId(event.target.value)}
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
          Active wallet for job actions
          <select
            value={selectedWalletId}
            onChange={(event) => setSelectedWalletId(event.target.value)}
          >
            <option value="">Select wallet</option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.address}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card">
        <h3>Add Chain</h3>
        <form className="form" onSubmit={submitChain}>
          <input
            placeholder="Name"
            value={newChain.name}
            onChange={(event) => setNewChain((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <input
            placeholder="slug"
            value={newChain.slug}
            onChange={(event) => setNewChain((prev) => ({ ...prev, slug: event.target.value }))}
            required
          />
          <select
            value={newChain.family}
            onChange={(event) => setNewChain((prev) => ({ ...prev, family: event.target.value }))}
          >
            <option value="evm">evm</option>
            <option value="solana">solana</option>
          </select>
          {newChain.family === 'evm' ? (
            <input
              placeholder="chain id"
              type="number"
              value={newChain.chainId}
              onChange={(event) => setNewChain((prev) => ({ ...prev, chainId: event.target.value }))}
              required
            />
          ) : null}
          <input
            placeholder="RPC URL"
            value={newChain.rpcUrl}
            onChange={(event) => setNewChain((prev) => ({ ...prev, rpcUrl: event.target.value }))}
            required
          />
          <button type="submit">Create Chain</button>
        </form>
      </section>

      <section className="card">
        <h3>Add Wallet</h3>
        <form className="form" onSubmit={submitWallet}>
          <label>
            Wallet chain
            <select
              value={newWallet.chainId}
              onChange={(event) =>
                setNewWallet((prev) => ({ ...prev, chainId: event.target.value }))
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
          <input
            placeholder="Wallet address"
            value={newWallet.address}
            onChange={(event) => setNewWallet((prev) => ({ ...prev, address: event.target.value }))}
            required
          />
          <input
            placeholder="Label"
            value={newWallet.label}
            onChange={(event) => setNewWallet((prev) => ({ ...prev, label: event.target.value }))}
          />
          <button type="submit">Add Wallet</button>
        </form>
      </section>

      <section className="card hero">
        <h3>Wallet Onboarding Outcome</h3>
        {!walletOutcome ? (
          <p className="muted">Add or select a wallet to view onboarding status.</p>
        ) : (
          <>
            <p className={`pill pill-${formatScanStatus(walletOutcome.scanStatus)}`}>
              scan: {formatScanStatus(walletOutcome.scanStatus)}
            </p>
            <p className="muted">
              Wallet: {walletDisplay}
            </p>
            {walletOutcome.scanError ? <p className="error">{walletOutcome.scanError}</p> : null}
            <div className="list-row">
              <span className="pill">
                needsUniverseRefresh: {walletOutcome.needsUniverseRefresh ? 'yes' : 'no'}
              </span>
              <span className="pill">canRescan: {walletOutcome.canRescan ? 'yes' : 'no'}</span>
            </div>
          </>
        )}
      </section>

      <section className="card hero">
        <h3>Recent Wallets</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Address</th>
              <th>Chain</th>
              <th>Label</th>
            </tr>
          </thead>
          <tbody>
            {recentWallets.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted">
                  No wallets yet.
                </td>
              </tr>
            ) : (
              recentWallets.map((wallet) => (
                <tr key={wallet.id}>
                  <td>{wallet.address}</td>
                  <td>{chainNameById[wallet.chainId] || wallet.chainId}</td>
                  <td>{wallet.label || 'n/a'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <JobStatusPanel
        title="Universe Job"
        status={universeStatus?.status}
        errorMessage={universeStatus?.errorMessage}
        meta={{ chain: selectedChain?.name || null }}
      />
      <JobStatusPanel
        title="Wallet Scan Job"
        status={walletStatus?.status}
        errorMessage={walletStatus?.errorMessage}
        meta={{ walletId: selectedWalletId || null }}
      />
      <JobStatusPanel
        title="Snapshot Job"
        status={snapshotStatus?.status}
        errorMessage={snapshotStatus?.errorMessage}
      />
    </div>
  );
}
