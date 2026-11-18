import { CHUNK_BYTES, PROTOCOL_VERSION } from './constants.js';
import { isFileMeta } from './validation.js';
import type { FileMeta } from './types.js';

const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');

export function hashBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new TypeError('无效的 SHA-256 值');
  return Uint8Array.from({ length: 32 }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16));
}

export async function digestChunk(bytes: Uint8Array): Promise<string> {
  // 固定复制为 ArrayBuffer，避免把共享内存或整个源文件交给摘要接口。
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return hex(new Uint8Array(digest));
}

export function fileManifestDigest(file: FileMeta): Promise<string> {
  if (!isFileMeta(file)) throw new TypeError('无效的文件清单');
  return digestChunk(encoder.encode(JSON.stringify([
    PROTOCOL_VERSION, file.id, file.name, file.size, file.lastModified, CHUNK_BYTES,
  ])));
}

export function initialChain(manifestDigest: string): Promise<string> {
  const domain = encoder.encode('LAN-SEND\0');
  const bytes = new Uint8Array(domain.byteLength + 4 + 32);
  bytes.set(domain);
  new DataView(bytes.buffer).setUint32(domain.byteLength, PROTOCOL_VERSION);
  bytes.set(hashBytes(manifestDigest), domain.byteLength + 4);
  return digestChunk(bytes);
}

export function advanceChain(previous: string, chunkHash: string, index: number, length: number): Promise<string> {
  if (!Number.isSafeInteger(index) || index < 0 || !Number.isInteger(length) || length < 1 || length > CHUNK_BYTES) {
    throw new RangeError('无效的校验块位置或长度');
  }
  // 链值、块摘要和位置都使用定长编码，不能用含糊的字符串拼接替代。
  const bytes = new Uint8Array(76);
  bytes.set(hashBytes(previous), 0);
  bytes.set(hashBytes(chunkHash), 32);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(64, BigInt(index));
  view.setUint32(72, length);
  return digestChunk(bytes);
}
