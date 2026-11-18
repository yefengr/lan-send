import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_FRAME_BYTES, MAX_PENDING_EVENTS, type ServerMessage } from '@lan-send/protocol';
import { DirectConnection } from './direct-connection.js';

const id = '11111111-1111-4111-8111-111111111111';
const pair: Extract<ServerMessage, { type: 'paired' }> = {
  v: 1, type: 'paired', invitationId: id, pairId: id, generation: 1, transferId: id,
  file: { id, name: '文件.bin', size: 0, lastModified: 0 },
  peer: { id, name: '对方', busy: true }, role: 'receiver', iceServers: [],
};
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function harness(alreadyOpen = false) {
  let resolveStats!: (value: RTCStatsReport) => void;
  const stats = new Promise<RTCStatsReport>(resolve => { resolveStats = resolve; });
  class Peer {
    static last: Peer;
    onicecandidate: unknown;
    onconnectionstatechange: unknown;
    ondatachannel: ((event: { channel: RTCDataChannel }) => void) | null = null;
    sctp = { maxMessageSize: MAX_FRAME_BYTES };
    connectionState = 'connecting';
    constructor() { Peer.last = this; }
    getStats() { return stats; }
    close() { this.connectionState = 'closed'; }
  }
  const original = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = Peer as unknown as typeof RTCPeerConnection;
  const data: unknown[] = [];
  let opened = 0, failed = 0;
  const connection = new DirectConnection(pair, () => {}, channel => {
    opened++; channel.onmessage = event => data.push(event.data);
  }, () => { failed++; });
  const channelState = {
    label: 'lan-send', ordered: true, maxRetransmits: null, maxPacketLifeTime: null,
    binaryType: 'arraybuffer', readyState: alreadyOpen ? 'open' : 'connecting',
    onopen: null, onclose: null, onerror: null, onmessage: null,
    close() { this.readyState = 'closed'; },
  };
  const channel = channelState as unknown as RTCDataChannel;
  Peer.last.ondatachannel?.({ channel });
  const route = () => resolveStats(new Map([
    ['pair', { type: 'candidate-pair', state: 'succeeded', nominated: true, localCandidateId: 'local', remoteCandidateId: 'remote' }],
    ['local', { type: 'local-candidate', candidateType: 'host' }],
    ['remote', { type: 'remote-candidate', candidateType: 'host' }],
  ]) as unknown as RTCStatsReport);
  return { connection, channel, data, route, counts: () => ({ opened, failed }),
    dispose: () => { connection.stop(); globalThis.RTCPeerConnection = original; } };
}

test('路由检查等待期间早到 hello/ready 按序保留，检查通过后才交给文件通道', async () => {
  const h = harness();
  try {
    h.channel.onopen?.call(h.channel, new Event('open'));
    h.channel.onmessage?.call(h.channel, new MessageEvent('message', { data: 'hello' }));
    h.channel.onmessage?.call(h.channel, new MessageEvent('message', { data: 'ready' }));
    assert.deepEqual(h.data, []);
    h.route(); await tick();
    assert.deepEqual(h.data, ['hello', 'ready']);
    h.channel.onopen?.call(h.channel, new Event('open')); await tick();
    assert.deepEqual(h.counts(), { opened: 1, failed: 0 });
  } finally { h.dispose(); }
});

test('检查期间的消息缓存独立有界，超额立即关闭且不启动文件传输', async () => {
  const h = harness();
  try {
    h.channel.onopen?.call(h.channel, new Event('open'));
    for (let i = 0; i <= MAX_PENDING_EVENTS; i++) {
      h.channel.onmessage?.call(h.channel, new MessageEvent('message', { data: 'hello' }));
    }
    assert.equal(h.channel.readyState, 'closed');
    h.route(); await tick();
    assert.deepEqual(h.counts(), { opened: 0, failed: 1 });
    assert.deepEqual(h.data, []);
  } finally { h.dispose(); }
});

test('接收通道已经 open 时不依赖另一次 open 事件就能完成一次交接', async () => {
  const h = harness(true);
  try {
    h.route(); await tick();
    assert.deepEqual(h.counts(), { opened: 1, failed: 0 });
  } finally { h.dispose(); }
});

test('已 open 接收通道也会检查路由，停止后迟到统计不能重新启动', async () => {
  const h = harness(true);
  try {
    await tick();
    h.channel.onopen?.call(h.channel, new Event('open'));
    h.connection.stop(); h.route(); await tick();
    assert.deepEqual(h.counts(), { opened: 0, failed: 0 });
    assert.equal(h.channel.onmessage, null);
  } finally { h.dispose(); }
});
