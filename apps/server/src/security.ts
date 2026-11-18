import { isIP } from 'node:net';
import { MAX_CONTROL_BYTES, parseServerMessage } from '@lan-send/protocol';
import type { IceServer } from '@lan-send/protocol';

export const LIMITS = {
  connections: 256,
  connectionsPerSource: 64,
  registrationMs: 10_000,
  heartbeatMs: 30_000,
  sweepMs: 1_000,
  messagesPerWindow: 120,
  messageWindowMs: 10_000,
  lookupsPerMinute: 5,
  sourceLookupsPerMinute: 30,
  refreshesPerMinute: 5,
  requestRecords: 128,
  requestTtlMs: 5 * 60_000,
  lifetimeTransfers: 256,
  candidatesPerPeer: 128,
  descriptionsPerPeer: 4,
  socketBufferedBytes: 4 * MAX_CONTROL_BYTES,
} as const;

export function validOrigin(value: string): string {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== value
    || parsed.username || parsed.password) throw new TypeError('Origin 必须为精确的 HTTP(S) 来源');
  return value;
}

export function isLocalOrigin(origin: string): boolean {
  const hostname = new URL(origin).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function normalizeAddress(value: string): string {
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6) return 'unknown';
  const address = new URL(`http://[${value.split('%')[0]}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/u.exec(address);
  if (!mapped) return address;
  const bits = Number.parseInt(mapped[1]!, 16) * 65_536 + Number.parseInt(mapped[2]!, 16);
  return [Math.floor(bits / 16_777_216), Math.floor(bits / 65_536) % 256,
    Math.floor(bits / 256) % 256, bits % 256].join('.');
}

export function iceConfiguration(urls: readonly string[] = []): IceServer[] {
  const iceServers = urls.length ? [{ urls: [...urls] }] : [];
  // 复用共享结构规则，配置与线上协议接受完全相同的 STUN 边界。
  if (!parseServerMessage(JSON.stringify({ v: 1, type: 'welcome',
    self: { id: '00000000-0000-0000-0000-000000000000', name: '配置校验', busy: false },
    code: '00000000', codeExpiresAt: 0, peers: [], iceServers }))) {
    throw new TypeError('STUN_URLS 只接受有界的 stun: / stuns: 地址');
  }
  return iceServers;
}

export interface WindowCounter { start: number; count: number }
export function take(counter: WindowCounter, now: number, maximum: number, windowMs: number): boolean {
  if (now - counter.start >= windowMs) { counter.start = now; counter.count = 0; }
  if (counter.count >= maximum) return false;
  counter.count++;
  return true;
}
