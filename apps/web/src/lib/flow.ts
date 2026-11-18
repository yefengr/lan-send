import {
  CHANNEL_HIGH_WATER, CHANNEL_LOW_WATER, CHUNK_BYTES, MAX_CONTROL_BYTES,
  MAX_PENDING_BYTES, MAX_PENDING_EVENTS,
} from '@lan-send/protocol';

// 事件队列预算额外预留一个独立组块，不能只相信发送方 credit。
export class BoundedInbox {
  private count = 0;
  private bytes = 0;
  private tail: Promise<void> = Promise.resolve();
  private stopped = false;

  private readonly consume: (data: string | ArrayBuffer) => Promise<void>;
  private readonly failure: () => void;

  constructor(consume: (data: string | ArrayBuffer) => Promise<void>, failure: () => void) {
    this.consume = consume;
    this.failure = failure;
  }

  push(data: unknown): void {
    if (this.stopped) return;
    const size = typeof data === 'string' ? new TextEncoder().encode(data).byteLength
      : data instanceof ArrayBuffer ? data.byteLength : -1;
    if (size < 0 || (typeof data === 'string' && size > MAX_CONTROL_BYTES)
      || this.count + 1 > MAX_PENDING_EVENTS || this.bytes + size > MAX_PENDING_BYTES - CHUNK_BYTES) {
      this.stopped = true;
      this.failure();
      return;
    }
    this.count++;
    this.bytes += size;
    this.tail = this.tail.then(async () => {
      if (!this.stopped) await this.consume(data as string | ArrayBuffer);
    }).catch(() => {
      if (!this.stopped) { this.stopped = true; this.failure(); }
    }).finally(() => { this.count--; this.bytes -= size; });
  }

  stop(): void { this.stopped = true; }
}

export class ChannelWriter {
  private stopped = false;
  private readonly waiters = new Set<() => void>();

  private readonly channel: RTCDataChannel;

  constructor(channel: RTCDataChannel) {
    this.channel = channel;
    channel.bufferedAmountLowThreshold = CHANNEL_LOW_WATER;
  }

  async send(data: string | ArrayBuffer): Promise<void> {
    const size = typeof data === 'string' ? new TextEncoder().encode(data).byteLength : data.byteLength;
    if (this.stopped || this.channel.readyState !== 'open') throw new Error('文件通道已关闭');
    if (this.channel.bufferedAmount + size > CHANNEL_HIGH_WATER) await this.drain();
    if (this.stopped || this.channel.readyState !== 'open') throw new Error('文件通道已关闭');
    this.channel.send(data as ArrayBuffer);
  }

  private drain(): Promise<void> {
    return new Promise((resolve, reject) => {
      const finish = () => {
        cleanup();
        if (this.stopped || this.channel.readyState !== 'open') reject(new Error('文件通道已关闭'));
        else resolve();
      };
      const low = () => { if (this.channel.bufferedAmount <= CHANNEL_LOW_WATER) finish(); };
      const cleanup = () => {
        this.waiters.delete(finish);
        this.channel.removeEventListener('bufferedamountlow', low);
        this.channel.removeEventListener('close', finish);
        this.channel.removeEventListener('error', finish);
      };
      this.waiters.add(finish);
      this.channel.addEventListener('bufferedamountlow', low);
      this.channel.addEventListener('close', finish);
      this.channel.addEventListener('error', finish);
      low();
    });
  }

  stop(): void {
    this.stopped = true;
    for (const finish of [...this.waiters]) finish();
  }
}
