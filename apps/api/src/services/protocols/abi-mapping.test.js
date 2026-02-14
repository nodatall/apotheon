import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAbiMappingSchema, validateAbiMappingWithPreview } from './abi-mapping-validator.js';

test('abi-mapping: invalid schema is rejected with actionable errors', async () => {
  assert.throws(
    () =>
      validateAbiMappingSchema({
        positionRead: {
          function: '',
          args: [],
          returns: 'uint256'
        }
      }),
    /non-empty string/i
  );
});

test('abi-mapping: valid schema passes preview executor requirement', async () => {
  await assert.doesNotReject(() =>
    validateAbiMappingWithPreview({
      abiMapping: {
        positionRead: {
          function: 'balanceOf',
          args: ['$walletAddress'],
          returns: 'uint256'
        },
        decimalsRead: {
          function: 'decimals',
          args: [],
          returns: 'uint8'
        }
      },
      previewExecutor: async () => ({ ok: true })
    })
  );
});
