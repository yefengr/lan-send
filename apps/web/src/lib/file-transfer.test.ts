import test from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_BYTES, digestChunk, MAX_FRAME_BYTES, type ServerMessage } from '@lan-send/protocol';
import { FileTransfer } from './file-transfer.js';
import type { TaskSnapshot } from './types.js';

class TestWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  stopped = false;
  postMessage(message: { id: number; bytes: ArrayBuffer }) {
    void digestChunk(new Uint8Array(message.bytes)).then(hash => {
      if (!this.stopped) this.onmessage?.({ data: { ...message, hash } });
    });
  }
  terminate() { this.stopped = true; }
}
class TestChannel extends EventTarget {
  readyState = 'open';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  peer!: TestChannel;
  dropCompletion = false;
  sent: (string | ArrayBuffer)[] = [];
  send(data: string | ArrayBuffer) {
    this.sent.push(data);
    if (typeof data === 'string' && this.dropCompletion && JSON.parse(data).type === 'complete') return;
    queueMicrotask(() => { if (this.peer.readyState === 'open') this.peer.onmessage?.({ data }); });
  }
  close() { this.readyState = 'closed'; }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
function harness(size: number, close: () => Promise<void> = async () => {}) {
  const original = globalThis.Worker;
  globalThis.Worker = TestWorker as unknown as typeof Worker;
  const bytes = Uint8Array.from({ length: size }, (_, index) => index % 251);
  const source = new File([bytes], '源文件.txt', { lastModified: 10 });
  const pair: Extract<ServerMessage, { type: 'paired' }> = {
    v: 1, type: 'paired', invitationId: '11111111-1111-1111-1111-111111111111',
    pairId: '22222222-2222-2222-2222-222222222222', generation: 1,
    transferId: '33333333-3333-3333-3333-333333333333',
    file: { id: '33333333-3333-3333-3333-333333333333', name: source.name, size, lastModified: 10 },
    peer: { id: '44444444-4444-4444-4444-444444444444', name: '对方', busy: true },
    role: 'sender', iceServers: [],
  };
  const a = new TestChannel(), b = new TestChannel(); a.peer = b; b.peer = a;
  const senderState: Partial<TaskSnapshot> = {}, receiverState: Partial<TaskSnapshot> = {};
  const sentComplete = deferred<void>(), receivedComplete = deferred<void>(), saving = deferred<void>();
  let writes = 0, closes = 0, aborts = 0;
  const saved: Uint8Array[] = [];
  const writer = {
    write: async (value: Uint8Array) => { writes++; saved.push(Uint8Array.from(value)); },
    close: async () => { closes++; await close(); },
    abort: async () => { aborts++; },
  } as unknown as FileSystemWritableFileStream;
  const sender = new FileTransfer(pair, source, null, '', patch => {
    Object.assign(senderState, patch);
    if (patch.phase === 'completed') sentComplete.resolve();
  }, () => {});
  const receiver = new FileTransfer({ ...pair, role: 'receiver' }, null, writer, '实际目标.txt', patch => {
    Object.assign(receiverState, patch);
    if (patch.phase === 'completed') receivedComplete.resolve();
    if (patch.phase === 'saving') saving.resolve();
  }, () => {});
  const start = () => {
    sender.attach(a as unknown as RTCDataChannel, MAX_FRAME_BYTES);
    receiver.attach(b as unknown as RTCDataChannel, MAX_FRAME_BYTES);
  };
  return { sender, receiver, a, b, bytes, saved, senderState, receiverState,
    sentComplete, receivedComplete, saving, start, counts: () => ({ writes, closes, aborts }),
    dispose: () => { sender.dispose(); receiver.dispose(); globalThis.Worker = original; } };
}

test('双端完整状态机：跨 1 MiB 边界逐块 ACK、串行写入、真实 close 和完成证明', { timeout: 3000 }, async () => {
  const h = harness(CHUNK_BYTES + 17);
  try {
    h.start();
    await h.sentComplete.promise;
    assert.equal(h.senderState.phase, 'completed');
    assert.equal(h.receiverState.phase, 'completed');
    assert.equal(h.senderState.confirmedBytes, h.bytes.byteLength);
    assert.equal(h.senderState.savedName, '实际目标.txt');
    assert.deepEqual(h.counts(), { writes: 2, closes: 1, aborts: 0 });
    const saved = new Uint8Array(h.bytes.length);
    saved.set(h.saved[0]!); saved.set(h.saved[1]!, CHUNK_BYTES);
    assert.deepEqual(saved, h.bytes);
    for (const data of h.a.sent) if (data instanceof ArrayBuffer) assert.ok(data.byteLength <= MAX_FRAME_BYTES);
  } finally { h.dispose(); }
});

test('完成证明丢失后 status-request 回放记录，不重写/重关；零字节同样提交', { timeout: 3000 }, async () => {
  const h = harness(0);
  try {
    h.b.dropCompletion = true;
    h.start();
    await h.receivedComplete.promise;
    assert.notEqual(h.senderState.phase, 'completed');
    assert.equal(h.senderState.canQuery, true);
    h.b.dropCompletion = false;
    h.sender.query();
    await h.sentComplete.promise;
    assert.deepEqual(h.counts(), { writes: 0, closes: 1, aborts: 0 });
  } finally { h.dispose(); }
});

test('保存确认丢失后发送端自动查询既有完成记录，零字节不重复提交', { timeout: 3000 }, async () => {
  const h = harness(0);
  try {
    h.b.dropCompletion = true;
    h.start();
    await h.receivedComplete.promise;
    assert.notEqual(h.senderState.phase, 'completed');
    h.b.dropCompletion = false;
    await h.sentComplete.promise;
    assert.ok(h.a.sent.some(data => typeof data === 'string' && JSON.parse(data).type === 'status-request'));
    assert.deepEqual(h.counts(), { writes: 0, closes: 1, aborts: 0 });
  } finally { h.dispose(); }
});

test('保存失败回告明确失败并释放提交状态，不误报未知或永久占用文件', { timeout: 3000 }, async () => {
  const h = harness(0, async () => { throw new DOMException('disk', 'QuotaExceededError'); });
  try {
    h.start();
    for (let i = 0; i < 50 && h.senderState.phase !== 'failed'; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(h.receiverState.phase, 'failed');
    assert.equal(h.senderState.phase, 'failed');
    assert.equal(h.receiver.committing, false);
    assert.deepEqual(h.counts(), { writes: 0, closes: 1, aborts: 1 });
  } finally { h.dispose(); }
});

test('保存提交中断线和取消不覆盖真实 close；接收端完成、发送端结果未确认', { timeout: 3000 }, async () => {
  const gate = deferred<void>();
  const h = harness(0, () => gate.promise);
  try {
    h.start();
    await h.saving.promise;
    assert.equal(h.receiver.committing, true);
    h.a.close(); h.b.close();
    h.sender.connectionLost(); h.receiver.connectionLost();
    await h.receiver.cancel();
    assert.equal(h.receiverState.phase, 'saving');
    assert.equal(h.senderState.phase, 'result-unknown');
    assert.equal(h.senderState.canQuery, false);
    gate.resolve();
    await h.receivedComplete.promise;
    assert.equal(h.receiverState.phase, 'completed');
    assert.deepEqual(h.counts(), { writes: 0, closes: 1, aborts: 0 });
  } finally { h.dispose(); }
});
