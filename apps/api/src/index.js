import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { pool } from './db/pool.js';
import { createChainsRepository } from './db/repositories/chains.repository.js';
import { healthRouter } from './routes/health.js';
import { createChainsRouter } from './routes/chains.js';
import { BUILTIN_CHAINS } from './services/chains/builtin-chains.js';
import { createChainValidationService } from './services/chains/chain-validation.service.js';

dotenv.config();

export function createApp({ chainsRepository, chainValidationService } = {}) {
  const app = express();
  const resolvedChainsRepository = chainsRepository ?? createChainsRepository({ pool });
  const resolvedChainValidationService =
    chainValidationService ??
    createChainValidationService({
      allowUnsafeLocalRpc: process.env.ALLOW_UNSAFE_RPC_URLS === 'true'
    });

  app.use(cors());
  app.use(express.json());

  app.use('/health', healthRouter);
  app.use(
    '/api/chains',
    createChainsRouter({
      chainsRepository: resolvedChainsRepository,
      chainValidationService: resolvedChainValidationService
    })
  );

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return {
    app,
    chainsRepository: resolvedChainsRepository
  };
}

async function seedBuiltInChains(chainsRepository) {
  try {
    await chainsRepository.upsertBuiltInChains(BUILTIN_CHAINS);
  } catch (error) {
    console.error('Failed to seed built-in chains:', error);
  }
}

async function start() {
  const port = Number(process.env.PORT || 4000);
  const { app, chainsRepository } = createApp();
  await seedBuiltInChains(chainsRepository);

  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
