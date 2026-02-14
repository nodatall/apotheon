import { Router } from 'express';
import { normalizeAddressForChain } from '../services/shared/address-normalization.js';
import { AbiMappingValidationError } from '../services/protocols/abi-mapping-validator.js';

export function createProtocolsRouter({ chainsRepository, protocolContractService }) {
  const router = Router();

  router.get('/contracts', async (req, res, next) => {
    try {
      const chainId = typeof req.query.chainId === 'string' ? req.query.chainId : null;
      const rows = await protocolContractService.listProtocolContracts({ chainId });
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  router.post('/contracts', async (req, res, next) => {
    const chainId = typeof req.body?.chainId === 'string' ? req.body.chainId.trim() : '';
    const contractAddress =
      typeof req.body?.contractAddress === 'string' ? req.body.contractAddress.trim() : '';
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';

    if (!chainId || !contractAddress || !label || !category) {
      res.status(400).json({
        error: 'chainId, contractAddress, label, and category are required.'
      });
      return;
    }

    if (typeof req.body?.abiMapping !== 'object' || req.body.abiMapping === null) {
      res.status(400).json({ error: 'abiMapping object is required.' });
      return;
    }

    try {
      const chain = await chainsRepository.getChainById(chainId);
      if (!chain) {
        res.status(400).json({ error: 'Unknown chainId.' });
        return;
      }

      const normalizedContractAddress = normalizeAddressForChain({
        family: chain.family,
        address: contractAddress
      });

      const contract = await protocolContractService.createProtocolContract({
        chainId,
        contractAddress: normalizedContractAddress,
        label,
        category,
        abiMapping: req.body.abiMapping
      });

      res.status(201).json({ data: contract });
    } catch (error) {
      if (error instanceof AbiMappingValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error?.code === '23505') {
        res.status(409).json({ error: 'Protocol contract already exists for this chain/label.' });
        return;
      }
      next(error);
    }
  });

  return router;
}
