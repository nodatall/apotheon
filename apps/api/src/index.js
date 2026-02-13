import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { loadRuntimeEnv } from './config/env.js';
import { pool } from './db/pool.js';
import { createChainsRepository } from './db/repositories/chains.repository.js';
import { createTokenUniverseRepository } from './db/repositories/token-universe.repository.js';
import { healthRouter } from './routes/health.js';
import { createChainsRouter } from './routes/chains.js';
import { createUniverseRouter } from './routes/universe.js';
import { BUILTIN_CHAINS } from './services/chains/builtin-chains.js';
import { createChainValidationService } from './services/chains/chain-validation.service.js';
import { createUniverseRefreshService } from './services/universe/universe-refresh.service.js';
import { createBirdeyeClient } from './services/universe/universe-sources/birdeye.client.js';
import { createCoinGeckoClient } from './services/universe/universe-sources/coingecko.client.js';

dotenv.config();

export function createApp({
  chainsRepository,
  tokenUniverseRepository,
  chainValidationService,
  universeRefreshService,
  runtimeEnv = loadRuntimeEnv()
} = {}) {
  const app = express();
  const resolvedChainsRepository = chainsRepository ?? createChainsRepository({ pool });
  const resolvedTokenUniverseRepository =
    tokenUniverseRepository ?? createTokenUniverseRepository({ pool });
  const resolvedChainValidationService =
    chainValidationService ??
    createChainValidationService({
      allowUnsafeLocalRpc: runtimeEnv.allowUnsafeRpcUrls
    });
  const coingeckoClient = createCoinGeckoClient({
    apiKey: runtimeEnv.coingeckoApiKey
  });
  const resolvedUniverseRefreshService =
    universeRefreshService ??
    createUniverseRefreshService({
      chainsRepository: resolvedChainsRepository,
      tokenUniverseRepository: resolvedTokenUniverseRepository,
      birdeyeClient: createBirdeyeClient(),
      coingeckoClient
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
  app.use(
    '/api/universe',
    createUniverseRouter({
      tokenUniverseRepository: resolvedTokenUniverseRepository,
      universeRefreshService: resolvedUniverseRefreshService
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
  const runtimeEnv = loadRuntimeEnv();
  const { app, chainsRepository } = createApp({ runtimeEnv });
  await seedBuiltInChains(chainsRepository);

  app.listen(runtimeEnv.port, () => {
    console.log(`API listening on http://localhost:${runtimeEnv.port}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  start().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
