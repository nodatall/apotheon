import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { loadRuntimeEnv } from './config/env.js';
import { pool } from './db/pool.js';
import { createChainsRepository } from './db/repositories/chains.repository.js';
import { createScansRepository } from './db/repositories/scans.repository.js';
import { createSnapshotsRepository } from './db/repositories/snapshots.repository.js';
import { createTrackedTokensRepository } from './db/repositories/tracked-tokens.repository.js';
import { createTokenUniverseRepository } from './db/repositories/token-universe.repository.js';
import { createWalletsRepository } from './db/repositories/wallets.repository.js';
import { healthRouter } from './routes/health.js';
import { createAssetsRouter } from './routes/assets.js';
import { createChainsRouter } from './routes/chains.js';
import { createPortfolioRouter } from './routes/portfolio.js';
import { createProtocolsRouter } from './routes/protocols.js';
import { createSnapshotsRouter } from './routes/snapshots.js';
import { createUniverseRouter } from './routes/universe.js';
import { createWalletsRouter } from './routes/wallets.js';
import { BUILTIN_CHAINS } from './services/chains/builtin-chains.js';
import { createChainValidationService } from './services/chains/chain-validation.service.js';
import { createUniverseRefreshService } from './services/universe/universe-refresh.service.js';
import { createBirdeyeClient } from './services/universe/universe-sources/birdeye.client.js';
import { createCoinGeckoClient } from './services/universe/universe-sources/coingecko.client.js';
import { createProtocolContractService } from './services/protocols/protocol-contract.service.js';
import { createProtocolPositionResolver } from './services/protocols/protocol-position-resolver.js';
import { createDailySnapshotService } from './services/snapshots/daily-snapshot.service.js';
import { createManualTokenService } from './services/tokens/manual-token.service.js';
import { createTokenIconService } from './services/tokens/token-icon.service.js';
import { createValuationService } from './services/valuation/valuation.service.js';
import { createDexscreenerClient } from './services/valuation/dexscreener.client.js';
import { createBalanceBatcher } from './services/wallet-scan/balance-batcher.js';
import { createEvmBalanceResolver } from './services/wallet-scan/evm-balance-resolver.js';
import { createWalletScanService } from './services/wallet-scan/wallet-scan.service.js';
import { createScheduler } from './jobs/scheduler.js';

dotenv.config();

