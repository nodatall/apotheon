import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';

export class RpcUrlSafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RpcUrlSafetyError';
  }
}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isIpv4InRange(ip, cidrBase, prefix) {
  const address = ipv4ToInt(ip);
  const base = ipv4ToInt(cidrBase);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (address & mask) === (base & mask);
}

function isPrivateIpv4(ip) {
  return (
    isIpv4InRange(ip, '0.0.0.0', 8) ||
    isIpv4InRange(ip, '10.0.0.0', 8) ||
    isIpv4InRange(ip, '100.64.0.0', 10) ||
    isIpv4InRange(ip, '127.0.0.0', 8) ||
    isIpv4InRange(ip, '169.254.0.0', 16) ||
    isIpv4InRange(ip, '172.16.0.0', 12) ||
    isIpv4InRange(ip, '192.168.0.0', 16)
  );
}

function isPrivateIpv6(ip) {
  const normalized = ip.toLowerCase();

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('::ffff:127.')
  );
}

function isPrivateAddress(address) {
  const ipVersion = net.isIP(address);

  if (ipVersion === 4) {
    return isPrivateIpv4(address);
  }

  if (ipVersion === 6) {
    return isPrivateIpv6(address);
  }

  return false;
}

function isDisallowedHostname(hostname) {
  const normalized = hostname.toLowerCase();

  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === 'host.docker.internal'
  );
}

export async function assertSafeRpcUrl(
  rpcUrl,
  {
    allowUnsafeLocalRpc = false,
    lookup = dnsLookup
  } = {}
) {
  if (allowUnsafeLocalRpc) {
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rpcUrl);
  } catch (_error) {
    throw new RpcUrlSafetyError('RPC URL must be a valid absolute URL.');
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new RpcUrlSafetyError('RPC URL protocol must be HTTP or HTTPS.');
  }

  if (isDisallowedHostname(parsedUrl.hostname)) {
    throw new RpcUrlSafetyError('RPC URL cannot target localhost or host-internal addresses.');
  }

  if (net.isIP(parsedUrl.hostname)) {
    if (isPrivateAddress(parsedUrl.hostname)) {
      throw new RpcUrlSafetyError('RPC URL cannot target private-network IPs by default.');
    }
    return;
  }

  let records;
  try {
    records = await lookup(parsedUrl.hostname, { all: true, verbatim: true });
  } catch (_error) {
    throw new RpcUrlSafetyError('RPC URL hostname could not be resolved.');
  }

  if (!records || records.length === 0) {
    throw new RpcUrlSafetyError('RPC URL hostname did not resolve to any IP address.');
  }

  if (records.some((record) => isPrivateAddress(record.address))) {
    throw new RpcUrlSafetyError('RPC URL hostname resolves to a private-network IP by default.');
  }
}
