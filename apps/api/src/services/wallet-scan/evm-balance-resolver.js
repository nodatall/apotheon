function encodeBalanceOf(walletAddress) {
  const selector = '70a08231';
  const stripped = walletAddress.toLowerCase().replace(/^0x/, '');
  if (stripped.length !== 40) {
    throw new Error(`Invalid EVM wallet address for balanceOf call: ${walletAddress}`);
  }

  return `0x${selector}${stripped.padStart(64, '0')}`;
}

function encodeDecimalsCall() {
  return '0x313ce567';
}

const RPC_FALLBACKS_BY_SLUG = {
  ethereum: ['https://ethereum.publicnode.com'],
  arbitrum: ['https://arbitrum.llamarpc.com', 'https://arbitrum-one-rpc.publicnode.com'],
  base: ['https://base-rpc.publicnode.com'],
  optimism: ['https://optimism-rpc.publicnode.com'],
  polygon: ['https://polygon-bor-rpc.publicnode.com'],
  bsc: ['https://bsc-rpc.publicnode.com'],
  avalanche: ['https://avalanche-c-chain-rpc.publicnode.com']
};

function resolveRpcUrls(chain) {
  const configured = typeof chain?.rpcUrl === 'string' ? chain.rpcUrl.trim() : '';
  const fallback = Array.isArray(RPC_FALLBACKS_BY_SLUG[chain?.slug])
    ? RPC_FALLBACKS_BY_SLUG[chain.slug]
    : [];
  const seen = new Set();

  return [configured, ...fallback].filter((url) => {
    if (typeof url !== 'string') {
      return false;
    }
    const normalized = url.trim();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

async function mapWithConcurrency(items, mapper, concurrency) {
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
  const out = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
  return out;
}

function normalizeHexQuantity(hexValue, decimals = 18) {
  if (typeof hexValue !== 'string' || !hexValue.startsWith('0x')) {
    throw new Error(`Invalid hex quantity response: ${hexValue}`);
  }

  const value = BigInt(hexValue);
  const scale = BigInt(10) ** BigInt(Math.max(0, Number(decimals) || 0));
  const whole = Number(value / scale);
  const fraction = Number(value % scale) / Number(scale || 1n);

  return whole + fraction;
}

async function rpcCall({ fetchImpl, rpcUrl, payload, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`RPC call failed with HTTP ${response.status}`);
    }

    const body = await response.json();
    if (body?.error) {
      throw new Error(body.error.message || 'Unknown RPC error');
    }

    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

function isPositiveHexQuantity(hexValue) {
  if (typeof hexValue !== 'string' || !hexValue.startsWith('0x')) {
    return false;
  }

  try {
    return BigInt(hexValue) > 0n;
  } catch {
    return false;
  }
}

export function createEvmBalanceResolver({ fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  async function rpcCallWithRetry({
    rpcUrls,
    payload,
    attempts = 2,
    retryDelayMs = 250
  }) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      for (const rpcUrl of rpcUrls) {
        try {
          return await rpcCall({
            fetchImpl,
            rpcUrl,
            payload,
            timeoutMs
          });
        } catch (error) {
          lastError = error;
        }
      }
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }

    throw lastError;
  }

  return async function resolveEvmBalances({ chain, walletAddress, tokens }) {
    const rpcUrls = resolveRpcUrls(chain);
    if (rpcUrls.length === 0) {
      throw new Error('EVM chain RPC URL is required for balance resolution.');
    }

    const results = await mapWithConcurrency(
      tokens,
      async (token) => {
        try {
          const balanceRaw =
            token.isNative === true
              ? await rpcCallWithRetry({
                  rpcUrls,
                  payload: {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_getBalance',
                    params: [walletAddress, 'latest']
                  }
                })
              : await rpcCallWithRetry({
                  rpcUrls,
                  payload: {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_call',
                    params: [
                      {
                        to: token.contractOrMint,
                        data: encodeBalanceOf(walletAddress)
                      },
                      'latest'
                    ]
                  }
                });

          let decimals = Number.isInteger(token.decimals) ? token.decimals : null;
          if (!token.isNative && decimals === null && isPositiveHexQuantity(balanceRaw)) {
            try {
              const decimalsRaw = await rpcCallWithRetry({
                rpcUrls,
                payload: {
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'eth_call',
                  params: [
                    {
                      to: token.contractOrMint,
                      data: encodeDecimalsCall()
                    },
                    'latest'
                  ]
                }
              });
              if (typeof decimalsRaw === 'string' && decimalsRaw.startsWith('0x')) {
                const parsedDecimals = Number(BigInt(decimalsRaw));
                if (Number.isInteger(parsedDecimals) && parsedDecimals >= 0 && parsedDecimals <= 36) {
                  decimals = parsedDecimals;
                }
              }
            } catch (_error) {
              decimals = null;
            }
          }

          return {
            contractOrMint: token.contractOrMint,
            balanceRaw,
            balanceNormalized: normalizeHexQuantity(balanceRaw, decimals ?? 18),
            resolutionError: false
          };
        } catch (error) {
          return {
            contractOrMint: token.contractOrMint,
            balanceRaw: '0x0',
            balanceNormalized: 0,
            resolutionError: true,
            resolutionErrorMessage: error instanceof Error ? error.message : String(error)
          };
        }
      },
      4
    );

    return results;
  };
}
