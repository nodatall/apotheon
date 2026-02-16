const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

async function request(path, { method = 'GET', body } = {}) {
  const hasBody = body !== undefined;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: hasBody ? { 'content-type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }

  return payload?.data;
}

export const api = {
  getChains: () => request('/api/chains'),
  createChain: (body) => request('/api/chains', { method: 'POST', body }),
  setChainActivation: (chainId, isActive) =>
    request(`/api/chains/${chainId}/activation`, {
      method: 'PATCH',
      body: { isActive }
    }),

  getWallets: () => request('/api/wallets'),
  createWallet: (body) => request('/api/wallets', { method: 'POST', body }),
  rescanWallet: (walletId) => request(`/api/wallets/${walletId}/rescan`, { method: 'POST' }),
  getWalletJobStatus: (walletId) => request(`/api/wallets/${walletId}/jobs/status`),

  getTokens: () => request('/api/assets/tokens'),
  addToken: (body) => request('/api/assets/tokens', { method: 'POST', body }),

  getProtocols: () => request('/api/protocols/contracts'),
  addProtocol: (body) => request('/api/protocols/contracts', { method: 'POST', body }),

  refreshUniverse: (chainId, body = {}) =>
    request(`/api/universe/${chainId}/refresh`, { method: 'POST', body }),
  getUniverseLatest: (chainId) => request(`/api/universe/${chainId}/latest`),
  getUniverseJobStatus: (chainId) => request(`/api/universe/${chainId}/jobs/status`),

  runSnapshot: (body = {}) => request('/api/snapshots/run', { method: 'POST', body }),
  getSnapshotLatest: () => request('/api/snapshots/latest'),
  getSnapshotJobStatus: () => request('/api/snapshots/jobs/status'),

  getHistory: () => request('/api/portfolio/history'),
  getDashboard: () => request('/api/portfolio/dashboard'),
  getWalletOnboardingStatus: (walletId) => request(`/api/wallets/${walletId}/onboarding-status`)
};
