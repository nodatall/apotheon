function encodeBalanceOf(walletAddress) {
  const selector = '70a08231';
  const stripped = walletAddress.toLowerCase().replace(/^0x/, '');
  if (stripped.length !== 40) {
    throw new Error(`Invalid EVM wallet address for balanceOf call: ${walletAddress}`);
  }

  return `0x${selector}${stripped.padStart(64, '0')}`;
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

export function createEvmBalanceResolver({ fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  return async function resolveEvmBalances({ chain, walletAddress, tokens }) {
    if (!chain?.rpcUrl) {
      throw new Error('EVM chain RPC URL is required for balance resolution.');
    }

    const results = await Promise.all(
      tokens.map(async (token) => {
        const data = encodeBalanceOf(walletAddress);
        const balanceRaw = await rpcCall({
          fetchImpl,
          rpcUrl: chain.rpcUrl,
          timeoutMs,
          payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [
              {
                to: token.contractOrMint,
                data
              },
              'latest'
            ]
          }
        });

        return {
          contractOrMint: token.contractOrMint,
          balanceRaw,
          balanceNormalized: normalizeHexQuantity(balanceRaw, token.decimals ?? 18)
        };
      })
    );

    return results;
  };
}
