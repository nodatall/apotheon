import { normalizeAddressForChain } from '../shared/address-normalization.js';

const SUPPORTED_SELECTORS = {
  'balanceOf(address)': '70a08231',
  'decimals()': '313ce567'
};
const MAX_SUPPORTED_DECIMALS = 36;

function inferArgType(arg) {
  if (arg === '$walletAddress') {
    return 'address';
  }

  if (typeof arg === 'string' && /^0x[a-fA-F0-9]{40}$/.test(arg.trim())) {
    return 'address';
  }

  if (typeof arg === 'number' || typeof arg === 'bigint') {
    return 'uint256';
  }

  if (typeof arg === 'string' && /^[0-9]+$/.test(arg.trim())) {
    return 'uint256';
  }

  throw new Error(`Unsupported ABI argument value: ${String(arg)}`);
}

function padHex(hexValue) {
  return hexValue.padStart(64, '0');
}

function encodeAddress(value) {
  const stripped = String(value).trim().replace(/^0x/, '');
  if (!/^[a-fA-F0-9]{40}$/.test(stripped)) {
    throw new Error(`Invalid EVM address argument: ${value}`);
  }
  return padHex(stripped.toLowerCase());
}

function encodeUint(value) {
  let asBigInt;
  if (typeof value === 'bigint') {
    asBigInt = value;
  } else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`Number argument must be a safe integer: ${value}`);
    }
    asBigInt = BigInt(value);
  } else if (typeof value === 'string') {
    asBigInt = BigInt(value.trim());
  } else {
    throw new Error(`Unsupported uint argument type: ${typeof value}`);
  }

  if (asBigInt < 0n) {
    throw new Error(`Unsigned integer argument cannot be negative: ${value}`);
  }
  return padHex(asBigInt.toString(16));
}

function resolveArgValue(arg, { wallet }) {
  if (arg === '$walletAddress') {
    return wallet.address;
  }

  if (typeof arg === 'string' && arg.startsWith('$')) {
    throw new Error(`Unsupported ABI placeholder: ${arg}`);
  }

  return arg;
}

function normalizeFunctionName(readFunction) {
  const normalized = String(readFunction || '').trim();
  const signatureStart = normalized.indexOf('(');
  if (signatureStart < 0) {
    return normalized;
  }

  return normalized.slice(0, signatureStart).trim();
}

function selectorForRead(read) {
  const argTypes = (Array.isArray(read.args) ? read.args : []).map(inferArgType);
  const signature = `${normalizeFunctionName(read.function)}(${argTypes.join(',')})`;
  const selector = SUPPORTED_SELECTORS[signature];

  if (!selector) {
    throw new Error(`Unsupported protocol read signature: ${signature}`);
  }

  return selector;
}

function assertSupportedRead(read, label) {
  selectorForRead(read);
  const args = Array.isArray(read?.args) ? read.args : [];
  for (const arg of args) {
    if (typeof arg === 'string' && arg.startsWith('$') && arg !== '$walletAddress') {
      throw new Error(`${label} contains unsupported placeholder: ${arg}`);
    }
  }
}

function encodeReadData(read, context) {
  const selector = selectorForRead(read);
  const args = Array.isArray(read.args) ? read.args : [];
  const encodedArgs = args.map((arg) => {
    const resolvedArg = resolveArgValue(arg, context);
    const type = inferArgType(arg);
    if (type === 'address') {
      return encodeAddress(resolvedArg);
    }
    return encodeUint(resolvedArg);
  });

  return `0x${selector}${encodedArgs.join('')}`;
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
    if (typeof body?.result !== 'string') {
      throw new Error('Invalid RPC result shape for eth_call.');
    }

    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

function decodeHexToBigInt(value) {
  if (typeof value !== 'string' || !value.startsWith('0x')) {
    throw new Error(`Invalid hex RPC response: ${value}`);
  }
  if (value === '0x') {
    return 0n;
  }
  return BigInt(value);
}

function normalizeRawAmount(balanceRaw, decimals) {
  const raw = decodeHexToBigInt(balanceRaw);
  const parsedDecimals = Number(decimals);
  if (!Number.isInteger(parsedDecimals) || parsedDecimals < 0) {
    throw new Error(`Invalid token decimals value: ${decimals}`);
  }
  if (parsedDecimals > MAX_SUPPORTED_DECIMALS) {
    throw new Error(`Token decimals ${parsedDecimals} exceed supported maximum ${MAX_SUPPORTED_DECIMALS}.`);
  }

  const safeDecimals = parsedDecimals;
  const scale = 10n ** BigInt(safeDecimals);
  const whole = Number(raw / scale);
  const fraction = Number(raw % scale) / Number(scale || 1n);

  if (!Number.isFinite(whole) || !Number.isFinite(fraction)) {
    throw new Error('Protocol position amount exceeds supported numeric range.');
  }

  return whole + fraction;
}

export function createProtocolPositionResolver({ fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  async function executeRead({ chain, contractAddress, read, wallet }) {
    const data = encodeReadData(read, { wallet });
    return rpcCall({
      fetchImpl,
      rpcUrl: chain.rpcUrl,
      timeoutMs,
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [
          {
            to: contractAddress,
            data
          },
          'latest'
        ]
      }
    });
  }

  async function resolvePosition({ chain, wallet, protocol }) {
    if (chain?.family !== 'evm') {
      return null;
    }
    if (!chain?.rpcUrl) {
      throw new Error(`Missing RPC URL for chain ${chain?.id || 'unknown'}`);
    }

    const contractAddress = normalizeAddressForChain({
      family: chain.family,
      address: protocol?.contractAddress
    });
    if (!contractAddress) {
      throw new Error(`Missing protocol contract address for ${protocol?.id || 'unknown protocol'}`);
    }

    const positionRead = protocol?.abiMapping?.positionRead;
    if (!positionRead) {
      throw new Error(`Protocol ${protocol?.id || contractAddress} is missing abiMapping.positionRead`);
    }

    const rawPosition = await executeRead({
      chain,
      contractAddress,
      read: positionRead,
      wallet
    });

    let decimals = 18;
    const decimalsRead = protocol?.abiMapping?.decimalsRead;
    if (decimalsRead) {
      const rawDecimals = await executeRead({
        chain,
        contractAddress,
        read: decimalsRead,
        wallet
      });
      decimals = Number(decodeHexToBigInt(rawDecimals));
    }

    return {
      contractOrMint: contractAddress,
      symbol: protocol.label ?? null,
      quantity: normalizeRawAmount(rawPosition, decimals)
    };
  }

  return {
    resolvePosition
  };
}

export function assertProtocolAbiMappingSupported(abiMapping) {
  if (!abiMapping?.positionRead) {
    throw new Error('abiMapping.positionRead is required.');
  }

  assertSupportedRead(abiMapping.positionRead, 'abiMapping.positionRead');
  if (abiMapping.decimalsRead) {
    assertSupportedRead(abiMapping.decimalsRead, 'abiMapping.decimalsRead');
  }

  return true;
}
