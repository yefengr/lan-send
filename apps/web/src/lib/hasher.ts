import { CHUNK_BYTES } from '@lan-send/protocol';

interface Pending {
  resolve: (result: { hash: string; bytes: Uint8Array<ArrayBuffer> }) => void;
  reject: (error: Error) => void;
}

export class BlockHasher {
  private worker: Worker | null = null;
  private pending: Pending | null = null;
  private sequence = 0;
  private stopped = false;

  hash(bytes: Uint8Array<ArrayBuffer>): Promise<{ hash: string; bytes: Uint8Array<ArrayBuffer> }> {
    if (this.stopped || this.pending || bytes.byteLength > CHUNK_BYTES) {
      return Promise.reject(new Error('摘要任务不可用'));
    }
    if (!this.worker) {
      this.worker = new Worker(new URL('./digest.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<{ id: number; hash?: string; bytes?: ArrayBuffer }>) => {
        if (!this.pending || event.data.id !== this.sequence) return;
        const pending = this.pending;
        this.pending = null;
        if (event.data.hash && event.data.bytes instanceof ArrayBuffer) {
          pending.resolve({ hash: event.data.hash, bytes: new Uint8Array(event.data.bytes) });
        } else pending.reject(new Error('块摘要失败'));
      };
      this.worker.onerror = () => this.dispose();
      this.worker.onmessageerror = () => this.dispose();
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      try { this.worker!.postMessage({ id, bytes: bytes.buffer }, [bytes.buffer]); }
      catch { this.pending = null; reject(new Error('块摘要失败')); }
    });
  }

  dispose(): void {
    this.stopped = true;
    this.worker?.terminate();
    this.worker = null;
    this.pending?.reject(new Error('摘要任务已结束'));
    this.pending = null;
  }
}
