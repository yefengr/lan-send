import { CHUNK_BYTES, FRAME_HEADER_BYTES, MAX_FRAME_BYTES, MAX_FRAME_PAYLOAD, PROTOCOL_VERSION } from './constants.js';
import { isWireId } from './validation.js';
import type { DataFrame } from './types.js';

const MAGIC = 0x4c534e44;
const DATA_KIND = 1;
const UINT32_MAX = 0xffff_ffff;

function assertFrame(frame: DataFrame): void {
  const safe = (value: number) => Number.isSafeInteger(value) && value >= 0;
  if (!isWireId(frame.transferId) || !safe(frame.generation) || frame.generation < 1 || frame.generation > UINT32_MAX
    || !safe(frame.chunkIndex) || !safe(frame.offset) || !safe(frame.chunkOffset)
    || !Number.isInteger(frame.chunkLength) || frame.chunkLength < 1 || frame.chunkLength > CHUNK_BYTES
    || frame.payload.byteLength < 1 || frame.payload.byteLength > MAX_FRAME_PAYLOAD
    || frame.chunkOffset + frame.payload.byteLength > frame.chunkLength
    || !safe(frame.chunkIndex * CHUNK_BYTES + frame.chunkOffset)
    || frame.offset !== frame.chunkIndex * CHUNK_BYTES + frame.chunkOffset) {
    throw new RangeError('无效的文件帧');
  }
}

export function encodeDataFrame(frame: DataFrame): ArrayBuffer {
  assertFrame(frame);
  const bytes = new Uint8Array(FRAME_HEADER_BYTES + frame.payload.byteLength);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, MAGIC);
  header.setUint8(4, PROTOCOL_VERSION);
  header.setUint8(5, DATA_KIND);
  header.setUint16(6, FRAME_HEADER_BYTES);
  const id = frame.transferId.replaceAll('-', '');
  for (let i = 0; i < 16; i++) bytes[8 + i] = Number.parseInt(id.slice(i * 2, i * 2 + 2), 16);
  header.setUint32(24, frame.generation);
  header.setBigUint64(32, BigInt(frame.chunkIndex));
  header.setBigUint64(40, BigInt(frame.offset));
  header.setUint32(48, frame.chunkLength);
  header.setUint32(52, frame.chunkOffset);
  header.setUint32(56, frame.payload.byteLength);
  bytes.set(frame.payload, FRAME_HEADER_BYTES);
  return bytes.buffer;
}

export function decodeDataFrame(data: ArrayBuffer): DataFrame {
  if (!(data instanceof ArrayBuffer) || data.byteLength <= FRAME_HEADER_BYTES || data.byteLength > MAX_FRAME_BYTES) {
    throw new RangeError('文件帧长度不符合协议');
  }
  const header = new DataView(data);
  if (header.getUint32(0) !== MAGIC || header.getUint8(4) !== PROTOCOL_VERSION || header.getUint8(5) !== DATA_KIND
    || header.getUint16(6) !== FRAME_HEADER_BYTES || header.getUint32(28) !== 0 || header.getUint32(60) !== 0
    || header.getUint32(56) !== data.byteLength - FRAME_HEADER_BYTES) {
    throw new RangeError('文件帧头不符合协议');
  }
  const bytes = new Uint8Array(data);
  const hex = Array.from(bytes.subarray(8, 24), value => value.toString(16).padStart(2, '0')).join('');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const index = header.getBigUint64(32), offset = header.getBigUint64(40);
  if (index > BigInt(Number.MAX_SAFE_INTEGER) || offset > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('文件帧偏移超出安全整数范围');
  }
  const frame: DataFrame = {
    transferId: id,
    generation: header.getUint32(24),
    chunkIndex: Number(index),
    offset: Number(offset),
    chunkLength: header.getUint32(48),
    chunkOffset: header.getUint32(52),
    payload: new Uint8Array(data, FRAME_HEADER_BYTES),
  };
  assertFrame(frame);
  return frame;
}
