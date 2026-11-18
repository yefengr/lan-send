import assert from 'node:assert/strict';
import crypto, { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { WebSocket } from 'ws';
import { INVITATION_TTL_MS, MAX_CONTROL_BYTES, PAIR_CODE_TTL_MS, parseServerMessage } from '@lan-send/protocol';
import type { ClientMessage, ServerMessage } from '@lan-send/protocol';
import { createLanSendServer } from '../src/server.js';
import { LIMITS, normalizeAddress } from '../src/security.js';

const ORIGIN = 'http://localhost:5173';
const PUBLIC = 'https://send.example.test';
type Message<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

class Probe {
  readonly messages: ServerMessage[] = [];
  private wake: (() => void) | undefined;
  constructor(readonly ws: WebSocket) {
    ws.on('error', () => {});
    ws.on('message', data => {
      const message = parseServerMessage(data.toString());
      assert.ok(message, '服务端输出必须通过共享协议解析');
      this.messages.push(message); this.wake?.();
    });
  }
  send(message: ClientMessage): void { this.ws.send(JSON.stringify(message)); }
  request<T extends ClientMessage['type']>(type: T, fields: Record<string, unknown> = {}): string {
    const requestId = randomUUID();
    this.ws.send(JSON.stringify({ v: 1, type, requestId, ...fields }));
    return requestId;
  }
  async wait<T extends ServerMessage['type']>(type: T, match: (value: Message<T>) => boolean = () => true): Promise<Message<T>> {
    const deadline = Date.now() + 2_000;
    for (;;) {
      const index = this.messages.findIndex(value => value.type === type && match(value as Message<T>));
      if (index >= 0) return this.messages.splice(index, 1)[0] as Message<T>;
      const remaining = deadline - Date.now();
      assert.ok(remaining > 0, `等待 ${type} 超时；队列: ${JSON.stringify(this.messages)}`);
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { this.wake = undefined; resolve(); }, remaining);
        this.wake = () => { clearTimeout(timer); this.wake = undefined; resolve(); };
      });
    }
  }
  async error(requestId?: string, code?: string): Promise<Message<'error'>> {
    return this.wait('error', value => (!requestId || value.requestId === requestId) && (!code || value.code === code));
  }
  async register(name = '设备'): Promise<Message<'welcome'>> {
    this.send({ v: 1, type: 'hello', name }); return this.wait('welcome');
  }
  async close(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    const closed = once(this.ws, 'close'); this.ws.terminate(); await closed;
  }
}

async function fixture(t: TestContext, webRoot?: string) {
  let clock = 1_000_000;
  let source = '127.0.0.1';
  const app = createLanSendServer({ allowedOrigins: [ORIGIN, PUBLIC],
    ...(webRoot ? { webRoot } : {}), now: () => clock, sourceAddress: () => source });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const address = app.server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const probes: Probe[] = [];
  t.after(async () => { await Promise.all(probes.map(probe => probe.close())); await app.close(); await app.close(); });
  return {
    base, app, advance: (ms: number) => { clock += ms; },
    async connect(ip = '127.0.0.1', origin = ORIGIN, extra: Record<string, string> = {}, path = '/ws') {
      source = ip;
      const ws = new WebSocket(`${base.replace('http:', 'ws:')}${path}`, { origin, headers: extra });
      const probe = new Probe(ws); probes.push(probe);
      await once(ws, 'open'); return probe;
    },
    async denied(origin: string | undefined, path = '/ws', ip = '127.0.0.1'): Promise<number> {
      source = ip;
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`${base.replace('http:', 'ws:')}${path}`, origin ? { origin } : {});
        ws.once('unexpected-response', (_request, response) => { const status = response.statusCode!; response.resume(); ws.terminate(); resolve(status); });
        ws.on('error', () => {}); ws.once('open', () => { ws.terminate(); reject(new Error('握手意外成功')); });
      });
    },
  };
}

