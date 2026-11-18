import {
  advanceChain, CHUNK_BYTES, encodeDataFrame, fileManifestDigest, FRAME_HEADER_BYTES, initialChain,
  MAX_CONTROL_BYTES, parseDataControl, type DataControl, type ErrorCode, type ServerMessage,
} from '@lan-send/protocol';
import type { TaskPhase, TaskSnapshot } from './types.js';
import { BlockHasher } from './hasher.js';
import { BoundedInbox, ChannelWriter } from './flow.js';
import { ReceiveSink, type Completion } from './receive-sink.js';

type Pair = Extract<ServerMessage, { type: 'paired' }>;
type ControlBody = DataControl extends infer T ? T extends DataControl ? Omit<T, 'v' | 'transferId' | 'generation'> : never : never;
const finalPhases = new Set<TaskPhase>(['completed', 'cancelled', 'failed', 'rejected', 'result-unknown']);

export class FileTransfer {
  private channel: RTCDataChannel | null = null;
  private out: ChannelWriter | null = null;
  private inbox: BoundedInbox | null = null;
  private hasher = new BlockHasher();
  private sink: ReceiveSink | null = null;
  private source: File | null;
  private writer: FileSystemWritableFileStream | null;
  private metaDigest = '';
  private chain = '';
  private frameBytes = 0;
  private remoteHello = false;
  private remoteReady = false;
  private localReady = false;
  private initialized = false;
  private epoch = 0;
  private disposed = false;
  private halted = false;
  private phase: TaskPhase = 'connecting';
  private phaseStart = performance.now();
  private remoteElapsed = 0;
  private offset = 0;
  private index = 0;
  private flight: { index: number; offset: number; chain: string } | null = null;
  private finishSent = false;
  private busy = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastReport = 0;

  readonly pair: Pair;
  private readonly savedName: string;
  private readonly update: (patch: Partial<TaskSnapshot>) => void;
  private readonly release: (outcome: 'completed' | 'cancelled' | 'failed' | 'unknown') => void;

  constructor(
    pair: Pair,
    source: File | null,
    writer: FileSystemWritableFileStream | null,
    savedName: string,
    update: (patch: Partial<TaskSnapshot>) => void,
    release: (outcome: 'completed' | 'cancelled' | 'failed' | 'unknown') => void,
  ) {
    this.pair = pair;
    this.source = source;
    this.writer = writer;
    this.savedName = savedName;
    this.update = update;
    this.release = release;
  }

  get committing(): boolean { return this.sink?.closing === true && !this.sink.completion; }
  get opened(): boolean { return this.channel?.readyState === 'open'; }

  attach(channel: RTCDataChannel, frameBytes: number): void {
    if (this.disposed || this.channel) { channel.close(); return; }
    this.channel = channel;
    this.frameBytes = frameBytes;
    this.out = new ChannelWriter(channel);
    const initialize = this.initialize();
    this.inbox = new BoundedInbox(async data => {
      await initialize;
      if (!this.disposed) await this.receive(data);
    }, () => this.fail('INTEGRITY_FAILED'));
    channel.onmessage = event => {
      // 取消意图不能排在正在等待 Worker / write 的队列尾部。
      const message = typeof event.data === 'string' ? parseDataControl(event.data) : null;
      if (message?.type === 'cancel' && message.transferId === this.pair.transferId
        && message.generation === this.pair.generation && this.remoteHello) {
        void this.cancel(true);
      } else this.inbox?.push(event.data);
    };
    this.timer = setInterval(() => this.tick(), 250);
    void initialize.catch(() => this.fail('INTERNAL'));
  }

  private async initialize(): Promise<void> {
    const epoch = this.epoch;
    this.metaDigest = await fileManifestDigest(this.pair.file);
    const chain = await initialChain(this.metaDigest);
    if (!this.current(epoch)) return;
    this.chain = chain;
    if (this.pair.role === 'receiver') {
      if (!this.writer) throw new Error('尚未授权保存');
      this.sink = new ReceiveSink(this.pair.file, this.pair.generation, this.metaDigest,
        chain, this.writer, this.savedName, this.hasher);
      this.writer = null;
    }
    this.initialized = true;
    await this.control({ type: 'hello', pairId: this.pair.pairId, metaDigest: this.metaDigest,
      chunkBytes: CHUNK_BYTES, frameBytes: this.frameBytes, windowChunks: 1 });
  }

