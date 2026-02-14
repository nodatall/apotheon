export function normalizeAddressForChain({ family, address }) {
  const trimmed = typeof address === 'string' ? address.trim() : '';
  if (!trimmed) {
    return '';
  }

  return family === 'evm' ? trimmed.toLowerCase() : trimmed;
}
