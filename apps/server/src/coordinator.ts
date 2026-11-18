import { createHash, randomInt, randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import {
  INVITATION_TTL_MS, MAX_PEERS, PAIR_CODE_LENGTH, PAIR_CODE_TTL_MS, parseClientMessage,
} from '@lan-send/protocol';
import type { ClientMessage, ErrorCode, FileMeta, IceServer, PeerSummary, ServerMessage } from '@lan-send/protocol';
import { LIMITS, take } from './security.js';
import type { WindowCounter } from './security.js';

interface RequestRecord { fingerprint: string; response: ServerMessage; expires: number }
interface Source { connections: number; lookups: WindowCounter }
interface Session {
  ws: WebSocket; id: string; source: string; group: string | null; name: string | null;
  code: string; codeExpires: number; registeredBy: number; alive: boolean;
  messages: WindowCounter; lookups: WindowCounter; refreshes: WindowCounter;
  grants: Map<string, string>; requests: Map<string, RequestRecord>; usedTransfers: Set<string>;
  invitation: string | null; pair: string | null;
}
interface Invitation {
  id: string; sender: Session; receiver: Session; file: FileMeta; expires: number;
}
interface Pair {
  id: string; invitationId: string; sender: Session; receiver: Session; file: FileMeta;
  released: Set<string>; candidates: Map<string, number>; descriptions: Map<string, number>;
}

export class Coordinator {
  private sessions = new Set<Session>();
  private peers = new Map<string, Session>();
  private codes = new Map<string, Session>();
  private sources = new Map<string, Source>();
  private invitations = new Map<string, Invitation>();
  private pairs = new Map<string, Pair>();
  private sweepTimer: ReturnType<typeof setInterval>;
  private heartbeatTimer: ReturnType<typeof setInterval>;
  private stopped = false;

  constructor(private now: () => number, private iceServers: IceServer[]) {
    this.sweepTimer = setInterval(() => this.sweep(), LIMITS.sweepMs);
    this.heartbeatTimer = setInterval(() => this.heartbeat(), LIMITS.heartbeatMs);
    this.sweepTimer.unref(); this.heartbeatTimer.unref();
  }

  canConnect(source: string): boolean {
    this.sweep();
    return !this.stopped && this.sessions.size < LIMITS.connections
      && (this.sources.get(source)?.connections ?? 0) < LIMITS.connectionsPerSource
      && (this.sources.has(source) || this.sources.size < 1024);
  }

  connect(ws: WebSocket, source: string, group: string | null): void {
    const now = this.now();
    const state = this.sources.get(source) ?? { connections: 0, lookups: { start: now, count: 0 } };
    state.connections++; this.sources.set(source, state);
    const session: Session = {
      ws, id: randomUUID(), source, group, name: null, code: '', codeExpires: 0,
      registeredBy: now + LIMITS.registrationMs, alive: true,
      messages: { start: now, count: 0 }, lookups: { start: now, count: 0 },
      refreshes: { start: now, count: 0 }, grants: new Map(), requests: new Map(),
      usedTransfers: new Set(), invitation: null, pair: null,
    };
    this.sessions.add(session);
    ws.on('pong', () => { session.alive = true; });
    ws.on('error', () => {
      this.detach(session);
      // ws 已为超长消息发起 1009 关闭时，保留关闭握手，避免改成异常断线。
      if (ws.readyState === WebSocket.OPEN) ws.terminate();
    });
    ws.on('close', () => this.detach(session));
    ws.on('message', (data, binary) => {
      if (!this.sessions.has(session)) return;
      if (binary) { ws.close(1003, '仅接受文本控制消息'); this.detach(session); return; }
      this.receive(session, data.toString());
    });
  }

  stop(): void {
    this.stopped = true;
    clearInterval(this.sweepTimer); clearInterval(this.heartbeatTimer);
    for (const session of [...this.sessions]) { this.detach(session); session.ws.terminate(); }
    this.sources.clear(); this.codes.clear(); this.peers.clear();
    this.invitations.clear(); this.pairs.clear();
  }

  private send(session: Session, message: ServerMessage): void {
    if (session.ws.readyState !== WebSocket.OPEN) return;
    if (session.ws.bufferedAmount > LIMITS.socketBufferedBytes) {
      this.detach(session); session.ws.terminate(); return;
    }
    session.ws.send(JSON.stringify(message), error => {
      if (error) { this.detach(session); session.ws.terminate(); }
    });
  }

  private summary(session: Session): PeerSummary {
    return { id: session.id, name: session.name!, busy: Boolean(session.invitation || session.pair) };
  }

  private candidates(session: Session): PeerSummary[] {
    if (!session.group) return [];
    const result: PeerSummary[] = [];
    for (const peer of this.peers.values()) {
      if (peer !== session && peer.group === session.group) result.push(this.summary(peer));
      if (result.length >= MAX_PEERS) break;
    }
    return result;
  }

  private publishPeers(): void {
    for (const session of this.peers.values()) {
      this.send(session, { v: 1, type: 'peers', peers: this.candidates(session) });
    }
  }

  private self(session: Session): void {
    this.send(session, { v: 1, type: 'self', self: this.summary(session),
      code: session.code, codeExpiresAt: session.codeExpires });
  }

  private rotateCode(session: Session): void {
    if (session.code) this.codes.delete(session.code);
    for (const other of this.sessions) other.grants.delete(session.id);
    let code: string;
    do { code = randomInt(10 ** PAIR_CODE_LENGTH).toString().padStart(PAIR_CODE_LENGTH, '0'); }
    while (this.codes.has(code) || code === session.code);
    session.code = code; session.codeExpires = this.now() + PAIR_CODE_TTL_MS;
    this.codes.set(code, session);
  }

  private error(session: Session, code: ErrorCode, requestId?: string): ServerMessage {
    const message: ServerMessage = { v: 1, type: 'error', code, message: code,
      ...(requestId ? { requestId } : {}) };
    this.send(session, message);
    return message;
  }

  private receive(session: Session, text: string): void {
    this.sweep();
    if (!this.sessions.has(session)) return;
    if (!take(session.messages, this.now(), LIMITS.messagesPerWindow, LIMITS.messageWindowMs)) {
      this.error(session, 'RATE_LIMITED'); return;
    }
    const message = parseClientMessage(text);
    if (!message) { this.error(session, 'INVALID_MESSAGE'); return; }
    if (message.type === 'hello') {
      if (session.name !== null) { this.error(session, 'FORBIDDEN'); return; }
      session.name = message.name; this.peers.set(session.id, session); this.rotateCode(session);
      this.send(session, { v: 1, type: 'welcome', self: this.summary(session),
        code: session.code, codeExpiresAt: session.codeExpires,
        peers: this.candidates(session), iceServers: this.iceServers });
      this.publishPeers(); return;
    }
    if (session.name === null) {
      this.error(session, 'NOT_READY', 'requestId' in message ? message.requestId : undefined); return;
    }
    if (message.type === 'signal') { this.signal(session, message); return; }
    if (message.type === 'release') { this.release(session, message); return; }
    const fingerprint = createHash('sha256').update(text).digest('hex');
    const prior = session.requests.get(message.requestId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) this.error(session, 'INVALID_MESSAGE', message.requestId);
      else this.send(session, prior.response);
      return;
    }
    if (session.requests.size >= LIMITS.requestRecords) {
      this.error(session, 'RATE_LIMITED', message.requestId); return;
    }
    const response = this.request(session, message);
    session.requests.set(message.requestId, { fingerprint, response, expires: this.now() + LIMITS.requestTtlMs });
  }

  private request(session: Session, message: Exclude<ClientMessage,
    { type: 'hello' | 'signal' | 'release' }>): ServerMessage {
    const fail = (code: ErrorCode) => this.error(session, code, message.requestId);
    const ack = (): ServerMessage => {
      const result: ServerMessage = { v: 1, type: 'ack', requestId: message.requestId };
      this.send(session, result); return result;
    };
    switch (message.type) {
      case 'rename':
        session.name = message.name; this.self(session); this.publishPeers(); return ack();
      case 'refresh-code':
        if (!take(session.refreshes, this.now(), LIMITS.refreshesPerMinute, 60_000)) return fail('RATE_LIMITED');
        this.rotateCode(session); this.self(session); return ack();
      case 'lookup': {
        const source = this.sources.get(session.source)!;
        if (!take(session.lookups, this.now(), LIMITS.lookupsPerMinute, 60_000)
          || !take(source.lookups, this.now(), LIMITS.sourceLookupsPerMinute, 60_000)) return fail('RATE_LIMITED');
        const target = this.codes.get(message.code);
        if (!target || target.codeExpires <= this.now()) return fail('NOT_FOUND');
        if (target === session) return fail('FORBIDDEN');
        session.grants.set(target.id, target.code);
        const result: ServerMessage = { v: 1, type: 'lookup-result', requestId: message.requestId,
          peer: this.summary(target) };
        this.send(session, result); return result;
      }
      case 'offer': {
        const target = this.peers.get(message.to);
        if (!target) return fail('NOT_FOUND');
        if (target === session) return fail('FORBIDDEN');
        const sameGroup = session.group !== null && session.group === target.group;
        const grant = session.grants.get(target.id);
        if (!sameGroup && (!grant || grant !== target.code || target.codeExpires <= this.now())) return fail('FORBIDDEN');
        if (session.invitation || session.pair || target.invitation || target.pair) return fail('BUSY');
        if (session.usedTransfers.has(message.file.id) || target.usedTransfers.has(message.file.id)) return fail('FORBIDDEN');
        if (session.usedTransfers.size >= LIMITS.lifetimeTransfers
          || target.usedTransfers.size >= LIMITS.lifetimeTransfers) return fail('RATE_LIMITED');
        session.usedTransfers.add(message.file.id); target.usedTransfers.add(message.file.id);
        const invitation: Invitation = { id: randomUUID(), sender: session, receiver: target,
          file: Object.freeze({ ...message.file }), expires: this.now() + INVITATION_TTL_MS };
        this.invitations.set(invitation.id, invitation);
        session.invitation = invitation.id; target.invitation = invitation.id;
        const result: ServerMessage = { v: 1, type: 'offered', requestId: message.requestId,
          invitationId: invitation.id, transferId: invitation.file.id, expiresAt: invitation.expires };
        this.send(session, result);
        this.send(target, { v: 1, type: 'incoming', invitationId: invitation.id,
          from: this.summary(session), file: invitation.file, expiresAt: invitation.expires });
        this.publishPeers(); return result;
      }
      case 'accept': {
        const invitation = this.invitations.get(message.invitationId);
        if (!invitation) {
          const pair = session.pair ? this.pairs.get(session.pair) : undefined;
          return pair?.invitationId === message.invitationId && pair.receiver === session ? ack() : fail('NOT_FOUND');
        }
        if (invitation.receiver !== session) return fail('FORBIDDEN');
        const pair: Pair = { id: randomUUID(), invitationId: invitation.id,
          sender: invitation.sender, receiver: invitation.receiver, file: invitation.file,
          released: new Set(), candidates: new Map(), descriptions: new Map() };
        this.invitations.delete(invitation.id); this.pairs.set(pair.id, pair);
        for (const peer of [pair.sender, pair.receiver]) {
          peer.invitation = null; peer.pair = pair.id;
          this.rotateCode(peer); this.self(peer);
        }
        this.paired(pair, pair.sender, 'sender'); this.paired(pair, pair.receiver, 'receiver');
        this.publishPeers(); return ack();
      }
      case 'reject': {
        const invitation = this.invitations.get(message.invitationId);
        if (!invitation) return fail('NOT_FOUND');
        if (invitation.receiver !== session) return fail('FORBIDDEN');
        this.removeInvitation(invitation, 'rejected'); return ack();
      }
      case 'cancel': {
        const invitation = session.invitation ? this.invitations.get(session.invitation) : undefined;
        const pair = session.pair ? this.pairs.get(session.pair) : undefined;
        const task = invitation ?? pair;
        if (!task || task.file.id !== message.transferId) return fail('FORBIDDEN');
        for (const peer of [task.sender, task.receiver]) this.send(peer,
          { v: 1, type: 'cancel-requested', transferId: message.transferId, by: session.id });
        if (invitation) { this.clearInvitation(invitation); this.publishPeers(); }
        // 已配对的取消只传递意图；双方 release 才释放忙状态，不裁决本地保存结果。
        return ack();
      }
    }
  }

  private paired(pair: Pair, session: Session, role: 'sender' | 'receiver'): void {
    this.send(session, { v: 1, type: 'paired', invitationId: pair.invitationId, pairId: pair.id,
      generation: 1, transferId: pair.file.id, file: pair.file,
      peer: this.summary(session === pair.sender ? pair.receiver : pair.sender), role, iceServers: this.iceServers });
  }

  private signal(session: Session, message: Extract<ClientMessage, { type: 'signal' }>): void {
    const pair = this.pairs.get(message.pairId);
    if (!pair || session.pair !== pair.id || (pair.sender !== session && pair.receiver !== session)
      || message.generation !== 1 || pair.released.has(session.id)) { this.error(session, 'FORBIDDEN'); return; }
    const target = pair.sender === session ? pair.receiver : pair.sender;
    if (pair.released.has(target.id)) { this.error(session, 'NOT_READY'); return; }
    const candidate = message.signal.kind === 'candidate';
    const counts = candidate ? pair.candidates : pair.descriptions;
    const count = counts.get(session.id) ?? 0;
    if (count >= (candidate ? LIMITS.candidatesPerPeer : LIMITS.descriptionsPerPeer)) {
      this.error(session, 'RATE_LIMITED'); return;
    }
    if (!candidate && message.signal.kind === 'description'
      && message.signal.description.type !== (session === pair.sender ? 'offer' : 'answer')) {
      this.error(session, 'FORBIDDEN'); return;
    }
    counts.set(session.id, count + 1);
    this.send(target, { v: 1, type: 'signal', pairId: pair.id, generation: 1, from: session.id, signal: message.signal });
  }

  private release(session: Session, message: Extract<ClientMessage, { type: 'release' }>): void {
    const pair = this.pairs.get(message.pairId);
    if (!pair || session.pair !== pair.id || pair.file.id !== message.transferId
      || (pair.sender !== session && pair.receiver !== session)) { this.error(session, 'FORBIDDEN'); return; }
    pair.released.add(session.id);
    if (pair.released.size === 2) { this.clearPair(pair); this.publishPeers(); }
  }

  private clearInvitation(invitation: Invitation): void {
    this.invitations.delete(invitation.id);
    invitation.sender.invitation = null; invitation.receiver.invitation = null;
  }

  private removeInvitation(invitation: Invitation, reason: 'rejected' | 'expired'): void {
    this.clearInvitation(invitation);
    for (const peer of [invitation.sender, invitation.receiver]) this.send(peer,
      { v: 1, type: 'rejected', transferId: invitation.file.id, reason });
    this.publishPeers();
  }

  private clearPair(pair: Pair): void {
    this.pairs.delete(pair.id); pair.sender.pair = null; pair.receiver.pair = null;
  }

  private detach(session: Session): void {
    if (!this.sessions.delete(session)) return;
    const invitation = session.invitation ? this.invitations.get(session.invitation) : undefined;
    const pair = session.pair ? this.pairs.get(session.pair) : undefined;
    this.peers.delete(session.id); this.codes.delete(session.code);
    const source = this.sources.get(session.source);
    if (source) source.connections--;
    for (const other of this.peers.values()) {
      const known = (session.group !== null && session.group === other.group)
        || other.grants.has(session.id) || session.grants.has(other.id)
        || invitation?.sender === other || invitation?.receiver === other
        || pair?.sender === other || pair?.receiver === other;
      other.grants.delete(session.id);
      if (known) this.send(other, { v: 1, type: 'peer-left', peerId: session.id });
    }
    if (invitation) this.clearInvitation(invitation);
    if (pair) this.clearPair(pair);
    session.grants.clear(); session.requests.clear(); session.usedTransfers.clear();
    this.publishPeers();
  }

  private sweep(): void {
    const now = this.now();
    for (const session of [...this.sessions]) {
      if (session.name === null && now >= session.registeredBy) {
        this.detach(session); session.ws.close(1008, '注册超时'); continue;
      }
      for (const [id, record] of session.requests) if (record.expires <= now) session.requests.delete(id);
      for (const [id, code] of session.grants) {
        const target = this.peers.get(id);
        if (!target || target.code !== code || target.codeExpires <= now) session.grants.delete(id);
      }
      if (session.name !== null && session.codeExpires <= now) { this.rotateCode(session); this.self(session); }
    }
    for (const invitation of this.invitations.values()) if (invitation.expires <= now) this.removeInvitation(invitation, 'expired');
    for (const [id, source] of this.sources) {
      if (source.connections === 0 && now - source.lookups.start >= 60_000) this.sources.delete(id);
    }
  }

  private heartbeat(): void {
    for (const session of [...this.sessions]) {
      if (!session.alive) { this.detach(session); session.ws.terminate(); continue; }
      session.alive = false;
      if (session.ws.readyState === WebSocket.OPEN) session.ws.ping();
    }
  }
}
