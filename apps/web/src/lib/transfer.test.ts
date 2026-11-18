import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHUNK_BYTES, digestChunk, encodeDataFrame, fileManifestDigest, initialChain, MAX_PENDING_EVENTS,
  type DataControl, type FileMeta,
} from '@lan-send/protocol';
import { BoundedInbox, ChannelWriter } from './flow.js';
import { ReceiveSink } from './receive-sink.js';

const id = '11111111-1111-1111-1111-111111111111';
const file: FileMeta = { id, name: '原文件.txt', size: 0, lastModified: 1 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function setup(meta = file, close = async () => {}) {
  const digest = await fileManifestDigest(meta), chain = await initialChain(digest);
  const calls = { writes: 0, closes: 0, aborts: 0 };
  const writer = {
    write: async () => { calls.writes++; },
    close: async () => { calls.closes++; await close(); },
    abort: async () => { calls.aborts++; },
  } as unknown as FileSystemWritableFileStream;
  const hasher = { hash: async (bytes: Uint8Array<ArrayBuffer>) => ({ hash: await digestChunk(bytes), bytes }), dispose: () => {} };
  const sink = new ReceiveSink(meta, 1, digest, chain, writer, '实际保存.txt', hasher);
  const finish: Extract<DataControl, { type: 'finish' }> = {
    v: 1, type: 'finish', transferId: id, generation: 1,
    totalBytes: 0, chunkCount: 0, chain, metaDigest: digest,
  };
  return { sink, calls, finish, writer, digest, chain };
}

test('零字节必须真实 close；重复 finish 回放相同完成记录，不重复提交', async () => {
  const { sink, calls, finish } = await setup();
  assert.equal(sink.completion, null);
  const result = await sink.finish(finish, () => {});
  assert.equal(result.savedName, '实际保存.txt');
  assert.equal(await sink.finish(finish, () => assert.fail('不应再次 saving')), result);
  assert.deepEqual(calls, { writes: 0, closes: 1, aborts: 0 });
  await assert.rejects(sink.finish({ ...finish, chain: '0'.repeat(64) }, () => {}));
});

test('close 开始后取消与清理都不能 abort；慢 close 返回前没有完成记录', async () => {
  const gate = deferred<void>();
  const { sink, calls, finish } = await setup(file, () => gate.promise);
  const saving = sink.finish(finish, () => {});
  assert.equal(sink.closing, true);
  assert.equal(sink.completion, null);
  assert.equal(await sink.cancel(), false);
  assert.equal(await sink.cancel(), false);
  assert.equal(calls.aborts, 0);
  gate.resolve();
  const completion = await saving;
  assert.equal(completion.totalBytes, 0);
  assert.equal(sink.completion, completion);
  assert.equal(await sink.cancel(), false);
});

test('close 失败不会产生完成记录', async () => {
  const { sink, finish, calls } = await setup(file, async () => { throw new Error('disk'); });
  await assert.rejects(sink.finish(finish, () => {}), /保存失败/u);
  assert.equal(sink.completion, null);
  assert.equal(sink.closing, false);
  assert.equal(calls.aborts, 1);
});

test('块摘要迟到时已经取消的流不会再次写入', async () => {
  const meta = { ...file, size: 3 };
  const { writer, calls, digest, chain } = await setup(meta);
  const gate = deferred<{ hash: string; bytes: Uint8Array<ArrayBuffer> }>();
  const sink = new ReceiveSink(meta, 1, digest, chain, writer, '保存.txt', { hash: () => gate.promise, dispose: () => {} });
  const bytes = new Uint8Array([1, 2, 3]), hash = await digestChunk(bytes);
  sink.begin({ v: 1, type: 'chunk-begin', transferId: id, generation: 1, index: 0, offset: 0, length: 3, hash });
  sink.frame(encodeDataFrame({ transferId: id, generation: 1, chunkIndex: 0, chunkLength: 3,
    chunkOffset: 0, offset: 0, payload: bytes }), 16 * 1024);
  const pending = sink.end(0);
  await sink.cancel();
  gate.resolve({ hash, bytes });
  assert.equal(await pending, null);
  assert.deepEqual(calls, { writes: 0, closes: 0, aborts: 1 });
});

test('验证帧顺序、块摘要，只有 write 成功后推进确认并缓存 ACK', async () => {
  const meta = { ...file, size: 3 };
  const { sink, calls, finish } = await setup(meta);
  const bytes = new Uint8Array([9, 8, 7]), hash = await digestChunk(bytes);
  sink.begin({ v: 1, type: 'chunk-begin', transferId: id, generation: 1, index: 0, offset: 0, length: 3, hash });
  assert.throws(() => sink.begin({ v: 1, type: 'chunk-begin', transferId: id, generation: 1,
    index: 1, offset: CHUNK_BYTES, length: 3, hash }));
  const frame = encodeDataFrame({ transferId: id, generation: 1, chunkIndex: 0, chunkLength: 3,
    chunkOffset: 0, offset: 0, payload: bytes });
  sink.frame(frame, 16 * 1024);
  assert.throws(() => sink.frame(frame, 16 * 1024));
  assert.equal(sink.offset, 0);
  const ack = await sink.end(0);
  assert.equal(ack?.offset, 3);
  assert.equal(calls.writes, 1);
  assert.equal(await sink.end(0), ack);
  await sink.finish({ ...finish, totalBytes: 3, chunkCount: 1, chain: ack!.chain }, () => {});
  assert.equal(calls.closes, 1);
});

test('接收队列分别限制事件数和总字节，独立于对端额度', async () => {
  const gate = deferred<void>();
  let failures = 0, consumed = 0;
  const inbox = new BoundedInbox(async () => { consumed++; await gate.promise; }, () => { failures++; });
  for (let index = 0; index <= MAX_PENDING_EVENTS; index++) inbox.push('x');
  assert.equal(failures, 1);
  const bytes = new BoundedInbox(async () => gate.promise, () => { failures++; });
  for (let index = 0; index < 4; index++) bytes.push(new ArrayBuffer(CHUNK_BYTES));
  assert.equal(failures, 2);
  inbox.stop(); bytes.stop(); gate.resolve();
  await Promise.resolve();
  assert.equal(consumed, 0);
});

test('发送高水位等待低水位，stop 结清排水等待', async () => {
  class Channel extends EventTarget {
    bufferedAmount = CHUNK_BYTES;
    bufferedAmountLowThreshold = 0;
    readyState = 'open';
    sent = 0;
    send() { this.sent++; }
  }
  const channel = new Channel();
  const writer = new ChannelWriter(channel as unknown as RTCDataChannel);
  const pending = writer.send(new ArrayBuffer(100));
  assert.equal(channel.sent, 0);
  channel.bufferedAmount = 256 * 1024;
  channel.dispatchEvent(new Event('bufferedamountlow'));
  await pending;
  assert.equal(channel.sent, 1);
  channel.bufferedAmount = CHUNK_BYTES;
  const next = writer.send('control');
  writer.stop();
  await assert.rejects(next, /关闭/u);
});
