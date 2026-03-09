import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTokenIconService } from './token-icon.service.js';

test('token icon service resolves native token icon from CoinGecko native coin lookup', async () => {
  const service = createTokenIconService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-bsc', slug: 'bsc', family: 'evm' })
    },
    coingeckoClient: {
      getNativeCoinImage: async ({ chain }) =>
        chain.slug === 'bsc' ? 'https://icons.example/bnb.png' : null,
      getTokenImagesByContracts: async () => ({})
    }
  });

  const rows = await service.enrichTokenRows([
    {
      chainId: 'chain-bsc',
      contractOrMint: 'native:bsc',
      symbol: 'BNB'
    }
  ]);

  assert.equal(rows[0].iconUrl, 'https://icons.example/bnb.png');
});

test('token icon service treats missing contract + native symbol as native row', async () => {
  const service = createTokenIconService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-sol', slug: 'solana', family: 'solana' })
    },
    coingeckoClient: {
      getNativeCoinImage: async ({ chain }) =>
        chain.slug === 'solana' ? 'https://icons.example/sol.png' : null,
      getTokenImagesByContracts: async () => ({})
    }
  });

  const rows = await service.enrichTokenRows([
    {
      chainId: 'chain-sol',
      contractOrMint: null,
      symbol: 'SOL'
    }
  ]);

  assert.equal(rows[0].iconUrl, 'https://icons.example/sol.png');
});

test('token icon service applies ATH override icon when contract image lookup is missing', async () => {
  const service = createTokenIconService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-beam', slug: 'beam', family: 'evm' })
    },
    coingeckoClient: {
      getNativeCoinImage: async () => null,
      getTokenImagesByContracts: async () => ({})
    }
  });

  const rows = await service.enrichTokenRows([
    {
      chainId: 'chain-beam',
      contractOrMint: '0x02d6d189078bde6d548e0664b61dd7acea96f0aa',
      symbol: 'ATH'
    }
  ]);

  assert.equal(
    rows[0].iconUrl,
    'https://coin-images.coingecko.com/coins/images/36179/small/logogram_circle_dark_green_vb_green_%281%29.png?1718232706'
  );
});