const file = () => ({ id: randomUUID(), name: '真实文件.txt', size: 123, lastModified: 1 });
async function offer(sender: Probe, target: string) {
  const metadata = file();
  const requestId = sender.request('offer', { to: target, file: metadata });
  const offered = await sender.wait('offered', value => value.requestId === requestId);
  assert.equal(offered.transferId, metadata.id);
  return { offered, metadata, requestId };
}
async function pair(sender: Probe, receiver: Probe, target: string) {
  const invitation = await offer(sender, target);
  const incoming = await receiver.wait('incoming');
  assert.deepEqual(incoming.file, invitation.metadata);
  const acceptId = receiver.request('accept', { invitationId: incoming.invitationId });
  const sent = await sender.wait('paired'); const received = await receiver.wait('paired');
  await receiver.wait('ack', value => value.requestId === acceptId);
  assert.equal(sent.pairId, received.pairId); assert.equal(sent.generation, 1);
  assert.equal(sent.role, 'sender'); assert.equal(received.role, 'receiver');
  return { ...invitation, sent, received, acceptId };
}

const candidate = { kind: 'candidate' as const, candidate: null };
function signal(probe: Probe, pairId: string, generation = 1): void {
  probe.send({ v: 1, type: 'signal', pairId, generation, signal: candidate });
}

// 每个 fixture 只绑定本机临时端口，并在 after 中关闭所有客户端、HTTP、WS 与定时器。
test('注册绑定临时身份、规范化地址、同组发现且 hello 仅一次', async t => {
  assert.equal(normalizeAddress('::ffff:127.0.0.1'), '127.0.0.1');
  assert.equal(normalizeAddress('2001:0db8:0:0:0:0:0:1'), '2001:db8::1');
  const f = await fixture(t);
  const a = await f.connect(); const aw = await a.register('<设备 A>');
  const b = await f.connect('::ffff:7f00:1'); const bw = await b.register('设备 B');
  assert.equal(bw.peers[0]?.id, aw.self.id);
  assert.equal((await a.wait('peers', value => value.peers.some(peer => peer.id === bw.self.id))).peers[0]?.name, '设备 B');
  assert.notEqual(aw.self.id, bw.self.id); assert.match(aw.code, /^\d{8}$/u);
  a.send({ v: 1, type: 'hello', name: '重绑' }); await a.error(undefined, 'FORBIDDEN');
  a.ws.send(JSON.stringify({ v: 1, type: 'rename', requestId: randomUUID(), name: '伪造', from: bw.self.id }));
  await a.error(undefined, 'INVALID_MESSAGE');
  const id = a.request('rename', { name: '新设备名' });
  assert.equal((await a.wait('self')).self.name, '新设备名'); await a.wait('ack', value => value.requestId === id);
});

test('跨组猜 ID 禁止；查码仅授权邀请，刷新、消费撤销授权', async t => {
  const f = await fixture(t);
  const a = await f.connect('192.0.2.1'); await a.register('A');
  const b = await f.connect('192.0.2.2'); const bw = await b.register('B');
  assert.deepEqual(bw.peers, []);
  await a.error(a.request('offer', { to: bw.self.id, file: file() }), 'FORBIDDEN');
  let lookupId = a.request('lookup', { code: bw.code });
  await a.wait('lookup-result', value => value.requestId === lookupId);
  const refreshId = b.request('refresh-code');
  const fresh = await b.wait('self'); await b.wait('ack', value => value.requestId === refreshId);
  assert.notEqual(fresh.code, bw.code);
  await a.error(a.request('offer', { to: bw.self.id, file: file() }), 'FORBIDDEN');
  await a.error(a.request('lookup', { code: bw.code }), 'NOT_FOUND');
  lookupId = a.request('lookup', { code: fresh.code });
  await a.wait('lookup-result', value => value.requestId === lookupId);
  const formed = await pair(a, b, bw.self.id);
  assert.equal(formed.sent.file.id, formed.metadata.id);
  const postPairCode = await b.wait('self'); assert.notEqual(postPairCode.code, fresh.code);
  await a.error(a.request('lookup', { code: fresh.code }), 'NOT_FOUND');
  for (const peer of [a, b]) peer.send({ v: 1, type: 'release', pairId: formed.sent.pairId,
    transferId: formed.sent.transferId, outcome: 'completed' });
  const renameId = b.request('rename', { name: '屏障' }); await b.wait('ack', value => value.requestId === renameId);
  await a.error(a.request('offer', { to: bw.self.id, file: file() }), 'FORBIDDEN');
});