  private async receive(data: string | ArrayBuffer): Promise<void> {
    if (!this.initialized) return;
    if (data instanceof ArrayBuffer) {
      if (this.halted || !this.remoteHello || !this.remoteReady || !this.localReady || !this.sink) {
        throw new Error('文件数据尚未授权');
      }
      this.sink.frame(data, this.frameBytes);
      return;
    }
    const message = parseDataControl(data);
    if (!message || message.transferId !== this.pair.transferId || message.generation !== this.pair.generation) {
      throw new Error('传输身份不匹配');
    }
    if (message.type === 'hello') {
      if (this.remoteHello || message.pairId !== this.pair.pairId || message.metaDigest !== this.metaDigest) {
        throw new Error('文件清单不匹配');
      }
      this.frameBytes = Math.min(this.frameBytes, message.frameBytes);
      if (this.frameBytes <= FRAME_HEADER_BYTES) throw new Error('帧大小不可用');
      this.remoteHello = true;
      await this.control({ type: 'ready', offset: 0, chain: this.chain, credit: this.sink ? 1 : 0 });
      this.localReady = true;
      return;
    }
    if (!this.remoteHello) throw new Error('缺少通道握手');
    if (message.type === 'ready') {
      if (this.remoteReady || message.offset !== 0 || message.chain !== this.chain
        || message.credit !== (this.pair.role === 'sender' ? 1 : 0)) throw new Error('起始位置不匹配');
      this.remoteReady = true;
      this.setPhase('transferring');
      if (this.pair.role === 'sender') this.next();
      return;
    }
    if (message.type === 'complete') { this.complete(message); return; }
    if (message.type === 'status-request') { this.report(); return; }
    if (message.type === 'finish' && this.sink) { this.finish(message); return; }
    if (message.type === 'cancel') { await this.cancel(true); return; }
    if (message.type === 'complete-ack') return;
    if (message.type === 'cancelled') {
      if (this.finishSent) this.unknown();
      else await this.cancel(true);
      return;
    }
    if (message.type === 'error') {
      if (this.finishSent && message.code !== 'SAVE_FAILED') this.unknown();
      else this.fail(message.code, false);
      return;
    }
    if (this.halted || !this.remoteReady || !this.localReady) throw new Error('任务不接受正文');
    switch (message.type) {
      case 'chunk-begin':
        if (!this.sink) throw new Error('角色不匹配');
        this.sink.begin(message);
        break;
      case 'chunk-end': {
        if (!this.sink) throw new Error('角色不匹配');
        const epoch = this.epoch;
        let ack: Awaited<ReturnType<ReceiveSink['end']>>;
        try { ack = await this.sink.end(message.index); }
        catch (error) {
          if (error instanceof DOMException) { this.fail('SAVE_FAILED'); return; }
          throw error;
        }
        if (!ack || !this.current(epoch)) return;
        this.offset = ack.offset;
        this.chain = ack.chain;
        this.update({ confirmedBytes: this.offset });
        await this.out!.send(JSON.stringify(ack));
        break;
      }
      case 'chunk-ack':
        if (this.pair.role !== 'sender') throw new Error('角色不匹配');
        if (!this.flight) {
          if (message.index === this.index - 1 && message.offset === this.offset && message.chain === this.chain) return;
          throw new Error('未预期的确认');
        }
        if (message.index !== this.flight.index || message.offset !== this.flight.offset
          || message.chain !== this.flight.chain || message.credit !== 1) throw new Error('块确认不匹配');
        this.offset = message.offset;
        this.chain = message.chain;
        this.index++;
        this.flight = null;
        this.update({ confirmedBytes: this.offset });
        this.next();
        break;
      case 'status':
        if (this.pair.role !== 'sender' || message.offset < this.offset || message.offset > this.pair.file.size) {
          throw new Error('状态位置无效');
        }
        if (this.finishSent && message.phase !== 'transferring') {
          this.remoteElapsed = message.elapsedMs;
          this.setPhase(message.phase, true);
        }
        break;
      default: throw new Error('未预期的控制消息');
    }
  }

  private next(): void {
    if (this.busy || this.flight || this.halted || this.disposed) return;
    this.busy = true;
    const epoch = this.epoch;
    void this.sendNext(epoch).catch(() => {
      if (this.current(epoch)) this.fail('INTERNAL');
    }).finally(() => {
      this.busy = false;
      // 极快 ACK 可能在 chunk-end 的 send Promise 收尾前到达。
      if (this.current(epoch) && !this.flight && !this.finishSent && this.remoteReady) this.next();
    });
  }

