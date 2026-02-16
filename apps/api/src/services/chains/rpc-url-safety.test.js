import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeRpcUrl, RpcUrlSafetyError } from './rpc-url-safety.js';

test('assertSafeRpcUrl rejects localhost by default', async () => {
  await assert.rejects(
    assertSafeRpcUrl('http://localhost:8545'),
    RpcUrlSafetyError
  );
});

test('assertSafeRpcUrl rejects host.docker.internal by default', async () => {
  await assert.rejects(
    assertSafeRpcUrl('http://host.docker.internal:8545'),
    RpcUrlSafetyError
  );
});

test('assertSafeRpcUrl rejects private-network ipv4 address', async () => {
  await assert.rejects(
    assertSafeRpcUrl('https://192.168.1.50:8545'),
    RpcUrlSafetyError
  );
});

test('assertSafeRpcUrl accepts public hostname', async () => {
  await assert.doesNotReject(
    assertSafeRpcUrl('https://example-rpc.local', {
      lookup: async () => [{ address: '1.1.1.1' }]
    })
  );
});

test('assertSafeRpcUrl accepts localhost only when explicitly allowed', async () => {
  await assert.doesNotReject(
    assertSafeRpcUrl('http://localhost:8545', {
      allowUnsafeLocalRpc: true
    })
  );
});
