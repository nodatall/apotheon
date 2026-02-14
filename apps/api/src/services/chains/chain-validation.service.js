import { assertSafeRpcUrl, RpcUrlSafetyError } from './rpc-url-safety.js';

function normalizeEvmChainId(value) {
  if (typeof value === 'string') {
    return Number.parseInt(value, value.startsWith('0x') ? 16 : 10);
  }
  if (typeof value === 'number') {
    return value;
  }
  return Number.NaN;
}

export function createChainValidationService({
  fetchImpl = fetch,
  timeoutMs = 5000,
  allowUnsafeLocalRpc = false,
  lookup
} = {}) {
  async function validateCustomChain({ family, chainId, rpcUrl }) {
    await assertSafeRpcUrl(rpcUrl, { allowUnsafeLocalRpc, lookup });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const payload =
      family === 'solana'
        ? {
            jsonrpc: '2.0',
            id: 1,
            method: 'getHealth',
            params: []
          }
        : {
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_chainId',
            params: []
          };

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
        throw new Error(`RPC responded with HTTP ${response.status}.`);
      }

      const body = await response.json();
      if (body.error) {
        throw new Error(body.error.message || 'RPC returned an error response.');
      }

      if (family === 'evm') {
        const expected = Number(chainId);
        const observed = normalizeEvmChainId(body.result);
        if (!Number.isFinite(observed) || observed !== expected) {
          throw new Error(`RPC chainId mismatch. expected=${expected}, observed=${body.result}`);
        }
      }

      return {
        validationStatus: 'valid',
        validationError: null
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown RPC validation error';

      return {
        validationStatus: 'invalid',
        validationError: message
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    validateCustomChain
  };
}

export { RpcUrlSafetyError };