test('前导零配对码保持字符串；过期、会话与真实来源查码限流', async t => {
  const f = await fixture(t);
  const a = await f.connect('192.0.2.1'); await a.register('A');
  const b = await f.connect('192.0.2.2');
  const mock = t.mock.method(crypto, 'randomInt', () => 1234);
  let bw: Message<'welcome'>;
  syncBuiltinESMExports();
  try { bw = await b.register('B'); } finally { mock.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(bw.code, '00001234');
  const lookupId = a.request('lookup', { code: '00001234' });
  assert.equal((await a.wait('lookup-result', value => value.requestId === lookupId)).peer.id, bw.self.id);
  for (let i = 0; i < 4; i++) {
    const id = a.request('lookup', { code: bw.code }); await a.wait('lookup-result', value => value.requestId === id);
  }
  await a.error(a.request('lookup', { code: bw.code }), 'RATE_LIMITED');
  f.advance(PAIR_CODE_TTL_MS + 1);
  await a.error(a.request('lookup', { code: bw.code }), 'NOT_FOUND');
  await a.error(a.request('offer', { to: bw.self.id, file: file() }), 'FORBIDDEN');
  const current = await b.wait('self');
  await b.error(b.request('lookup', { code: current.code }), 'FORBIDDEN');
  // 同来源的七个会话不能各自绕过来源的总查码额度。
  for (let i = 0; i < 7; i++) {
    const peer = await f.connect('198.51.100.1'); await peer.register(`查码 ${i}`);
    for (let j = 0; j < 5; j++) {
      const id = peer.request('lookup', { code: current.code });
      if (i < 6) await peer.wait('lookup-result', value => value.requestId === id);
      else await peer.error(id, 'RATE_LIMITED');
    }
  }
});

test('接受前、第三方、旧代次不能信令；接受幂等与交叉忙状态', async t => {
  const f = await fixture(t);
  const a = await f.connect(); const aw = await a.register('A');
  const b = await f.connect(); const bw = await b.register('B');
  const c = await f.connect(); await c.register('C');
  signal(a, randomUUID()); await a.error(undefined, 'FORBIDDEN');
  const offered = await offer(a, bw.self.id); await b.wait('incoming');
  const deniedAccept = a.request('accept', { invitationId: offered.offered.invitationId });
  await a.error(deniedAccept, 'FORBIDDEN');
  await c.error(c.request('accept', { invitationId: offered.offered.invitationId }), 'FORBIDDEN');
  await b.error(b.request('offer', { to: aw.self.id, file: file() }), 'BUSY');
  const acceptId = b.request('accept', { invitationId: offered.offered.invitationId });
  const ap = await a.wait('paired'); const bp = await b.wait('paired');
  assert.equal(ap.pairId, bp.pairId); await b.wait('ack', value => value.requestId === acceptId);
  b.ws.send(JSON.stringify({ v: 1, type: 'accept', requestId: acceptId, invitationId: offered.offered.invitationId }));
  await b.wait('ack', value => value.requestId === acceptId);
  const duplicate = b.request('accept', { invitationId: offered.offered.invitationId });
  await b.wait('ack', value => value.requestId === duplicate);
  const barrier = a.request('rename', { name: 'A2' }); await a.wait('ack', value => value.requestId === barrier);
  assert.equal(a.messages.filter(value => value.type === 'paired').length, 0);
  assert.equal(b.messages.filter(value => value.type === 'paired').length, 0);
  signal(c, ap.pairId); await c.error(undefined, 'FORBIDDEN');
  signal(a, ap.pairId, 2); await a.error(undefined, 'FORBIDDEN');
  signal(a, ap.pairId); assert.equal((await b.wait('signal')).from, aw.self.id);
  a.send({ v: 1, type: 'signal', pairId: ap.pairId, generation: 1,
    signal: { kind: 'description', description: { type: 'answer', sdp: '错误角色' } } });
  await a.error(undefined, 'FORBIDDEN');
  a.send({ v: 1, type: 'signal', pairId: ap.pairId, generation: 1,
    signal: { kind: 'description', description: { type: 'offer', sdp: 'v=0\r\n' } } });
  assert.equal((await b.wait('signal')).signal.kind, 'description');
  await a.error(a.request('offer', { to: bw.self.id, file: file() }), 'BUSY');
});

test('拒收、邀请过期、取消意图、双端释放、单会话文件身份不复用', async t => {
  const f = await fixture(t);
  const a = await f.connect(); await a.register('A');
  const b = await f.connect(); const bw = await b.register('B');
  let invitation = await offer(a, bw.self.id); await b.wait('incoming');
  const rejectId = b.request('reject', { invitationId: invitation.offered.invitationId });
  assert.equal((await a.wait('rejected')).reason, 'rejected'); await b.wait('rejected');
  await b.wait('ack', value => value.requestId === rejectId);
  await a.error(a.request('offer', { to: bw.self.id, file: invitation.metadata }), 'FORBIDDEN');
  invitation = await offer(a, bw.self.id); await b.wait('incoming');
  f.advance(INVITATION_TTL_MS + 1);
  const barrier = a.request('rename', { name: 'A2' }); await a.wait('ack', value => value.requestId === barrier);
  assert.equal((await a.wait('rejected')).reason, 'expired'); assert.equal((await b.wait('rejected')).reason, 'expired');
  invitation = await offer(a, bw.self.id); await b.wait('incoming');
  const cancelId = b.request('cancel', { transferId: invitation.metadata.id });
  await b.wait('ack', value => value.requestId === cancelId); await a.wait('cancel-requested'); await b.wait('cancel-requested');
  const formed = await pair(a, b, bw.self.id);
  const late = a.request('cancel', { transferId: formed.metadata.id });
  await a.wait('ack', value => value.requestId === late); await b.wait('cancel-requested');
  await b.error(b.request('offer', { to: formed.sent.peer.id, file: file() }), 'FORBIDDEN');
  a.send({ v: 1, type: 'release', pairId: formed.sent.pairId, transferId: randomUUID(), outcome: 'completed' });
  await a.error(undefined, 'FORBIDDEN');
  a.send({ v: 1, type: 'release', pairId: formed.sent.pairId, transferId: formed.metadata.id, outcome: 'cancelled' });
  await a.error(a.request('offer', { to: bw.self.id, file: file() }), 'BUSY');
  b.send({ v: 1, type: 'release', pairId: formed.sent.pairId, transferId: formed.metadata.id, outcome: 'completed' });
  await a.wait('peers', value => value.peers.some(peer => peer.id === bw.self.id && !peer.busy));
  const next = await offer(a, bw.self.id); assert.notEqual(next.metadata.id, formed.metadata.id);
});

test('断线仅通知 peer-left 并清理忙状态与邀请权限', async t => {
  const f = await fixture(t);
  const a = await f.connect(); const aw = await a.register('A');
  const b = await f.connect(); const bw = await b.register('B');
  const c = await f.connect(); await c.register('C');
  const formed = await pair(a, b, bw.self.id);
  await a.close();
  assert.equal((await b.wait('peer-left')).peerId, aw.self.id);
  const freshOffer = await offer(c, bw.self.id); assert.ok(freshOffer.offered.invitationId);
  signal(b, formed.sent.pairId); await b.error(undefined, 'FORBIDDEN');
  await b.close(); assert.equal((await c.wait('peer-left', value => value.peerId === bw.self.id)).peerId, bw.self.id);
});

test('转发头和公网 Origin 隔离自动发现，但仍允许查码', async t => {
  const f = await fixture(t);
  const a = await f.connect(); const aw = await a.register('A');
  for (const [origin, headers] of [[ORIGIN, { 'X-Forwarded-For': '127.0.0.1' }],
    [ORIGIN, { Forwarded: 'for=127.0.0.1' }], [ORIGIN, { 'X-Real-IP': '127.0.0.1' }],
    [PUBLIC, {}]] as [string, Record<string, string>][]) {
    const peer = await f.connect('127.0.0.1', origin, headers); const welcome = await peer.register('隔离');
    assert.deepEqual(welcome.peers, []);
    await peer.error(peer.request('offer', { to: aw.self.id, file: file() }), 'FORBIDDEN');
    const lookupId = peer.request('lookup', { code: aw.code }); await peer.wait('lookup-result', value => value.requestId === lookupId);
  }
});

test('一般消息、ICE 和描述计数独立有界', async t => {
  const f = await fixture(t);
  const a = await f.connect(); await a.register('A');
  const b = await f.connect(); const bw = await b.register('B');
  const formed = await pair(a, b, bw.self.id);
  for (let index = 0; index < LIMITS.candidatesPerPeer; index++) {
    if (index % 50 === 0) f.advance(LIMITS.messageWindowMs);
    signal(a, formed.sent.pairId); await b.wait('signal');
  }
  signal(a, formed.sent.pairId); await a.error(undefined, 'RATE_LIMITED');
  for (let index = 0; index < LIMITS.descriptionsPerPeer; index++) {
    a.send({ v: 1, type: 'signal', pairId: formed.sent.pairId, generation: 1,
      signal: { kind: 'description', description: { type: 'offer', sdp: 'v=0' } } });
    await b.wait('signal');
  }
  a.send({ v: 1, type: 'signal', pairId: formed.sent.pairId, generation: 1,
    signal: { kind: 'description', description: { type: 'offer', sdp: 'v=0' } } });
  await a.error(undefined, 'RATE_LIMITED');
  f.advance(LIMITS.messageWindowMs);
  for (let index = 0; index < LIMITS.messagesPerWindow; index++) a.ws.send('{}');
  for (let index = 0; index < LIMITS.messagesPerWindow; index++) await a.error(undefined, 'INVALID_MESSAGE');
  a.ws.send('{}'); await a.error(undefined, 'RATE_LIMITED');
});

test('精确 Origin/路径、未注册连接计数、注册超时、二进制与超长消息', async t => {
  const f = await fixture(t);
  assert.equal(await f.denied('https://evil.example'), 403);
  assert.equal(await f.denied(undefined), 403);
  assert.equal(await f.denied(ORIGIN, '/ws?other=1'), 404);
  assert.equal(await f.denied(ORIGIN, '/other'), 404);
  for (let index = 0; index < LIMITS.connectionsPerSource; index++) await f.connect();
  assert.equal(await f.denied(ORIGIN), 503);
  f.advance(LIMITS.registrationMs + 1);
  const binary = await f.connect(); await binary.register();
  const closedBinary = once(binary.ws, 'close'); binary.ws.send(Buffer.from('正文'));
  assert.equal((await closedBinary)[0], 1003);
  const huge = await f.connect(); await huge.register();
  const closedHuge = once(huge.ws, 'close'); huge.ws.send('x'.repeat(MAX_CONTROL_BYTES + 1));
  assert.equal((await closedHuge)[0], 1009);
});

test('安全 HTTP 静态根、最小健康响应、HEAD 与来源配置拒绝', async t => {
  assert.throws(() => createLanSendServer({ allowedOrigins: ['https://example.test/'] }));
  assert.throws(() => createLanSendServer({ allowedOrigins: [ORIGIN], stunUrls: ['turn:example.test'] }));
  const root = await mkdtemp(join(tmpdir(), 'lan-send-http-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>test</title>');
  await writeFile(join(root, 'assets', 'app.js'), 'console.log(1)');
  await writeFile(join(root, 'secret.ts'), 'secret source');
  const f = await fixture(t, root);
  const health = await fetch(`${f.base}/healthz`);
  assert.deepEqual(await health.json(), { service: 'lan-send', status: 'ok' });
  const html = await fetch(f.base); assert.equal(html.status, 200); assert.match(await html.text(), /doctype/u);
  const head = await fetch(`${f.base}/assets/app.js`, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), ''); assert.ok(head.headers.get('content-length'));
  assert.equal((await fetch(`${f.base}/secret.ts`)).status, 404);
  assert.equal((await fetch(`${f.base}/assets/missing.js`)).status, 404);
  assert.equal((await fetch(`${f.base}/.env`)).status, 400);
  assert.equal((await fetch(`${f.base}/healthz`, { method: 'POST', body: '正文' })).status, 405);
  for (const path of ['/%2e%2e/package.json', '/assets/%5c..%5csecret.ts', '/%00secret.js', '/%invalid']) {
    const status = await new Promise<number>((resolve, reject) => {
      get(f.base, { path }, response => { response.resume(); resolve(response.statusCode!); }).on('error', reject);
    });
    assert.equal(status, 400);
  }
});
