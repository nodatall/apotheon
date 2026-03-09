import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow
} from '@heroui/react';
import { api } from '../api/client.js';
import Modal from '../components/Modal.jsx';

function shortAddress(address) {
  if (typeof address !== 'string' || address.length < 12) {
    return address || '-';
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function normalizeAddressGroupKey(address) {
  const normalizedAddress = normalizeString(address);
  if (!normalizedAddress) {
    return '';
  }

  if (/^0x[a-fA-F0-9]{40}$/.test(normalizedAddress)) {
    return normalizedAddress.toLowerCase();
  }

  return normalizedAddress;
}

function getFirstSelectionKey(selection, fallbackValue = '') {
  if (selection === 'all') {
    return fallbackValue;
  }

  const first = Array.from(selection)[0];
  if (typeof first === 'string') {
    return first;
  }

  if (first === null || first === undefined) {
    return fallbackValue;
  }

  return String(first);
}

export default function Wallets() {
  const [wallets, setWallets] = useState([]);
  const [chains, setChains] = useState([]);
  const [error, setError] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [chainModalOpen, setChainModalOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [selectedWalletGroupId, setSelectedWalletGroupId] = useState('');
  const [submittingChain, setSubmittingChain] = useState(false);
  const [submittingWallet, setSubmittingWallet] = useState(false);
  const [submittingToken, setSubmittingToken] = useState(false);
  const [chainForm, setChainForm] = useState({
    name: '',
    slug: '',
    family: 'evm',
    chainId: '',
    rpcUrl: ''
  });
  const [walletForm, setWalletForm] = useState({
    chainId: '',
    address: '',
    label: ''
  });
  const [tokenForm, setTokenForm] = useState({
    chainId: '',
    contractOrMint: '',
    symbol: ''
  });

  async function refresh() {
    const [walletRows, chainRows] = await Promise.all([
      api.getWallets(),
      api.getChains()
    ]);
    setWallets(walletRows || []);
    setChains(chainRows || []);
  }

  useEffect(() => {
    refresh().catch((loadError) => setError(loadError.message));
  }, []);

  const chainNameById = useMemo(
    () => new Map(chains.map((chain) => [chain.id, chain.name])),
    [chains]
  );

  const walletGroups = useMemo(() => {
    const groups = new Map();

    for (const wallet of wallets) {
      const walletId = normalizeString(wallet?.id);
      if (!walletId) {
        continue;
      }

      const address = normalizeString(wallet?.address);
      const label = normalizeString(wallet?.label);
      const chainId = normalizeString(wallet?.chainId);
      const normalizedAddress = normalizeAddressGroupKey(address);
      const normalizedLabel = label.toLowerCase();
      const groupKey = normalizedAddress
        ? `address:${normalizedAddress}`
        : (normalizedLabel ? `label:${normalizedLabel}` : `wallet:${walletId}`);

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: groupKey,
          address,
          label,
          wallets: []
        });
      }

      const group = groups.get(groupKey);
      if (!group.address && address) {
        group.address = address;
      }
      if (!group.label && label) {
        group.label = label;
      }
      group.wallets.push({
        ...wallet,
        id: walletId,
        chainId,
        address,
        label
      });
    }

    return Array.from(groups.values())
      .map((group) => {
        const sortedWallets = [...group.wallets].sort((left, right) => {
          const leftChain = chainNameById.get(left.chainId) || left.chainId || '';
          const rightChain = chainNameById.get(right.chainId) || right.chainId || '';
          return leftChain.localeCompare(rightChain);
        });
        const uniqueChainIds = Array.from(
          new Set(sortedWallets.map((wallet) => wallet.chainId).filter(Boolean))
        );
        const chainLabels = uniqueChainIds
          .map((chainId) => chainNameById.get(chainId) || chainId)
          .filter(Boolean);
        const uniqueAddresses = Array.from(
          new Set(sortedWallets.map((wallet) => wallet.address).filter(Boolean))
        );
        const primaryAddress = uniqueAddresses[0] || group.address || '';
        const addressDisplay = primaryAddress
          ? shortAddress(primaryAddress)
          : '-';
        const addressSuffix = uniqueAddresses.length > 1
          ? ` +${uniqueAddresses.length - 1}`
          : '';
        const chainSummary = chainLabels.length <= 3
          ? (chainLabels.join(', ') || '-')
          : `${chainLabels.slice(0, 3).join(', ')} +${chainLabels.length - 3}`;

        return {
          ...group,
          chainCount: chainLabels.length,
          chainLabels,
          chainSummary,
          chainTitle: chainLabels.join(', '),
          displayLabel: group.label || shortAddress(primaryAddress) || '-',
          wallets: sortedWallets,
          primaryAddress,
          addressDisplay: `${addressDisplay}${addressSuffix}`.trim(),
          addressTitle: uniqueAddresses.length > 1 ? uniqueAddresses.join(', ') : primaryAddress
        };
      })
      .sort((left, right) => left.displayLabel.localeCompare(right.displayLabel));
  }, [wallets, chainNameById]);

  useEffect(() => {
    if (!selectedWalletGroupId) {
      return;
    }

    const groupStillExists = walletGroups.some((group) => group.id === selectedWalletGroupId);
    if (!groupStillExists) {
      setSelectedWalletGroupId('');
    }
  }, [walletGroups, selectedWalletGroupId]);

  const selectedWalletGroup = useMemo(
    () => walletGroups.find((group) => group.id === selectedWalletGroupId) || null,
    [walletGroups, selectedWalletGroupId]
  );

  async function submitChain(event) {
    event.preventDefault();
    setError('');
    setSubmittingChain(true);

    try {
      const payload = {
        name: chainForm.name,
        slug: chainForm.slug,
        family: chainForm.family,
        rpcUrl: chainForm.rpcUrl
      };
      if (chainForm.family === 'evm') {
        payload.chainId = Number(chainForm.chainId);
      }
      const created = await api.createChain(payload);
      setTokenForm((previous) => ({
        ...previous,
        chainId: created?.id || previous.chainId
      }));

      setChainForm({
        name: '',
        slug: '',
        family: 'evm',
        chainId: '',
        rpcUrl: ''
      });
      setChainModalOpen(false);
      await refresh();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmittingChain(false);
    }
  }

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
            chainId: addedRows[0].chainId
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
        chainId: previous.chainId || createdWallet.chainId
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
        contractOrMint: tokenForm.contractOrMint,
        symbol: tokenForm.symbol || undefined
      });
      setTokenForm((previous) => ({
        ...previous,
        contractOrMint: '',
        symbol: ''
      }));
      const propagation = token.propagationSummary;
      const propagationNote =
        propagation &&
        (propagation.createdCount > 0 || propagation.reactivatedCount > 0 || propagation.alreadyTrackedCount > 0)
          ? ` Propagated addresses: +${propagation.createdCount} new, ${propagation.reactivatedCount} restored, ${propagation.alreadyTrackedCount} already tracked.`
          : '';
      setScanResult({
        status: `${token.scanSummary?.message || token.walletScanStatus || 'Token added.'}${propagationNote}`,
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

  return (
    <div className="page-grid">
      <Card className="hero-card">
        <CardHeader className="asset-toolbar">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Addresses</h2>
            <p className="muted">Manage tracked addresses and tracked tokens.</p>
          </div>
          <div className="asset-toolbar-side">
            <div className="button-row">
              <Button className="ap-pill-button" onPress={() => setChainModalOpen(true)}>
                Add Chain
              </Button>
              <Button className="ap-pill-button" onPress={() => setWalletModalOpen(true)}>
                Add Address
              </Button>
              <Button className="ap-pill-button" onPress={() => setTokenModalOpen(true)}>
                Add Token
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardBody className="pt-0 gap-2">
          {error ? <p className="error">{error}</p> : null}
          {scanResult?.status ? (
            <Chip color="primary" variant="flat" className="w-fit">
              Status: {scanResult.status}
            </Chip>
          ) : null}
          {scanResult?.error ? <p className="error">Scan error: {scanResult.error}</p> : null}
        </CardBody>
      </Card>

      <Card className="panel-card wallets-tracked-addresses-card">
        <CardHeader>
          <h3 className="text-base font-semibold">Tracked Addresses</h3>
        </CardHeader>
        <CardBody className="pt-0">
          <Table
            aria-label="Tracked addresses"
            removeWrapper
          >
            <TableHeader>
              <TableColumn>Label</TableColumn>
              <TableColumn>Address</TableColumn>
              <TableColumn>Chain</TableColumn>
            </TableHeader>
            <TableBody emptyContent="No addresses added yet.">
              {walletGroups.map((group) => (
                <TableRow
                  key={`group-${group.id}`}
                  className="wallet-row-clickable"
                  tabIndex={0}
                  onClick={() => setSelectedWalletGroupId(group.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedWalletGroupId(group.id);
                    }
                  }}
                >
                  <TableCell>
                    <span>{group.displayLabel}</span>
                  </TableCell>
                  <TableCell title={group.addressTitle || '-'}>
                    {group.addressDisplay || '-'}
                  </TableCell>
                  <TableCell title={group.chainTitle || '-'}>
                    <span className="wallet-chain-summary">
                      {group.chainSummary || '-'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      {chainModalOpen ? (
        <Modal title="Add Chain" onClose={() => setChainModalOpen(false)}>
          <form className="form-grid" onSubmit={submitChain}>
            <Input
              label="Chain name"
              value={chainForm.name}
              onValueChange={(value) =>
                setChainForm((previous) => ({
                  ...previous,
                  name: value
                }))
              }
              isRequired
            />

            <Input
              label="Chain slug"
              value={chainForm.slug}
              onValueChange={(value) =>
                setChainForm((previous) => ({
                  ...previous,
                  slug: value
                }))
              }
              isRequired
            />

            <Select
              label="Family"
              selectedKeys={[chainForm.family]}
              onSelectionChange={(keys) =>
                setChainForm((previous) => ({
                  ...previous,
                  family: getFirstSelectionKey(keys, 'evm')
                }))
              }
              isRequired
            >
              <SelectItem key="evm">evm</SelectItem>
              <SelectItem key="solana">solana</SelectItem>
            </Select>

            {chainForm.family === 'evm' ? (
              <Input
                label="Chain ID"
                type="number"
                value={chainForm.chainId}
                onValueChange={(value) =>
                  setChainForm((previous) => ({
                    ...previous,
                    chainId: value
                  }))
                }
                isRequired
              />
            ) : null}

            <Input
              label="RPC URL"
              value={chainForm.rpcUrl}
              onValueChange={(value) =>
                setChainForm((previous) => ({
                  ...previous,
                  rpcUrl: value
                }))
              }
              isRequired
            />

            <div className="button-row">
              <Button variant="flat" onPress={() => setChainModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="ap-pill-button" isLoading={submittingChain}>
                {submittingChain ? 'Saving chain' : 'Save Chain'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {walletModalOpen ? (
        <Modal title="Add Address" onClose={() => setWalletModalOpen(false)}>
          <form className="form-grid" onSubmit={submitWallet}>
            <Select
              label="Chain"
              selectedKeys={walletForm.chainId ? [walletForm.chainId] : []}
              onSelectionChange={(keys) =>
                setWalletForm((previous) => ({
                  ...previous,
                  chainId: getFirstSelectionKey(keys)
                }))
              }
              isRequired
            >
              <SelectItem key="__all__">All active chains (auto-detect balances)</SelectItem>
              {chains.map((chain) => (
                <SelectItem key={chain.id}>{chain.name}</SelectItem>
              ))}
            </Select>

            <Input
              label="Address"
              value={walletForm.address}
              onValueChange={(value) =>
                setWalletForm((previous) => ({
                  ...previous,
                  address: value
                }))
              }
              isRequired
            />

            <Input
              label="Label (optional)"
              value={walletForm.label}
              onValueChange={(value) =>
                setWalletForm((previous) => ({
                  ...previous,
                  label: value
                }))
              }
            />

            <div className="button-row">
              <Button variant="flat" onPress={() => setWalletModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="ap-pill-button" isLoading={submittingWallet}>
                {submittingWallet ? 'Scanning chains' : 'Add Address'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {tokenModalOpen ? (
        <Modal title="Add Token" onClose={() => setTokenModalOpen(false)}>
          <form className="form-grid" onSubmit={submitToken}>
            <Select
              label="Chain"
              selectedKeys={tokenForm.chainId ? [tokenForm.chainId] : []}
              onSelectionChange={(keys) =>
                setTokenForm((previous) => ({
                  ...previous,
                  chainId: getFirstSelectionKey(keys)
                }))
              }
              isRequired
            >
              {chains.map((chain) => (
                <SelectItem key={chain.id}>{chain.name}</SelectItem>
              ))}
            </Select>

            <Input
              label="Contract or mint"
              value={tokenForm.contractOrMint}
              onValueChange={(value) =>
                setTokenForm((previous) => ({
                  ...previous,
                  contractOrMint: value
                }))
              }
              isRequired
            />

            <Input
              label="Symbol override (optional)"
              value={tokenForm.symbol}
              onValueChange={(value) =>
                setTokenForm((previous) => ({
                  ...previous,
                  symbol: value
                }))
              }
            />

            <div className="button-row">
              <Button variant="flat" onPress={() => setTokenModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="ap-pill-button" isLoading={submittingToken}>
                {submittingToken ? 'Adding token' : 'Add Token'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {selectedWalletGroup ? (
        <Modal
          title={`Supported Chains • ${selectedWalletGroup.displayLabel}`}
          onClose={() => setSelectedWalletGroupId('')}
        >
          <div className="wallet-group-details">
            <p className="muted">Address: {selectedWalletGroup.primaryAddress || '-'}</p>
            <ul className="wallet-group-chain-list">
              {selectedWalletGroup.chainLabels.length > 0 ? (
                selectedWalletGroup.chainLabels.map((chainLabel) => (
                  <li key={`${selectedWalletGroup.id}-${chainLabel}`}>{chainLabel}</li>
                ))
              ) : (
                <li>-</li>
              )}
            </ul>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
