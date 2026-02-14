import { Router } from 'express';
import { isUniqueViolation } from '../db/repositories/chains.repository.js';
import { RpcUrlSafetyError } from '../services/chains/chain-validation.service.js';

function parseCreateChainPayload(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  const family = typeof body?.family === 'string' ? body.family.trim().toLowerCase() : '';
  const rpcUrl = typeof body?.rpcUrl === 'string' ? body.rpcUrl.trim() : '';

  if (!name || !slug || !family || !rpcUrl) {
    return { error: 'name, slug, family, and rpcUrl are required.' };
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: 'slug must contain only lowercase letters, numbers, or hyphens.' };
  }

  if (family !== 'evm' && family !== 'solana') {
    return { error: 'family must be either evm or solana.' };
  }

  const hasChainId = body?.chainId !== undefined && body?.chainId !== null;
  if (family === 'evm') {
    const chainId = Number(body?.chainId);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      return { error: 'chainId must be a positive integer for evm chains.' };
    }
    return {
      value: {
        name,
        slug,
        family,
        chainId,
        rpcUrl
      }
    };
  }

  if (family === 'solana' && hasChainId) {
    return { error: 'chainId must not be provided for solana chains.' };
  }

  return {
    value: {
      name,
      slug,
      family,
      chainId: null,
      rpcUrl
    }
  };
}

export function createChainsRouter({ chainsRepository, chainValidationService }) {
  const chainsRouter = Router();

  chainsRouter.get('/', async (_req, res, next) => {
    try {
      const chains = await chainsRepository.listChains();
      res.json({ data: chains });
    } catch (error) {
      next(error);
    }
  });

  chainsRouter.post('/', async (req, res, next) => {
    const parsed = parseCreateChainPayload(req.body);

    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    try {
      const validation = await chainValidationService.validateCustomChain(parsed.value);
      const chain = await chainsRepository.createChain({
        ...parsed.value,
        isBuiltin: false,
        isActive: true,
        validationStatus: validation.validationStatus,
        validationError: validation.validationError
      });

      res.status(201).json({ data: chain });
    } catch (error) {
      if (error instanceof RpcUrlSafetyError) {
        res.status(400).json({ error: error.message });
        return;
      }

      if (isUniqueViolation(error)) {
        res.status(409).json({ error: 'A chain with that slug already exists.' });
        return;
      }

      next(error);
    }
  });

  chainsRouter.patch('/:id/activation', async (req, res, next) => {
    if (typeof req.body?.isActive !== 'boolean') {
      res.status(400).json({ error: 'isActive (boolean) is required.' });
      return;
    }

    try {
      const chain = await chainsRepository.setChainActive(req.params.id, req.body.isActive);
      if (!chain) {
        res.status(404).json({ error: 'Chain not found.' });
        return;
      }
      res.json({ data: chain });
    } catch (error) {
      next(error);
    }
  });

  return chainsRouter;
}
