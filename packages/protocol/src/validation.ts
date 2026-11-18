import {
  CHUNK_BYTES, ERROR_CODES, FRAME_HEADER_BYTES, MAX_CONTROL_BYTES, MAX_DEVICE_NAME,
  MAX_FILE_NAME, MAX_FRAME_BYTES, MAX_PEERS, MAX_WINDOW_CHUNKS, PAIR_CODE_LENGTH,
} from './constants.js';
import type { ClientMessage, DataControl, FileMeta, ServerMessage } from './types.js';

type Rule = (value: unknown) => boolean;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const literal = (expected: unknown): Rule => value => value === expected;
const oneOf = (...values: readonly unknown[]): Rule => value => values.includes(value);
const optional = (rule: Rule): Rule => value => value === undefined || rule(value);
const nullable = (rule: Rule): Rule => value => value === null || rule(value);
const integer = (max = Number.MAX_SAFE_INTEGER, min = 0): Rule =>
  value => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const text = (max: number, min = 1): Rule =>
  value => typeof value === 'string' && value.length >= min && value.length <= max;
const visibleText = (max: number): Rule => value =>
  text(max)(value) && typeof value === 'string' && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(value);
const shape = (fields: Record<string, Rule>): Rule => value => record(value)
  && Object.keys(value).every(key => Object.hasOwn(fields, key))
  && Object.entries(fields).every(([key, rule]) => rule(value[key]));
const list = (rule: Rule, max: number): Rule => value =>
  Array.isArray(value) && value.length <= max && value.every(item => rule(item));
const bool: Rule = value => typeof value === 'boolean';
export const isWireId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value);
const hash: Rule = value => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
const code: Rule = value => typeof value === 'string' && new RegExp(`^\\d{${PAIR_CODE_LENGTH}}$`, 'u').test(value);
const generation = integer(0xffff_ffff, 1);
const name = visibleText(MAX_DEVICE_NAME);
const filename = visibleText(MAX_FILE_NAME);
const file = shape({
  id: isWireId, name: filename, size: integer(),
  lastModified: integer(Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER),
});
export const isFileMeta = (value: unknown): value is FileMeta => file(value);
const peer = shape({ id: isWireId, name, busy: bool });
const stunUrl: Rule = value => typeof value === 'string' && value.length <= 1024 && /^stuns?:[^\s]+$/iu.test(value);
const ice = list(shape({ urls: value => list(stunUrl, 8)(value) && (value as unknown[]).length > 0 }), 8);
const signal = (value: unknown): boolean => {
  if (!record(value)) return false;
  if (value.kind === 'description') return shape({
    kind: literal('description'), description: shape({ type: oneOf('offer', 'answer'), sdp: text(48 * 1024) }),
  })(value);
  if (value.kind === 'candidate') return shape({
    kind: literal('candidate'), candidate: nullable(shape({
      candidate: text(4096, 0), sdpMid: nullable(text(256, 0)),
      sdpMLineIndex: nullable(integer(65_535)), usernameFragment: optional(nullable(text(256, 0))),
    })),
  })(value);
  return false;
};
const wire = (type: string, fields: Record<string, Rule> = {}): Rule =>
  shape({ v: literal(1), type: literal(type), ...fields });
const request = (type: string, fields: Record<string, Rule> = {}): Rule =>
  wire(type, { requestId: isWireId, ...fields });
const transfer = (type: string, fields: Record<string, Rule> = {}): Rule =>
  wire(type, { transferId: isWireId, generation, ...fields });

const clientRules: Record<ClientMessage['type'], Rule> = {
  hello: wire('hello', { name }),
  rename: request('rename', { name }),
  'refresh-code': request('refresh-code'),
  lookup: request('lookup', { code }),
  offer: request('offer', { to: isWireId, file }),
  accept: request('accept', { invitationId: isWireId }),
  reject: request('reject', { invitationId: isWireId }),
  cancel: request('cancel', { transferId: isWireId }),
  signal: wire('signal', { pairId: isWireId, generation, signal }),
  release: wire('release', { pairId: isWireId, transferId: isWireId, outcome: oneOf('completed', 'cancelled', 'failed', 'unknown') }),
};

