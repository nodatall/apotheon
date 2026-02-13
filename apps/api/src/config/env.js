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

export function loadRuntimeEnv(env = process.env) {
  const errors = [];

  requireNonEmpty('COINGECKO_API_KEY', env.COINGECKO_API_KEY, errors);

  if (errors.length > 0) {
    throw new EnvConfigError(`Invalid environment configuration: ${errors.join(' ')}`);
  }

  return {
    port: Number(env.PORT || 4000),
    allowUnsafeRpcUrls: env.ALLOW_UNSAFE_RPC_URLS === 'true',
    coingeckoApiKey: env.COINGECKO_API_KEY.trim()
  };
}
