import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  CHUNK_BYTES, FRAME_HEADER_BYTES, MAX_FRAME_BYTES, MAX_FRAME_PAYLOAD,
  advanceChain, decodeDataFrame, digestChunk, encodeDataFrame, fileManifestDigest,
  initialChain, parseClientMessage, parseDataControl, parseServerMessage, sanitizeFileName,
} from '../src/index.js';

const id = '00000000-0000-4000-8000-000000000001';
const file = { id, name: '测试文件.bin', size: 10 * 1024 ** 3, lastModified: 0 };
const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');

test('二进制帧在 4 GiB 与 10 GiB 偏移处保持精确，帧总长受限', () => {
  for (const offset of [0, 4 * 1024 ** 3, 10 * 1024 ** 3]) {
    const payload = new Uint8Array(MAX_FRAME_PAYLOAD).fill(173);
    const encoded = encodeDataFrame({ transferId: id, generation: 1, chunkIndex: offset / CHUNK_BYTES,
      offset, chunkOffset: 0, chunkLength: CHUNK_BYTES, payload });
    assert.equal(encoded.byteLength, MAX_FRAME_BYTES);
    const decoded = decodeDataFrame(encoded);
    assert.equal(decoded.offset, offset);
    assert.equal(decoded.transferId, id);
    assert.deepEqual(decoded.payload, payload);
  }
});

test('拒绝越界、截断、保留位和不一致的帧位置', () => {
  const base = { transferId: id, generation: 1, chunkIndex: 0, offset: 0, chunkOffset: 0,
    chunkLength: 10, payload: new Uint8Array([1, 2]) };
  assert.throws(() => encodeDataFrame({ ...base, offset: 2 }));
  assert.throws(() => encodeDataFrame({ ...base, payload: new Uint8Array(MAX_FRAME_PAYLOAD + 1) }));
  assert.throws(() => decodeDataFrame(new ArrayBuffer(FRAME_HEADER_BYTES)));
  const reserved = encodeDataFrame(base);
  new DataView(reserved).setUint32(60, 1);
  assert.throws(() => decodeDataFrame(reserved));
  const oversizedOffset = encodeDataFrame(base);
  new DataView(oversizedOffset).setBigUint64(40, 2n ** 53n);
  assert.throws(() => decodeDataFrame(oversizedOffset));
  const truncated = encodeDataFrame(base).slice(0, -1);
  assert.throws(() => decodeDataFrame(truncated));
});

test('摘要与独立 SHA-256 一致，清单绑定身份，校验链绑定块顺序和长度', async () => {
  const bytes = new Uint8Array([0, 7, 128, 255]);
  assert.equal(await digestChunk(bytes), sha(bytes));
  const manifest = await fileManifestDigest(file);
  assert.notEqual(manifest, await fileManifestDigest({ ...file, name: '另一名称.bin' }));
  const first = await initialChain(manifest), block = await digestChunk(bytes);
  assert.notEqual(first, await advanceChain(first, block, 0, bytes.length));
  assert.notEqual(await advanceChain(first, block, 0, 4), await advanceChain(first, block, 1, 4));
  assert.notEqual(await advanceChain(first, block, 0, 4), await advanceChain(first, block, 0, 3));
  assert.equal((await initialChain(await fileManifestDigest({ ...file, size: 0 }))).length, 64);
});

test('线协议保留前导零，拒绝伪造字段、不安全长度、TURN 和错误版本', () => {
  const lookup = { v: 1, type: 'lookup', requestId: id, code: '00001234' };
  assert.deepEqual(parseClientMessage(JSON.stringify(lookup)), lookup);
  assert.equal(parseClientMessage(JSON.stringify({ ...lookup, from: id })), null);
  assert.equal(parseClientMessage(JSON.stringify({ ...lookup, v: 2 })), null);
  assert.notEqual(parseClientMessage(JSON.stringify({ v: 1, type: 'offer', requestId: id, to: id,
    file: { ...file, lastModified: -1 } })), null);
  assert.equal(parseClientMessage(JSON.stringify({ v: 1, type: 'offer', requestId: id, to: id,
    file: { ...file, size: 2 ** 53 } })), null);
  assert.equal(parseServerMessage(JSON.stringify({ v: 1, type: 'welcome', self: { id, name: '电脑', busy: false },
    code: '00001234', codeExpiresAt: 1, peers: [], iceServers: [{ urls: ['turn:example.com'] }] })), null);
  assert.equal(parseDataControl(JSON.stringify({ v: 1, type: 'cancel', transferId: id, generation: 0 })), null);
  assert.equal(parseClientMessage('['), null);
  assert.equal(parseClientMessage(' '.repeat(65_537)), null);
});

test('保存建议名不包含目录跳转、路径分隔符或 Windows 保留名称', () => {
  assert.equal(sanitizeFileName(''), '文件_未命名');
  assert.equal(sanitizeFileName('..'), '文件_未命名');
  assert.equal(sanitizeFileName('CON.txt'), '文件_CON.txt');
  assert.equal(sanitizeFileName('项目视频.mp4'), '项目视频.mp4');
  assert.doesNotMatch(sanitizeFileName('../资料/文件?.zip'), /[\\/:*?"<>|]/u);
});