  private async sendNext(epoch: number): Promise<void> {
    if (this.offset === this.pair.file.size) {
      this.finishSent = true;
      this.source = null;
      this.hasher.dispose();
      this.setPhase('awaiting-confirmation');
      await this.control({ type: 'finish', totalBytes: this.offset, chunkCount: this.index,
        chain: this.chain, metaDigest: this.metaDigest });
      return;
    }
    if (!this.source) throw new Error('源文件不可用');
    const length = Math.min(CHUNK_BYTES, this.pair.file.size - this.offset);
    const bytes = await this.source.slice(this.offset, this.offset + length).arrayBuffer();
    if (!this.current(epoch)) return;
    if (bytes.byteLength !== length) throw new Error('源文件读取失败');
    const block = await this.hasher.hash(new Uint8Array(bytes));
    if (!this.current(epoch)) return;
    const chain = await advanceChain(this.chain, block.hash, this.index, length);
    if (!this.current(epoch)) return;
    this.flight = { index: this.index, offset: this.offset + length, chain };
    await this.control({ type: 'chunk-begin', index: this.index, offset: this.offset, length, hash: block.hash });
    for (let chunkOffset = 0; chunkOffset < length; chunkOffset += this.frameBytes - FRAME_HEADER_BYTES) {
      if (!this.current(epoch)) return;
      await this.out!.send(encodeDataFrame({ transferId: this.pair.transferId,
        generation: this.pair.generation, chunkIndex: this.index, chunkLength: length, chunkOffset,
        offset: this.offset + chunkOffset,
        payload: block.bytes.subarray(chunkOffset, Math.min(length, chunkOffset + this.frameBytes - FRAME_HEADER_BYTES)),
      }));
    }
    if (this.current(epoch)) await this.control({ type: 'chunk-end', index: this.index });
  }

  private finish(message: Extract<DataControl, { type: 'finish' }>): void {
    if (!this.sink || !this.remoteReady || !this.localReady) throw new Error('尚未就绪');
    if (message.totalBytes !== this.pair.file.size || message.totalBytes !== this.sink.offset
      || message.chunkCount !== this.sink.chunkCount || message.chain !== this.sink.chain
      || message.metaDigest !== this.metaDigest) throw new Error('最终校验失败');
    if (this.sink.completion) { this.sendCompletion(this.sink.completion); return; }
    if (this.sink.closing) { this.report(); return; }
    this.setPhase('verifying');
    this.report();
    void this.sink.finish(message, () => {
      this.setPhase('saving');
      this.report();
    }).then(completion => {
      this.halted = true;
      this.source = null;
      if (!this.disposed) {
        this.setPhase('completed');
        this.update({ savedName: completion.savedName, confirmedBytes: completion.totalBytes });
        this.sendCompletion(completion);
        this.release('completed');
      }
      this.stopTimer();
    }).catch(() => this.fail('SAVE_FAILED'));
  }

  private complete(message: Extract<DataControl, { type: 'complete' }>): void {
    if (this.pair.role !== 'sender' || !this.finishSent || message.totalBytes !== this.pair.file.size
      || message.chain !== this.chain) throw new Error('完成证明不匹配');
    this.halted = true;
    this.setPhase('completed');
    this.update({ savedName: message.savedName, confirmedBytes: message.totalBytes, canQuery: false, error: null });
    void this.control({ type: 'complete-ack' }).catch(() => {});
    this.release('completed');
    this.stopTimer();
  }

  async cancel(remote = false): Promise<void> {
    if (this.sink?.completion) { this.sendCompletion(this.sink.completion); return; }
    if (this.sink?.closing) { this.report(); return; }
    if (this.phase === 'completed' || this.phase === 'cancelled') return;
    if (this.finishSent) { this.unknown(); return; }
    this.halted = true;
    this.epoch++;
    this.source = null;
    this.hasher.dispose();
    this.setPhase('cancelling');
    if (this.sink) await this.sink.cancel();
    else if (this.writer) { try { await this.writer.abort(); } catch {} this.writer = null; }
    if (this.disposed) return;
    try { await this.control({ type: remote ? 'cancelled' : 'cancel' }); } catch {}
    this.setPhase('cancelled');
    this.release('cancelled');
    this.stopTimer();
  }

