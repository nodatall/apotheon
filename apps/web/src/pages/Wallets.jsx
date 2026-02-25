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
  const [busyKey, setBusyKey] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [expandedWalletGroups, setExpandedWalletGroups] = useState(() => new Set());
  const [submittingWallet, setSubmittingWallet] = useState(false);
  const [submittingToken, setSubmittingToken] = useState(false);
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

        return {
          ...group,
          chainCount: sortedWallets.length,
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
    const groupIds = new Set(walletGroups.map((group) => group.id));
    setExpandedWalletGroups((previous) => {
      const next = new Set([...previous].filter((groupId) => groupIds.has(groupId)));
      if (next.size === previous.size) {
        return previous;
      }
      return next;
    });
  }, [walletGroups]);

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
      setScanResult({
        status: token.scanSummary?.message || token.walletScanStatus,
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

  function toggleWalletGroup(groupId) {
    setExpandedWalletGroups((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
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
              <TableColumn className="text-right">Action</TableColumn>
            </TableHeader>
            <TableBody emptyContent="No addresses added yet.">
              {walletGroups.flatMap((group) => {
                const isExpanded = expandedWalletGroups.has(group.id);
                const hasChildren = group.chainCount > 1;
                const primaryWallet = group.wallets[0] || null;
                const parentChainLabel = hasChildren
                  ? `${group.chainCount} chains`
                  : (primaryWallet
                    ? (chainNameById.get(primaryWallet.chainId) || primaryWallet.chainId || '-')
                    : '-');
                const rows = [
                  <TableRow key={`group-${group.id}`}>
                    <TableCell>
                      <span>{group.displayLabel}</span>
                    </TableCell>
                    <TableCell title={group.addressTitle || '-'}>
                      {group.addressDisplay || '-'}
                    </TableCell>
                    <TableCell>{parentChainLabel}</TableCell>
                    <TableCell className="text-right">
                      {hasChildren ? (
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onPress={() => toggleWalletGroup(group.id)}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${group.displayLabel}`}
                          title={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          <span className="wallet-group-expand-icon" aria-hidden="true">
                            {isExpanded ? '▾' : '▸'}
                          </span>
                        </Button>
                      ) : (primaryWallet ? (
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="danger"
                          title="Remove address"
                          aria-label="Remove address"
                          onPress={() => removeWallet(primaryWallet.id)}
                          isLoading={busyKey === `wallet-${primaryWallet.id}`}
                        >
                          ×
                        </Button>
                      ) : null)}
                    </TableCell>
                  </TableRow>
                ];

                if (hasChildren && isExpanded) {
                  for (const wallet of group.wallets) {
                    rows.push(
                      <TableRow key={`group-${group.id}-wallet-${wallet.id}`}>
                        <TableCell>
                          <span className="wallet-group-child-label">
                            {wallet.label || '-'}
                          </span>
                        </TableCell>
                        <TableCell title={wallet.address || '-'}>{shortAddress(wallet.address || '-')}</TableCell>
                        <TableCell>{chainNameById.get(wallet.chainId) || wallet.chainId || '-'}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            color="danger"
                            title="Remove address"
                            aria-label="Remove address"
                            onPress={() => removeWallet(wallet.id)}
                            isLoading={busyKey === `wallet-${wallet.id}`}
                          >
                            ×
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  }
                }

                return rows;
              })}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

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
    </div>
  );
}
