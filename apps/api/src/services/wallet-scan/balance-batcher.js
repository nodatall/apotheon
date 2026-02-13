function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
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
  evmResolver = async ({ tokens }) => tokens.map((token) => ({ contractOrMint: token.contractOrMint, balanceRaw: '0', balanceNormalized: 0 })),
  solanaResolver = async ({ tokens }) => tokens.map((token) => ({ contractOrMint: token.contractOrMint, balanceRaw: '0', balanceNormalized: 0 }))
} = {}) {
  async function resolveBalances({ chain, walletAddress, tokens }) {
    const resolver = chain.family === 'solana' ? solanaResolver : evmResolver;

    const grouped = chunk(tokens, chunkSize);
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
