export const BUILTIN_CHAINS = [
  {
    slug: 'solana',
    name: 'Solana',
    family: 'solana',
    chainId: null,
    rpcUrl: 'https://api.mainnet-beta.solana.com'
  },
  {
    slug: 'ethereum',
    name: 'Ethereum',
    family: 'evm',
    chainId: 1,
    rpcUrl: 'https://cloudflare-eth.com'
  },
  {
    slug: 'base',
    name: 'Base',
    family: 'evm',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org'
  },
  {
    slug: 'arbitrum',
    name: 'Arbitrum',
    family: 'evm',
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc'
  },
  {
    slug: 'optimism',
    name: 'Optimism',
    family: 'evm',
    chainId: 10,
    rpcUrl: 'https://mainnet.optimism.io'
  },
  {
    slug: 'polygon',
    name: 'Polygon',
    family: 'evm',
    chainId: 137,
    rpcUrl: 'https://polygon-rpc.com'
  },
  {
    slug: 'bsc',
    name: 'BNB Smart Chain',
    family: 'evm',
    chainId: 56,
    rpcUrl: 'https://bsc-dataseed.binance.org'
  },
  {
    slug: 'avalanche',
    name: 'Avalanche C-Chain',
    family: 'evm',
    chainId: 43114,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc'
  }
];
