export class EnvConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EnvConfigError';
  }
}

function requireNonEmpty(name, value, errors) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${name} is required and must be non-empty.`);
  }
}

function parseOptionalUrl(name, value, errors) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  try {
    return new URL(value.trim());
  } catch {
    errors.push(`${name} must be a valid URL when provided.`);
    return null;
  }
}

function parseCoinGeckoKeyMode(value, errors) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'auto';
  }

  const mode = value.trim().toLowerCase();
  if (mode === 'auto' || mode === 'pro' || mode === 'demo') {
    return mode;
  }

  errors.push('COINGECKO_KEY_MODE must be one of: auto, pro, demo.');
  return 'auto';
}

function validateCoinGeckoModeCompatibility({ baseUrl, keyMode, errors }) {
  if (!baseUrl) {
    return;
  }

  const host = baseUrl.host.toLowerCase();
  if (keyMode === 'pro' && host === 'api.coingecko.com') {
    errors.push(
      'COINGECKO_KEY_MODE=pro is incompatible with api.coingecko.com; use pro-api.coingecko.com or set mode=demo.'
    );
  }
  if (keyMode === 'demo' && host === 'pro-api.coingecko.com') {
    errors.push(
      'COINGECKO_KEY_MODE=demo is incompatible with pro-api.coingecko.com; use api.coingecko.com or set mode=pro.'
    );
  }
}

export function loadRuntimeEnv(env = process.env) {
  const errors = [];

  requireNonEmpty('COINGECKO_API_KEY', env.COINGECKO_API_KEY, errors);
  const coingeckoBaseUrl = parseOptionalUrl('COINGECKO_BASE_URL', env.COINGECKO_BASE_URL, errors);
  const coingeckoKeyMode = parseCoinGeckoKeyMode(env.COINGECKO_KEY_MODE, errors);
  validateCoinGeckoModeCompatibility({
    baseUrl: coingeckoBaseUrl,
    keyMode: coingeckoKeyMode,
    errors
  });

  if (errors.length > 0) {
    throw new EnvConfigError(`Invalid environment configuration: ${errors.join(' ')}`);
  }

  return {
    port: Number(env.PORT || 4000),
    allowUnsafeRpcUrls: env.ALLOW_UNSAFE_RPC_URLS === 'true',
    coingeckoApiKey: env.COINGECKO_API_KEY.trim(),
    coingeckoBaseUrl:
      (typeof env.COINGECKO_BASE_URL === 'string' && env.COINGECKO_BASE_URL.trim()) ||
      'https://pro-api.coingecko.com/api/v3',
    coingeckoKeyMode,
    birdeyeApiKey:
      typeof env.BIRDEYE_API_KEY === 'string' && env.BIRDEYE_API_KEY.trim().length > 0
        ? env.BIRDEYE_API_KEY.trim()
        : null
  };
}