const serverRules: Record<ServerMessage['type'], Rule> = {
  welcome: wire('welcome', { self: peer, code, codeExpiresAt: integer(), peers: list(peer, MAX_PEERS), iceServers: ice }),
  peers: wire('peers', { peers: list(peer, MAX_PEERS) }),
  self: wire('self', { self: peer, code, codeExpiresAt: integer() }),
  'lookup-result': request('lookup-result', { peer }),
  incoming: wire('incoming', { invitationId: isWireId, from: peer, file, expiresAt: integer() }),
  offered: request('offered', { invitationId: isWireId, transferId: isWireId, expiresAt: integer() }),
  paired: wire('paired', {
    invitationId: isWireId, pairId: isWireId, generation, transferId: isWireId,
    peer, file, role: oneOf('sender', 'receiver'), iceServers: ice,
  }),
  rejected: wire('rejected', { transferId: isWireId, reason: oneOf('rejected', 'expired', 'busy') }),
  'cancel-requested': wire('cancel-requested', { transferId: isWireId, by: isWireId }),
  signal: wire('signal', { pairId: isWireId, generation, from: isWireId, signal }),
  'peer-left': wire('peer-left', { peerId: isWireId }),
  ack: request('ack'),
  error: wire('error', { requestId: optional(isWireId), code: oneOf(...ERROR_CODES), message: text(512) }),
};

const controlRules: Record<DataControl['type'], Rule> = {
  hello: transfer('hello', {
    pairId: isWireId, metaDigest: hash, chunkBytes: literal(CHUNK_BYTES),
    frameBytes: integer(MAX_FRAME_BYTES, FRAME_HEADER_BYTES + 1), windowChunks: integer(MAX_WINDOW_CHUNKS, 1),
  }),
  ready: transfer('ready', { offset: integer(), chain: hash, credit: integer(MAX_WINDOW_CHUNKS) }),
  'chunk-begin': transfer('chunk-begin', { index: integer(), offset: integer(), length: integer(CHUNK_BYTES, 1), hash }),
  'chunk-end': transfer('chunk-end', { index: integer() }),
  'chunk-ack': transfer('chunk-ack', { index: integer(), offset: integer(), chain: hash, credit: integer(MAX_WINDOW_CHUNKS) }),
  finish: transfer('finish', { totalBytes: integer(), chunkCount: integer(), chain: hash, metaDigest: hash }),
  'status-request': transfer('status-request'),
  status: transfer('status', { phase: oneOf('transferring', 'verifying', 'saving'), offset: integer(), elapsedMs: integer() }),
  complete: transfer('complete', { totalBytes: integer(), chain: hash, savedName: filename }),
  'complete-ack': transfer('complete-ack'),
  cancel: transfer('cancel'),
  cancelled: transfer('cancelled'),
  error: transfer('error', { code: oneOf(...ERROR_CODES), message: text(512) }),
};

function parse<T>(textValue: string, rules: Record<string, Rule>): T | null {
  if (typeof textValue !== 'string' || textValue.length > MAX_CONTROL_BYTES
    || new TextEncoder().encode(textValue).byteLength > MAX_CONTROL_BYTES) return null;
  try {
    const value: unknown = JSON.parse(textValue);
    if (!record(value) || typeof value.type !== 'string' || !Object.hasOwn(rules, value.type)) return null;
    return rules[value.type]?.(value) ? value as T : null;
  } catch {
    return null;
  }
}

export const parseClientMessage = (value: string): ClientMessage | null => parse(value, clientRules);
export const parseServerMessage = (value: string): ServerMessage | null => parse(value, serverRules);
export const parseDataControl = (value: string): DataControl | null => parse(value, controlRules);

export function sanitizeFileName(value: string): string {
  const cleaned = value.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/gu, '_').replace(/[. ]+$/u, '').trim();
  const safe = !cleaned || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(cleaned) ? `文件_${cleaned || '未命名'}` : cleaned;
  return safe.slice(0, MAX_FILE_NAME);
}
