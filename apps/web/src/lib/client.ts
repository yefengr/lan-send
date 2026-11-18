import {
  isFileMeta, MAX_DEVICE_NAME, MAX_PEERS, parseClientMessage, parseServerMessage,
  type ClientMessage, type FileMeta, type PeerSummary, type ServerMessage,
} from '@lan-send/protocol';
import type { ClientOptions, ClientSnapshot, IncomingOffer, LanSendClientApi, TaskSnapshot } from './types.js';
import { DirectConnection } from './direct-connection.js';
import { FileTransfer } from './file-transfer.js';

type RequestMessage = Extract<ClientMessage, { requestId: string }>;
type RequestBody = RequestMessage extends infer T ? T extends RequestMessage ? Omit<T, 'v' | 'requestId'> : never : never;
type Pending = { resolve: (message: ServerMessage) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
type Authorization = { offer: IncomingOffer; writer: FileSystemWritableFileStream | null; savedName: string; epoch: number };
const terminal = new Set(['completed', 'cancelled', 'rejected', 'failed', 'result-unknown']);
const sameFile = (a: FileMeta, b: FileMeta) => a.id === b.id && a.name === b.name
  && a.size === b.size && a.lastModified === b.lastModified;

export class LanSendClient implements LanSendClientApi {
  private snapshot: ClientSnapshot = {
    connection: 'offline', self: null, code: null, codeExpiresAt: null, peers: [],
    selectedPeerId: null, draft: null, incoming: null, task: null, message: null,
  };
  private readonly listeners = new Set<() => void>();
  private readonly pending = new Map<string, Pending>();
  private socket: WebSocket | null = null;
  private socketEpoch = 0;
  private taskEpoch = 0;
  private disposed = false;
  private name: string;
  private readonly wsUrl: string | undefined;
  private draft: File | null = null;
  private source: File | null = null;
  private invitationId: string | null = null;
  private authorization: Authorization | null = null;
  private transfer: FileTransfer | null = null;
  private rtc: DirectConnection | null = null;
  private selectedExtra: PeerSummary | null = null;
  private incomingTimer: ReturnType<typeof setTimeout> | null = null;
  private registrationTimer: ReturnType<typeof setTimeout> | null = null;
  private progressTimer: ReturnType<typeof setTimeout> | null = null;
  private progress: Partial<TaskSnapshot> = {};
  private lastProgress = 0;
  private speedAt = 0;
  private speedBytes = 0;

  constructor(options: ClientOptions = {}) {
    this.name = options.name ?? '临时电脑';
    this.wsUrl = options.wsUrl;
  }

  getSnapshot = (): ClientSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  connect = (): void => {
    if (this.disposed || this.socket) return;
    const epoch = ++this.socketEpoch;
    this.patch({ connection: 'connecting' });
    try {
      const url = this.wsUrl ?? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
      const socket = new WebSocket(url);
      this.socket = socket;
      this.registrationTimer = setTimeout(() => {
        if (this.currentSocket(socket, epoch) && this.snapshot.connection !== 'online') this.disconnect(socket, epoch);
      }, 10_000);
      socket.onopen = () => {
        if (this.currentSocket(socket, epoch)) {
          try { this.wire({ v: 1, type: 'hello', name: this.name }); }
          catch { this.disconnect(socket, epoch); }
        }
      };
      socket.onmessage = event => {
        if (!this.currentSocket(socket, epoch)) return;
        const message = typeof event.data === 'string' ? parseServerMessage(event.data) : null;
        if (!message) { this.disconnect(socket, epoch); return; }
        try { this.receive(message); } catch { this.disconnect(socket, epoch); }
      };
      socket.onclose = () => this.disconnect(socket, epoch);
      socket.onerror = () => this.disconnect(socket, epoch);
    } catch {
      this.socket = null;
      this.patch({ connection: 'offline', message: { kind: 'error', text: '无法连接协调服务' } });
    }
  };

  setName = async (name: string): Promise<void> => {
    if (!name.trim() || name.length > MAX_DEVICE_NAME || /[\u0000-\u001f\u007f]/u.test(name)) throw new Error('设备名称无效');
    await this.request({ type: 'rename', name });
    this.name = name;
  };
  refreshPairCode = async (): Promise<void> => { await this.request({ type: 'refresh-code' }); };
  pairByCode = async (code: string): Promise<void> => {
    const result = await this.request({ type: 'lookup', code });
    if (result.type !== 'lookup-result' || result.peer.id === this.snapshot.self?.id) throw new Error('没有找到目标设备');
    this.selectedExtra = result.peer;
    this.patch({ selectedPeerId: result.peer.id, peers: this.withExtra(this.snapshot.peers) });
  };
  selectPeer = (id: string): void => {
    if (id === this.snapshot.self?.id || !this.snapshot.peers.some(peer => peer.id === id)) throw new Error('目标设备不可用');
    this.patch({ selectedPeerId: id });
  };
  selectFile = (file: File | null): void => {
    if (this.active()) throw new Error('当前文件尚未结束');
    if (file && !isFileMeta({ id: crypto.randomUUID(), name: file.name, size: file.size, lastModified: file.lastModified })) {
      throw new Error('文件信息不符合要求');
    }
    this.draft = file;
    this.patch({ draft: file ? { name: file.name, size: file.size, lastModified: file.lastModified } : null });
  };

  send = async (): Promise<void> => {
    const peer = this.snapshot.peers.find(item => item.id === this.snapshot.selectedPeerId);
    if (this.disposed || this.snapshot.connection !== 'online') throw new Error('协调服务离线');
    if (this.active() || this.snapshot.incoming || this.authorization) throw new Error('当前正在处理其他文件');
    if (!peer || peer.id === this.snapshot.self?.id || peer.busy) throw new Error('目标设备离线或正忙');
    if (!this.draft) throw new Error('请先选择文件');
    this.resetTask();
    const source = this.draft;
    const file: FileMeta = { id: crypto.randomUUID(), name: source.name, size: source.size, lastModified: source.lastModified };
    this.source = source;
    const epoch = this.taskEpoch;
    this.patch({ task: this.newTask(file, peer, 'send', 'awaiting-accept') });
    try {
      const offered = await this.request({ type: 'offer', to: peer.id, file });
      if (this.taskEpoch !== epoch || offered.type !== 'offered' || offered.transferId !== file.id) {
        throw new Error('邀请已失效');
      }
      this.invitationId = offered.invitationId;
    } catch (error) {
      if (this.taskEpoch === epoch && !this.transfer) this.endTask('failed', '发送邀请失败');
      throw error;
    }
  };

  accept = async (invitationId: string, handle: FileSystemFileHandle): Promise<void> => {
    const offer = this.snapshot.incoming;
    if (!offer || offer.invitationId !== invitationId || this.authorization || this.active()
      || this.snapshot.connection !== 'online' || offer.expiresAt <= Date.now()) throw new Error('邀请已失效');
    if (!isFileMeta({ ...offer.file, name: handle.name })) throw new Error('保存文件名无效');
    this.resetTask();
    const authorization: Authorization = { offer, writer: null, savedName: handle.name, epoch: this.taskEpoch };
    this.authorization = authorization;
    let writer: FileSystemWritableFileStream | null = null;
    try {
      writer = await handle.createWritable();
      if (!this.validAuthorization(authorization)) {
        await writer.abort().catch(() => {});
        writer = null;
        throw new Error('邀请已取消或过期');
      }
      authorization.writer = writer;
      this.invitationId = invitationId;
      this.patch({ task: this.newTask(offer.file, offer.from, 'receive', 'connecting') });
      await this.request({ type: 'accept', invitationId });
      if (this.authorization === authorization && !this.transfer && !this.validAuthorization(authorization)) {
        throw new Error('邀请已失效');
      }
    } catch (error) {
      if (this.authorization === authorization) {
        this.authorization = null;
        if (writer) await writer.abort().catch(() => {});
        if (authorization.epoch === this.taskEpoch && !this.transfer) this.endTask('failed', '未能取得有效保存授权');
      }
      throw error;
    }
  };

  reject = async (invitationId: string): Promise<void> => {
    if (this.snapshot.incoming?.invitationId !== invitationId) throw new Error('邀请已失效');
    this.invalidateInvitation();
    await this.request({ type: 'reject', invitationId });
  };

  cancel = async (): Promise<void> => {
    if (this.transfer) { await this.transfer.cancel(); return; }
    const incoming = this.snapshot.incoming;
    if (incoming) {
      this.invalidateInvitation();
      if (this.snapshot.task) this.endTask('cancelled');
      await this.request({ type: 'reject', invitationId: incoming.invitationId });
      return;
    }
    const task = this.snapshot.task;
    if (!task || terminal.has(task.phase)) return;
    this.source = null;
    this.taskEpoch++;
    this.endTask('cancelled');
    await this.request({ type: 'cancel', transferId: task.transferId });
  };
  queryStatus = (): void => { this.transfer?.query(); };
  clearTask = (): void => {
    if (this.transfer?.committing || (this.snapshot.task && !terminal.has(this.snapshot.task.phase))) return;
    this.resetTask();
    this.patch({ task: null });
  };
  clearMessage = (): void => { this.patch({ message: null }); };

  private receive(message: ServerMessage): void {
    if (message.type === 'welcome') {
      if (this.snapshot.connection !== 'connecting') throw new Error('重复注册');
      if (this.registrationTimer) clearTimeout(this.registrationTimer);
      this.registrationTimer = null;
      this.patch({ connection: 'online', self: message.self, code: message.code,
        codeExpiresAt: message.codeExpiresAt, peers: this.withExtra(message.peers) });
      return;
    }
    if (this.snapshot.connection !== 'online') throw new Error('尚未注册');
    switch (message.type) {
      case 'peers': this.patch({ peers: this.withExtra(message.peers) }); break;
      case 'self': this.patch({ self: message.self, code: message.code, codeExpiresAt: message.codeExpiresAt }); break;
      case 'incoming': this.incoming(message); break;
      case 'offered':
        if (this.snapshot.task?.transferId === message.transferId && this.snapshot.task.direction === 'send') {
          this.invitationId = message.invitationId;
        }
        break;
      case 'paired': this.paired(message); break;
      case 'signal':
        if (this.transfer && message.pairId === this.transfer.pair.pairId
          && message.generation === this.transfer.pair.generation && message.from === this.transfer.pair.peer.id) {
          this.rtc?.receive(message.signal);
        }
        break;
      case 'rejected':
        if (this.snapshot.incoming?.file.id === message.transferId) this.invalidateInvitation();
        if (this.snapshot.task?.transferId === message.transferId && !this.transfer) this.endTask('rejected',
          message.reason === 'expired' ? '邀请已过期' : message.reason === 'busy' ? '对方正忙' : '对方已拒收');
        break;
      case 'cancel-requested':
        if (this.snapshot.incoming?.file.id === message.transferId) this.invalidateInvitation();
        if (this.snapshot.task?.transferId === message.transferId) {
          if (this.transfer) void this.transfer.cancel(true);
          else this.endTask('cancelled');
        }
        break;
      case 'peer-left':
        if (this.snapshot.incoming?.from.id === message.peerId) this.invalidateInvitation();
        if (this.snapshot.task?.peer.id === message.peerId && !this.transfer?.opened && !this.transfer?.committing) {
          this.transfer?.connectionLost();
          if (!this.transfer && !terminal.has(this.snapshot.task.phase)) this.endTask('failed', '对方已离线');
        }
        break;
      case 'error':
        if (!message.requestId) this.patch({ message: { kind: 'error', text: '协调请求未被允许' } });
        break;
      default: break;
    }
    if ('requestId' in message && message.requestId) {
      const pending = this.pending.get(message.requestId);
      if (pending) {
        this.pending.delete(message.requestId);
        clearTimeout(pending.timer);
        if (message.type === 'error') pending.reject(new Error(`协调请求失败：${message.code}`));
        else pending.resolve(message);
      }
    }
  }

  private incoming(message: Extract<ServerMessage, { type: 'incoming' }>): void {
    if (this.active() || this.snapshot.incoming || this.authorization || message.from.id === this.snapshot.self?.id) {
      void this.request({ type: 'reject', invitationId: message.invitationId }).catch(() => {});
      return;
    }
    this.patch({ incoming: { invitationId: message.invitationId, from: message.from, file: message.file, expiresAt: message.expiresAt } });
    this.incomingTimer = setTimeout(() => {
      if (this.snapshot.incoming?.invitationId === message.invitationId) {
        this.invalidateInvitation();
        if (this.snapshot.task && !this.transfer) this.endTask('rejected', '邀请已过期');
      }
    }, Math.max(0, message.expiresAt - Date.now()));
  }

  private paired(pair: Extract<ServerMessage, { type: 'paired' }>): void {
    const task = this.snapshot.task;
    if (this.transfer) {
      if (this.transfer.pair.pairId === pair.pairId) return;
      throw new Error('同时存在多个配对');
    }
    if (!task || terminal.has(task.phase) || task.transferId !== pair.transferId || pair.file.id !== pair.transferId
      || !sameFile(task.file, pair.file) || task.peer.id !== pair.peer.id || this.invitationId !== pair.invitationId
      || pair.generation !== 1 || pair.role !== (task.direction === 'send' ? 'sender' : 'receiver')) {
      throw new Error('配对与本地邀请不匹配');
    }
    const authorization = this.authorization;
    if (pair.role === 'receiver' && (!authorization?.writer || !this.validAuthorization(authorization))) {
      throw new Error('接收授权已失效');
    }
    if (pair.role === 'sender' && (!this.source || this.source.name !== pair.file.name
      || this.source.size !== pair.file.size || this.source.lastModified !== pair.file.lastModified)) {
      throw new Error('源文件身份已变化');
    }
    const epoch = this.taskEpoch;
    this.transfer = new FileTransfer(pair, this.source, authorization?.writer ?? null,
      authorization?.savedName ?? '', patch => {
        if (!this.disposed && epoch === this.taskEpoch) this.taskPatch(patch);
      }, outcome => {
        if (this.snapshot.connection === 'online' && !this.disposed) {
          try { this.wire({ v: 1, type: 'release', pairId: pair.pairId, transferId: pair.transferId, outcome }); } catch {}
        }
      });
    this.source = null;
    if (authorization) authorization.writer = null;
    this.authorization = null;
    if (this.incomingTimer) clearTimeout(this.incomingTimer);
    this.incomingTimer = null;
    this.patch({ incoming: null });
    this.taskPatch({ phase: 'connecting' });
    try {
      this.rtc = new DirectConnection(pair, signal => {
        if (this.disposed || epoch !== this.taskEpoch) return;
        try { this.wire({ v: 1, type: 'signal', pairId: pair.pairId, generation: pair.generation, signal }); }
        catch { if (!this.transfer?.opened) this.transfer?.connectionLost(); }
      }, (channel, frameBytes) => {
        if (this.disposed || epoch !== this.taskEpoch) { channel.close(); return; }
        this.transfer?.attach(channel, frameBytes);
      }, () => { if (epoch === this.taskEpoch) this.transfer?.connectionLost(); });
      void this.rtc.start().catch(() => this.transfer?.connectionLost());
    } catch { this.transfer.connectionLost(); }
  }

  private validAuthorization(value: Authorization): boolean {
    return !this.disposed && this.authorization === value && value.epoch === this.taskEpoch
      && this.snapshot.incoming?.invitationId === value.offer.invitationId
      && sameFile(this.snapshot.incoming.file, value.offer.file) && value.offer.expiresAt > Date.now()
      && this.snapshot.connection === 'online';
  }

  private invalidateInvitation(): void {
    if (this.incomingTimer) clearTimeout(this.incomingTimer);
    this.incomingTimer = null;
    const authorization = this.authorization;
    this.authorization = null;
    if (authorization?.writer) void authorization.writer.abort().catch(() => {});
    this.patch({ incoming: null });
  }

  private request(body: RequestBody): Promise<ServerMessage> {
    if (this.disposed || this.snapshot.connection !== 'online' || this.pending.size >= 32) {
      return Promise.reject(new Error('协调服务不可用或请求过多'));
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('协调请求超时'));
      }, 15_000);
      this.pending.set(requestId, { resolve, reject, timer });
      try { this.wire({ v: 1, requestId, ...body }); }
      catch {
        clearTimeout(timer); this.pending.delete(requestId); reject(new Error('协调服务不可用'));
      }
    });
  }

  private wire(message: ClientMessage): void {
    const text = JSON.stringify(message);
    if (!parseClientMessage(text) || !this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('协调连接不可用');
    this.socket.send(text);
  }

  private disconnect(socket: WebSocket, epoch: number): void {
    if (!this.currentSocket(socket, epoch)) return;
    this.socket = null;
    this.socketEpoch++;
    socket.onopen = null; socket.onmessage = null; socket.onclose = null; socket.onerror = null;
    socket.close();
    if (this.registrationTimer) clearTimeout(this.registrationTimer);
    this.registrationTimer = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('协调连接已断开')); }
    this.pending.clear();
    this.invalidateInvitation();
    this.selectedExtra = null;
    this.patch({ connection: 'offline', code: null, codeExpiresAt: null, peers: [], selectedPeerId: null });
    if (this.transfer && !this.transfer.opened && !this.transfer.committing) this.transfer.connectionLost();
    else if (!this.transfer && this.active()) this.endTask('failed', '协调连接已断开');
  }

  private withExtra(peers: readonly PeerSummary[]): PeerSummary[] {
    const list = peers.filter(peer => peer.id !== this.snapshot.self?.id).slice(0, MAX_PEERS);
    if (this.selectedExtra && !list.some(peer => peer.id === this.selectedExtra!.id)) {
      if (list.length >= MAX_PEERS) list.pop();
      list.push(this.selectedExtra);
    }
    return list;
  }

  private newTask(file: FileMeta, peer: PeerSummary, direction: 'send' | 'receive', phase: TaskSnapshot['phase']): TaskSnapshot {
    this.speedAt = performance.now(); this.speedBytes = 0;
    return { transferId: file.id, direction, peer, file, phase, confirmedBytes: 0, bytesPerSecond: 0,
      phaseElapsedMs: 0, savedName: null, error: null, canCancel: true, canQuery: false };
  }
  private active(): boolean { return !!this.snapshot.task && !terminal.has(this.snapshot.task.phase); }
  private endTask(phase: TaskSnapshot['phase'], error: string | null = null): void {
    this.source = null;
    this.taskPatch({ phase, error, canCancel: false, canQuery: false });
  }
  private taskPatch(patch: Partial<TaskSnapshot>): void {
    if (!this.snapshot.task || this.disposed) return;
    const immediate = patch.phase !== undefined || patch.savedName !== undefined || patch.error !== undefined;
    this.progress = { ...this.progress, ...patch };
    if (immediate || performance.now() - this.lastProgress >= 250) this.flushProgress();
    else if (!this.progressTimer) this.progressTimer = setTimeout(() => this.flushProgress(), 250 - (performance.now() - this.lastProgress));
  }
  private flushProgress(): void {
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.progressTimer = null;
    if (!this.snapshot.task || this.disposed) return;
    const task = { ...this.snapshot.task, ...this.progress };
    this.progress = {};
    const now = performance.now(), elapsed = now - this.speedAt;
    if (elapsed >= 250) {
      task.bytesPerSecond = (task.confirmedBytes - this.speedBytes) * 1000 / elapsed;
      this.speedAt = now; this.speedBytes = task.confirmedBytes;
    }
    this.lastProgress = now;
    this.patch({ task });
  }
  private patch(patch: Partial<ClientSnapshot>): void {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  private currentSocket(socket: WebSocket, epoch: number): boolean {
    return !this.disposed && this.socket === socket && this.socketEpoch === epoch;
  }
  private resetTask(): void {
    this.taskEpoch++;
    this.transfer?.dispose(); this.transfer = null;
    this.rtc?.stop(); this.rtc = null;
    this.source = null; this.invitationId = null;
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.progressTimer = null; this.progress = {};
  }

  dispose = (): void => {
    if (this.disposed) return;
    if (this.socket) this.disconnect(this.socket, this.socketEpoch);
    this.invalidateInvitation();
    this.resetTask();
    this.draft = null;
    this.patch({ connection: 'offline', incoming: null, draft: null });
    this.disposed = true;
    this.listeners.clear();
  };
}
