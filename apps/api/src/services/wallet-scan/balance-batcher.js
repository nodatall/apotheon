function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export class BalanceResolverNotConfiguredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BalanceResolverNotConfiguredError';
  }
}

function normalizeBalances(tokens, rawResults = []) {
  const byContract = new Map(
    rawResults.map((item) => [String(item.contractOrMint).toLowerCase(), item])
  );

  return tokens.map((token) => {
    const key = String(token.contractOrMint).toLowerCase();
    const matched = byContract.get(key);

    return {
      contractOrMint: token.contractOrMint,
      balanceRaw: matched?.balanceRaw ?? '0',
      balanceNormalized: Number(matched?.balanceNormalized ?? 0)
    };
  });
}

export function createBalanceBatcher({
  chunkSize = 50,
  evmResolver = null,
  solanaResolver = null
} = {}) {
  async function resolveBalances({ chain, walletAddress, tokens }) {
    const resolver = chain.family === 'solana' ? solanaResolver : evmResolver;
    if (typeof resolver !== 'function') {
      throw new BalanceResolverNotConfiguredError(
        `No ${chain.family} balance resolver configured for wallet scan.`
      );
    }
    const safeChunkSize = Number.isInteger(chunkSize) && chunkSize > 0 ? chunkSize : 50;

    const grouped = chunk(tokens, safeChunkSize);
    const outputs = [];

    for (const tokenChunk of grouped) {
      const partial = await resolver({ chain, walletAddress, tokens: tokenChunk });
      outputs.push(...normalizeBalances(tokenChunk, partial));
    }

    return outputs;
  }

  return {
    resolveBalances
  };
}
