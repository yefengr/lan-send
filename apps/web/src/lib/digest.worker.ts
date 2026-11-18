import { digestChunk, CHUNK_BYTES } from '@lan-send/protocol';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ id: number; bytes: ArrayBuffer }>) => void) | null;
  postMessage: (value: unknown, transfer: Transferable[]) => void;
};

scope.onmessage = event => {
  const { id, bytes } = event.data;
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength > CHUNK_BYTES) {
    scope.postMessage({ id, error: true }, []);
    return;
  }
  void digestChunk(new Uint8Array(bytes)).then(
    hash => scope.postMessage({ id, hash, bytes }, [bytes]),
    () => scope.postMessage({ id, error: true }, []),
  );
};