export function createApp({
  chainsRepository,
  walletsRepository,
  scansRepository,
  snapshotsRepository,
  trackedTokensRepository,
  tokenUniverseRepository,
  chainValidationService,
  universeRefreshService,
  walletScanService,
  runtimeEnv = loadRuntimeEnv()
} = {}) {
  const app = express();
  const resolvedChainsRepository = chainsRepository ?? createChainsRepository({ pool });
  const resolvedWalletsRepository = walletsRepository ?? createWalletsRepository({ pool });
  const resolvedScansRepository = scansRepository ?? createScansRepository({ pool });
  const resolvedSnapshotsRepository =
    snapshotsRepository ?? createSnapshotsRepository({ pool });
  const resolvedTrackedTokensRepository =
    trackedTokensRepository ?? createTrackedTokensRepository({ pool });
  const resolvedTokenUniverseRepository =
    tokenUniverseRepository ?? createTokenUniverseRepository({ pool });
  const resolvedChainValidationService =
    chainValidationService ??
    createChainValidationService({
      allowUnsafeLocalRpc: runtimeEnv.allowUnsafeRpcUrls
    });
  const coingeckoClient = createCoinGeckoClient({
    apiKey: runtimeEnv.coingeckoApiKey,
    baseUrl: runtimeEnv.coingeckoBaseUrl,
    keyMode: runtimeEnv.coingeckoKeyMode
  });
  const birdeyeClient = runtimeEnv.birdeyeApiKey
    ? createBirdeyeClient({ apiKey: runtimeEnv.birdeyeApiKey })
    : null;
  const resolvedUniverseRefreshService =
    universeRefreshService ??
    createUniverseRefreshService({
      chainsRepository: resolvedChainsRepository,
      tokenUniverseRepository: resolvedTokenUniverseRepository,
      birdeyeClient,
      coingeckoClient
    });
  const dexscreenerClient = createDexscreenerClient();
  const valuationService = createValuationService({
    coingeckoClient,
    dexFallbackClient: dexscreenerClient
  });
  const tokenIconService = createTokenIconService({
    chainsRepository: resolvedChainsRepository,
    coingeckoClient
  });
  const resolvedWalletScanService =
    walletScanService ??
    createWalletScanService({
      chainsRepository: resolvedChainsRepository,
      walletsRepository: resolvedWalletsRepository,
      tokenUniverseRepository: resolvedTokenUniverseRepository,
      scansRepository: resolvedScansRepository,
      trackedTokensRepository: resolvedTrackedTokensRepository,
      universeRefreshService: resolvedUniverseRefreshService,
      valuationService,
      balanceBatcher: createBalanceBatcher({
        evmResolver: createEvmBalanceResolver()
      })
    });
  const manualTokenService = createManualTokenService({
    trackedTokensRepository: resolvedTrackedTokensRepository
  });
  const protocolContractService = createProtocolContractService({ pool });
  const protocolPositionResolver = createProtocolPositionResolver();
  const dailySnapshotService = createDailySnapshotService({
    chainsRepository: resolvedChainsRepository,
    walletsRepository: resolvedWalletsRepository,
    scansRepository: resolvedScansRepository,
    snapshotsRepository: resolvedSnapshotsRepository,
    valuationService,
    protocolContractService,
    protocolPositionResolver
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
  app.use(
    '/api/wallets',
    createWalletsRouter({
      chainsRepository: resolvedChainsRepository,
      walletsRepository: resolvedWalletsRepository,
      scansRepository: resolvedScansRepository,
      walletScanService: resolvedWalletScanService
    })
  );
  app.use(
    '/api/assets',
    createAssetsRouter({
      chainsRepository: resolvedChainsRepository,
      walletsRepository: resolvedWalletsRepository,
      walletScanService: resolvedWalletScanService,
      manualTokenService,
      trackedTokensRepository: resolvedTrackedTokensRepository
    })
  );
  app.use(
    '/api/protocols',
    createProtocolsRouter({
      chainsRepository: resolvedChainsRepository,
      protocolContractService
    })
  );
  app.use(
    '/api/snapshots',
    createSnapshotsRouter({
      dailySnapshotService,
      snapshotsRepository: resolvedSnapshotsRepository
    })
  );
  app.use(
    '/api/portfolio',
    createPortfolioRouter({
      snapshotsRepository: resolvedSnapshotsRepository,
      scansRepository: resolvedScansRepository,
      tokenIconService
    })
  );

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return {
    app,
    chainsRepository: resolvedChainsRepository,
    walletsRepository: resolvedWalletsRepository,
    trackedTokensRepository: resolvedTrackedTokensRepository,
    tokenUniverseRepository: resolvedTokenUniverseRepository,
    walletScanService: resolvedWalletScanService,
    universeRefreshService: resolvedUniverseRefreshService,
    dailySnapshotService
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
  const {
    app,
    chainsRepository,
    walletsRepository,
    trackedTokensRepository,
    tokenUniverseRepository,
    walletScanService,
    universeRefreshService,
    dailySnapshotService
  } = createApp({
    runtimeEnv
  });
  await seedBuiltInChains(chainsRepository);

  const server = app.listen(runtimeEnv.port, () => {
    console.log(`API listening on http://localhost:${runtimeEnv.port}`);
  });

  const scheduler = createScheduler({
    chainsRepository,
    walletsRepository,
    trackedTokensRepository,
    tokenUniverseRepository,
    walletScanService,
    universeRefreshService,
    dailySnapshotService
  });

  scheduler.runAutoScanCycle().catch((error) => {
    console.error('Initial scheduler run failed:', error);
  });

  const intervalMs = Number(process.env.AUTO_SCAN_INTERVAL_MS || process.env.SCHEDULER_INTERVAL_MS || 300_000);
  const timer = setInterval(() => {
    scheduler.runAutoScanCycle().catch((error) => {
      console.error('Scheduled job run failed:', error);
    });
  }, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 300_000);
  timer.unref?.();

  return server;
}

if (process.env.NODE_ENV !== 'test') {
  start().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
