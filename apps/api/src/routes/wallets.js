import { Router } from 'express';
import { isWalletUniqueViolation } from '../db/repositories/wallets.repository.js';
import { normalizeAddressForChain } from '../services/shared/address-normalization.js';

function isEvmAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function isSolanaAddress(address) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function validateAddressForChain(chainFamily, address) {
  if (chainFamily === 'evm') {
    return isEvmAddress(address);
  }

  if (chainFamily === 'solana') {
    return isSolanaAddress(address);
  }

  return false;
}

function deriveOnboardingHints({ scanStatus, scanError }) {
  const message = typeof scanError === 'string' ? scanError.toLowerCase() : '';
  return {
    needsUniverseRefresh: message.includes('no scan-eligible universe snapshot'),
    canRescan: scanStatus !== 'running'
  };
}

export function createWalletsRouter({
  chainsRepository,
  walletsRepository,
  scansRepository,
  walletScanService
}) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const wallets = await walletsRepository.listWallets({
        chainId: req.query.chainId ? String(req.query.chainId) : null,
        includeInactive
      });
      res.json({ data: wallets });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    const chainId = typeof req.body?.chainId === 'string' ? req.body.chainId.trim() : '';
    const rawAddress = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : null;

    if (!chainId || !rawAddress) {
      res.status(400).json({ error: 'chainId and address are required.' });
      return;
    }

    try {
      const chain = await chainsRepository.getChainById(chainId);
      if (!chain) {
        res.status(400).json({ error: 'Unknown chainId.' });
        return;
      }

      if (!validateAddressForChain(chain.family, rawAddress)) {
        res.status(400).json({ error: `Address format is invalid for chain family ${chain.family}.` });
        return;
      }

      const normalizedAddress = normalizeAddressForChain({
        family: chain.family,
        address: rawAddress
      });

      const wallet = await walletsRepository.createWallet({
        chainId,
        address: normalizedAddress,
        label
      });

      let scan = null;
      let scanError = null;
      try {
        scan = await walletScanService.runScan({ walletId: wallet.id });
      } catch (error) {
        scanError = error instanceof Error ? error.message : String(error);
      }
      const scanStatus = scan?.scanRun?.status ?? 'failed';
      const onboardingHints = deriveOnboardingHints({ scanStatus, scanError });

      res.status(201).json({
        data: {
          ...wallet,
          walletUniverseScanId: scan?.scanRun?.id ?? null,
          universeSnapshotId: scan?.universeSnapshotId ?? null,
          scanStatus,
          scanError,
          ...onboardingHints
        }
      });
    } catch (error) {
      if (isWalletUniqueViolation(error)) {
        res.status(409).json({ error: 'Wallet already exists for this chain.' });
        return;
      }

      next(error);
    }
  });

  router.post('/:id/rescan', async (req, res, next) => {
    try {
      const outcome = await walletScanService.rescanWallet({ walletId: req.params.id });
      res.status(202).json({
        data: {
          walletUniverseScanId: outcome.scanRun.id,
          status: outcome.scanRun.status,
          universeSnapshotId: outcome.universeSnapshotId
        }
      });
    } catch (error) {
      if (error instanceof Error && /Wallet not found/.test(error.message)) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof Error && /No scan-eligible universe snapshot/.test(error.message)) {
        res.status(409).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.patch('/:id/activation', async (req, res, next) => {
    if (typeof req.body?.isActive !== 'boolean') {
      res.status(400).json({ error: 'isActive (boolean) is required.' });
      return;
    }

    try {
      const wallet = await walletsRepository.setWalletActive(req.params.id, req.body.isActive);
      if (!wallet) {
        res.status(404).json({ error: 'Wallet not found.' });
        return;
      }

      res.json({ data: wallet });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/onboarding-status', async (req, res, next) => {
    try {
      const wallet = await walletsRepository.getWalletById(req.params.id);
      if (!wallet) {
        res.status(404).json({ error: 'Wallet not found.' });
        return;
      }

      const latestScan = await scansRepository.getLatestScanByWallet(req.params.id);
      const scanStatus = latestScan?.status ?? null;
      const scanError = latestScan?.errorMessage ?? null;

      res.json({
        data: {
          walletId: req.params.id,
          scanStatus,
          scanError,
          ...deriveOnboardingHints({ scanStatus, scanError })
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/jobs/status', async (req, res, next) => {
    try {
      const latestScan = await scansRepository.getLatestScanByWallet(req.params.id);
      if (!latestScan) {
        res.status(404).json({ error: 'No scan runs found for wallet.' });
        return;
      }

      res.json({
        data: {
          status: latestScan.status,
          errorMessage: latestScan.errorMessage,
          startedAt: latestScan.startedAt,
          finishedAt: latestScan.finishedAt,
          universeSnapshotId: latestScan.universeSnapshotId
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
