import {
  advanceChain, CHUNK_BYTES, decodeDataFrame, type DataControl, type FileMeta,
} from '@lan-send/protocol';
import { BlockHasher } from './hasher.js';

type Begin = Extract<DataControl, { type: 'chunk-begin' }>;
export type Completion = { totalBytes: number; chain: string; savedName: string };
export class ReceiveSink {
  offset = 0;
  chunkCount = 0;
  chain: string;
  closing = false;
  completion: Completion | null = null;
  private epoch = 0;
  private active = true;
  private block: { begin: Begin; bytes: Uint8Array<ArrayBuffer>; filled: number } | null = null;
  private lastAck: Extract<DataControl, { type: 'chunk-ack' }> | null = null;
  private closePromise: Promise<Completion> | null = null;

  readonly file: FileMeta;
  readonly generation: number;
  readonly metaDigest: string;
  private readonly writer: FileSystemWritableFileStream;
  private readonly savedName: string;
  private readonly hasher: Pick<BlockHasher, 'hash' | 'dispose'>;

  constructor(
    file: FileMeta, generation: number, metaDigest: string, chain: string,
    writer: FileSystemWritableFileStream, savedName: string, hasher: Pick<BlockHasher, 'hash' | 'dispose'>,
  ) {
    this.file = file;
    this.generation = generation;
    this.metaDigest = metaDigest;
    this.chain = chain;
    this.writer = writer;
    this.savedName = savedName;
    this.hasher = hasher;
  }

  begin(message: Begin): void {
    if (!this.active || this.closing || this.block || message.index !== this.chunkCount
      || message.offset !== this.offset || message.length !== Math.min(CHUNK_BYTES, this.file.size - this.offset)
      || message.length <= 0) throw new Error('块顺序无效');
    this.block = { begin: message, bytes: new Uint8Array(message.length), filled: 0 };
  }

  frame(bytes: ArrayBuffer, frameBytes: number): void {
    if (bytes.byteLength > frameBytes) throw new Error('帧超过协商限制');
    const frame = decodeDataFrame(bytes), block = this.block;
    if (!this.active || this.closing || !block || frame.transferId !== this.file.id
      || frame.generation !== this.generation || frame.chunkIndex !== block.begin.index
      || frame.chunkLength !== block.begin.length || frame.chunkOffset !== block.filled
      || frame.offset !== this.offset + block.filled) throw new Error('文件帧与授权不匹配');
    block.bytes.set(frame.payload, block.filled);
    block.filled += frame.payload.byteLength;
  }

  async end(index: number): Promise<Extract<DataControl, { type: 'chunk-ack' }> | null> {
    if (!this.block && this.lastAck?.index === index) return this.lastAck;
    const block = this.block, epoch = this.epoch;
    if (!this.active || !block || block.begin.index !== index || block.filled !== block.begin.length) {
      throw new Error('文件块不完整');
    }
    const result = await this.hasher.hash(block.bytes);
    if (!this.current(epoch)) return null;
    if (result.hash !== block.begin.hash) throw new Error('文件块校验失败');
    const chain = await advanceChain(this.chain, result.hash, index, block.begin.length);
    if (!this.current(epoch)) return null;
    await this.writer.write(result.bytes);
    if (!this.current(epoch)) return null;
    this.chain = chain;
    this.offset += block.begin.length;
    this.chunkCount++;
    this.block = null;
    this.lastAck = {
      v: 1, type: 'chunk-ack', transferId: this.file.id, generation: this.generation,
      index, offset: this.offset, chain, credit: 1,
    };
    return this.lastAck;
  }

  finish(message: Extract<DataControl, { type: 'finish' }>, saving: () => void): Promise<Completion> {
    if (message.totalBytes !== this.file.size || message.totalBytes !== this.offset
      || message.chunkCount !== this.chunkCount || message.chain !== this.chain
      || message.metaDigest !== this.metaDigest || this.block) {
      return Promise.reject(new Error('最终校验失败'));
    }
    if (this.completion) return Promise.resolve(this.completion);
    if (this.closePromise) return this.closePromise;
    if (!this.active) return Promise.reject(new Error('保存已取消'));
    // 从此刻开始提交结果优先；取消、dispose、连接断开均不再 abort。
    this.closing = true;
    saving();
    this.closePromise = this.writer.close().then(() => {
      this.completion = { totalBytes: this.offset, chain: this.chain, savedName: this.savedName };
      this.active = false;
      this.hasher.dispose();
      return this.completion;
    }).catch(async () => {
      this.active = false;
      this.hasher.dispose();
      try { await this.writer.abort(); } catch { /* close 失败的流可能已自动进入错误态。 */ }
      throw new Error('文件保存失败');
    }).finally(() => { this.closing = false; });
    return this.closePromise;
  }

  async cancel(): Promise<boolean> {
    if (this.closing || this.completion) return false;
    if (!this.active) return true;
    this.active = false;
    this.epoch++;
    this.block = null;
    this.hasher.dispose();
    try { await this.writer.abort(); } catch { /* 已中止的流无需再提交。 */ }
    return true;
  }

  private current(epoch: number): boolean { return this.active && this.epoch === epoch && !this.closing; }
}
