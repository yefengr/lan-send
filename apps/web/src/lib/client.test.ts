import test from 'node:test';
import assert from 'node:assert/strict';
import { LanSendClient } from './client.js';
import type { ServerMessage } from '@lan-send/protocol';

const self = { id: '11111111-1111-1111-1111-111111111111', name: '本机', busy: false };
const peer = { id: '22222222-2222-2222-2222-222222222222', name: '对方', busy: false };
const invitationId = '33333333-3333-3333-3333-333333333333';
const transferId = '44444444-4444-4444-4444-444444444444';
class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { Socket.instances.push(this); }
  send(value: string) { this.sent.push(JSON.parse(value) as Record<string, unknown>); }
  close() { this.readyState = 3; }
  message(value: ServerMessage) { this.onmessage?.({ data: JSON.stringify(value) }); }
  welcome() {
    this.onopen?.();
    this.message({ v: 1, type: 'welcome', self, peers: [peer], code: '00123456',
      codeExpiresAt: Date.now() + 300_000, iceServers: [] });
  }
}
function setup() {
  const original = globalThis.WebSocket;
  globalThis.WebSocket = Socket as unknown as typeof WebSocket;
  const client = new LanSendClient({ wsUrl: 'ws://localhost/ws' });
  return { client, restore: () => { client.dispose(); globalThis.WebSocket = original; } };
}
function latest() { return Socket.instances.at(-1)!; }
function incoming(socket: Socket) {
  socket.message({ v: 1, type: 'incoming', invitationId, from: peer,
    file: { id: transferId, name: '文件.txt', size: 0, lastModified: 1 }, expiresAt: Date.now() + 60_000 });
}

test('构造无连接副作用，快照引用稳定且 connect 显式', () => {
  const before = Socket.instances.length;
  const { client, restore } = setup();
  try {
    assert.equal(Socket.instances.length, before);
    const snapshot = client.getSnapshot();
    assert.equal(client.getSnapshot(), snapshot);
    client.connect();
    assert.equal(Socket.instances.length, before + 1);
    const socket = latest(); socket.welcome();
    assert.equal(client.getSnapshot().connection, 'online');
    assert.equal(client.getSnapshot().code, '00123456');
    assert.equal(client.getSnapshot(), client.getSnapshot());
    client.connect();
    assert.equal(Socket.instances.length, before + 1);
  } finally { restore(); }
});

test('requestId 关联 lookup，只定位选中设备而不虚报直连', async () => {
  const { client, restore } = setup();
  try {
    client.connect(); const socket = latest(); socket.welcome();
    const pairing = client.pairByCode('00123456');
    const request = socket.sent.at(-1)!;
    assert.equal(request.type, 'lookup'); assert.equal(request.code, '00123456');
    socket.message({ v: 1, type: 'lookup-result', requestId: request.requestId as string, peer });
    await pairing;
    assert.equal(client.getSnapshot().selectedPeerId, peer.id);
    assert.equal(client.getSnapshot().task, null);
  } finally { restore(); }
});

test('异步保存授权期间邀请取消：迟到 writer 被 abort，绝不发送 accept', async () => {
  const { client, restore } = setup();
  try {
    client.connect(); const socket = latest(); socket.welcome(); incoming(socket);
    let resolve!: (writer: FileSystemWritableFileStream) => void;
    let aborts = 0;
    const writer = { abort: async () => { aborts++; } } as unknown as FileSystemWritableFileStream;
    const handle = { name: '实际.txt', createWritable: () => new Promise<FileSystemWritableFileStream>(yes => { resolve = yes; }) };
    const accepting = client.accept(invitationId, handle as FileSystemFileHandle);
    const rejected = assert.rejects(accepting, /取消或过期/u);
    socket.message({ v: 1, type: 'cancel-requested', transferId, by: peer.id });
    resolve(writer);
    await rejected;
    assert.equal(aborts, 1);
    assert.equal(socket.sent.some(message => message.type === 'accept'), false);
    assert.equal(client.getSnapshot().incoming, null);
  } finally { restore(); }
});

test('旧 socket 迟到事件不能污染新连接，断开结清请求，dispose 不再连线', async () => {
  const { client, restore } = setup();
  try {
    client.connect(); const old = latest(); old.welcome();
    const oldHandler = old.onmessage!;
    const pending = client.refreshPairCode();
    const rejected = assert.rejects(pending, /断开/u);
    old.onclose?.();
    await rejected;
    client.connect(); const current = latest(); current.welcome();
    oldHandler({ data: JSON.stringify({ v: 1, type: 'peers', peers: [] }) });
    assert.equal(client.getSnapshot().peers.length, 1);
    const outstanding = client.setName('新名称');
    const disposed = assert.rejects(outstanding, /断开/u);
    client.dispose();
    await disposed;
    const count = Socket.instances.length;
    client.connect();
    assert.equal(Socket.instances.length, count);
  } finally { restore(); }
});

test('dispose 期间迟到授权不会 accept 且释放流', async () => {
  const { client, restore } = setup();
  try {
    client.connect(); const socket = latest(); socket.welcome(); incoming(socket);
    let resolve!: (writer: FileSystemWritableFileStream) => void;
    let aborts = 0;
    const handle = { name: '实际.txt', createWritable: () => new Promise<FileSystemWritableFileStream>(yes => { resolve = yes; }) };
    const accepting = client.accept(invitationId, handle as FileSystemFileHandle);
    const rejected = assert.rejects(accepting, /取消或过期/u);
    client.dispose();
    resolve({ abort: async () => { aborts++; } } as unknown as FileSystemWritableFileStream);
    await rejected;
    assert.equal(aborts, 1);
    assert.equal(socket.sent.some(message => message.type === 'accept'), false);
  } finally { restore(); }
});