  connectionLost(): void {
    this.out?.stop();
    this.inbox?.stop();
    if (this.sink?.closing || this.sink?.completion || finalPhases.has(this.phase)) return;
    if (this.finishSent) this.unknown();
    else this.fail('CONNECTION_FAILED', false);
  }

  query(): void {
    if (this.pair.role === 'sender' && this.finishSent && this.opened) {
      void this.control({ type: 'status-request' }).catch(() => this.unknown());
    }
  }

  private unknown(): void {
    this.halted = true;
    this.setPhase('result-unknown');
    this.update({ error: '对端保存结果未确认', canQuery: this.opened });
    this.release('unknown');
    this.stopTimer();
  }

  private fail(code: ErrorCode, notify = true): void {
    if (this.disposed || this.phase === 'completed' || this.sink?.completion) return;
    if (this.sink?.closing && code !== 'SAVE_FAILED') return;
    if (this.finishSent && code !== 'SAVE_FAILED') { this.unknown(); return; }
    this.halted = true;
    this.epoch++;
    this.source = null;
    this.hasher.dispose();
    if (this.sink) void this.sink.cancel();
    else if (this.writer) { void this.writer.abort().catch(() => {}); this.writer = null; }
    this.setPhase('failed');
    this.update({ error: code === 'SAVE_FAILED' ? '文件写入或保存失败' : code === 'INTEGRITY_FAILED'
      ? '文件数据校验失败' : code === 'CONNECTION_FAILED' ? '无法建立或维持直连' : '文件读取或传输失败' });
    if (notify) void this.control({ type: 'error', code, message: '文件传输已终止' }).catch(() => {});
    this.release('failed');
    this.stopTimer();
    this.inbox?.stop();
  }

  private control(body: ControlBody): Promise<void> {
    if (!this.out || this.disposed) return Promise.reject(new Error('文件通道不可用'));
    const text = JSON.stringify({ v: 1, transferId: this.pair.transferId, generation: this.pair.generation, ...body });
    if (new TextEncoder().encode(text).byteLength > MAX_CONTROL_BYTES) return Promise.reject(new Error('控制消息过长'));
    return this.out.send(text);
  }

  private sendCompletion(completion: Completion): void {
    void this.control({ type: 'complete', ...completion }).catch(() => {});
  }

  private report(): void {
    if (this.sink?.completion) { this.sendCompletion(this.sink.completion); return; }
    if (!this.sink || this.disposed || !this.initialized) return;
    const phase = this.phase === 'saving' ? 'saving' : this.phase === 'verifying' ? 'verifying' : 'transferring';
    void this.control({ type: 'status', phase, offset: this.sink.offset,
      elapsedMs: Math.max(0, Math.floor(performance.now() - this.phaseStart)) }).catch(() => {});
  }

  private setPhase(phase: TaskPhase, reset = false): void {
    if (this.disposed) return;
    if (phase !== this.phase || reset) this.phaseStart = performance.now();
    this.phase = phase;
    this.update({ phase, phaseElapsedMs: reset ? this.remoteElapsed : 0,
      canCancel: !finalPhases.has(phase) && phase !== 'saving' && phase !== 'awaiting-confirmation',
      canQuery: this.pair.role === 'sender' && this.finishSent && this.opened && phase !== 'completed' });
  }

  private tick(): void {
    if (this.disposed || finalPhases.has(this.phase)) return;
    const now = performance.now();
    this.update({ phaseElapsedMs: Math.floor(now - this.phaseStart) + (this.pair.role === 'sender' ? this.remoteElapsed : 0) });
    if (now - this.lastReport >= 1000) {
      this.lastReport = now;
      if (this.sink && this.remoteReady && this.localReady) this.report();
      else if (this.pair.role === 'sender' && this.finishSent) this.query();
    }
  }

  private current(epoch: number): boolean { return !this.disposed && !this.halted && this.epoch === epoch; }
  private stopTimer(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch++;
    this.source = null;
    this.stopTimer();
    this.inbox?.stop(); this.out?.stop();
    this.hasher.dispose();
    if (this.sink) void this.sink.cancel();
    else if (this.writer) { void this.writer.abort().catch(() => {}); this.writer = null; }
    if (this.channel) this.channel.onmessage = null;
  }
}
