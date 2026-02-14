import { Page, Request, Route } from '@playwright/test';

type Chain = {
  id: string;
  name: string;
  slug: string;
  family: 'evm' | 'solana';
};

type Wallet = {
  id: string;
  chainId: string;
  address: string;
  label: string;
};

type Token = {
  id: string;
  chainId: string;
  contractOrMint: string;
  symbol: string;
  name: string;
  trackingSource: string;
};

type Protocol = {
  id: string;
  chainId: string;
  contractAddress: string;
  label: string;
  category: string;
  validationStatus: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseChainFamily(value: unknown): Chain['family'] {
  return value === 'solana' ? 'solana' : 'evm';
}

function ok(route: Route, data: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ data })
  });
}

function fail(route: Route, error: string, status = 400) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ error })
  });
}

function parseRequestBody(request: Request): Record<string, unknown> {
  try {
    const parsed = request.postDataJSON?.();
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function registerDeterministicApiMocks(page: Page) {
  const chains: Chain[] = [
    { id: 'chain-eth', name: 'Ethereum', slug: 'ethereum', family: 'evm' },
    { id: 'chain-sol', name: 'Solana', slug: 'solana', family: 'solana' }
  ];
  const wallets: Wallet[] = [];
  const tokens: Token[] = [];
  const protocols: Protocol[] = [];

  await page.route('**/*', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (!path.startsWith('/api/')) {
      await route.continue();
      return;
    }

    const body = method === 'POST' || method === 'PATCH' ? parseRequestBody(request) : {};

    if (method === 'GET' && path === '/api/chains') {
      return ok(route, chains);
    }

    if (method === 'POST' && path === '/api/chains') {
      const next: Chain = {
        id: `chain-${chains.length + 1}`,
        name: String(body.name ?? ''),
        slug: String(body.slug ?? ''),
        family: parseChainFamily(body.family)
      };
      chains.push(next);
      return ok(route, {
        ...next,
        validationStatus: 'valid'
      }, 201);
    }

    if (method === 'GET' && path === '/api/wallets') {
      return ok(route, wallets);
    }

    if (method === 'POST' && path === '/api/wallets') {
      const next: Wallet = {
        id: `wallet-${wallets.length + 1}`,
        chainId: String(body.chainId ?? ''),
        address: String(body.address ?? ''),
        label: String(body.label ?? '')
      };
      wallets.push(next);
      return ok(route, {
        ...next,
        walletUniverseScanId: `scan-${wallets.length}`,
        universeSnapshotId: 'snapshot-1'
      }, 201);
    }

    if (method === 'POST' && path.startsWith('/api/wallets/') && path.endsWith('/rescan')) {
      return ok(route, {
        walletUniverseScanId: `scan-rerun-${Date.now()}`,
        status: 'success',
        universeSnapshotId: 'snapshot-1'
      }, 202);
    }

    if (method === 'GET' && path.startsWith('/api/wallets/') && path.endsWith('/jobs/status')) {
      return ok(route, {
        status: 'success',
        errorMessage: null
      });
    }

    if (method === 'GET' && path === '/api/assets/tokens') {
      return ok(route, tokens);
    }

    if (method === 'POST' && path === '/api/assets/tokens') {
      const next: Token = {
        id: `token-${tokens.length + 1}`,
        chainId: String(body.chainId ?? ''),
        contractOrMint: String(body.contractOrMint ?? ''),
        symbol: String(body.symbol ?? 'TOK'),
        name: String(body.name ?? 'Token'),
        trackingSource: 'manual'
      };
      const existingIndex = tokens.findIndex(
        (token) => token.chainId === next.chainId && token.contractOrMint === next.contractOrMint
      );
      if (existingIndex >= 0) {
        tokens[existingIndex] = next;
      } else {
        tokens.push(next);
      }
      return ok(route, next, 201);
    }

    if (method === 'GET' && path === '/api/protocols/contracts') {
      return ok(route, protocols);
    }

    if (method === 'POST' && path === '/api/protocols/contracts') {
      const abiMapping = isRecord(body.abiMapping) ? body.abiMapping : null;
      const positionRead = isRecord(abiMapping?.positionRead) ? abiMapping.positionRead : null;
      if (!positionRead?.function) {
        return fail(route, 'invalid abi mapping');
      }

      const next: Protocol = {
        id: `protocol-${protocols.length + 1}`,
        chainId: String(body.chainId ?? ''),
        contractAddress: String(body.contractAddress ?? ''),
        label: String(body.label ?? ''),
        category: String(body.category ?? ''),
        validationStatus: 'valid'
      };
      protocols.push(next);
      return ok(route, next, 201);
    }

    if (method === 'POST' && path.startsWith('/api/universe/') && path.endsWith('/refresh')) {
      return ok(route, { status: 'accepted' }, 202);
    }

    if (method === 'GET' && path.startsWith('/api/universe/') && path.endsWith('/jobs/status')) {
      return ok(route, {
        status: 'partial',
        errorMessage: null
      });
    }

    if (method === 'POST' && path === '/api/snapshots/run') {
      return ok(route, {
        snapshot: {
          id: 'snapshot-1',
          status: 'success',
          snapshotDateUtc: '2026-02-13'
        },
        skipped: false
      }, 202);
    }

    if (method === 'GET' && path === '/api/snapshots/jobs/status') {
      return ok(route, {
        status: 'success',
        errorMessage: null,
        snapshotDateUtc: '2026-02-13'
      });
    }

    if (method === 'GET' && path === '/api/snapshots/latest') {
      return ok(route, {
        id: 'snapshot-1',
        snapshotDateUtc: '2026-02-13',
        status: 'success',
        items: []
      });
    }

    if (method === 'GET' && path === '/api/portfolio/history') {
      return ok(route, {
        totals: [
          { snapshotDateUtc: '2026-02-12', totalUsdValue: 1000 },
          { snapshotDateUtc: '2026-02-13', totalUsdValue: 1200 }
        ]
      });
    }

    return fail(route, `Unhandled mocked endpoint: ${method} ${path}`, 501);
  });
}
