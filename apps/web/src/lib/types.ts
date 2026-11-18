import type { FileMeta, PeerSummary } from '@lan-send/protocol';

export type TaskPhase =
  | 'awaiting-accept' | 'connecting' | 'transferring' | 'verifying' | 'saving'
  | 'awaiting-confirmation' | 'cancelling' | 'completed' | 'cancelled' | 'rejected'
  | 'failed' | 'result-unknown';

export interface IncomingOffer {
  invitationId: string;
  from: PeerSummary;
  file: FileMeta;
  expiresAt: number;
}

export interface TaskSnapshot {
  transferId: string;
  direction: 'send' | 'receive';
  peer: PeerSummary;
  file: FileMeta;
  phase: TaskPhase;
  confirmedBytes: number;
  bytesPerSecond: number;
  phaseElapsedMs: number;
  savedName: string | null;
  error: string | null;
  canCancel: boolean;
  canQuery: boolean;
}

export interface ClientSnapshot {
  connection: 'connecting' | 'online' | 'offline';
  self: PeerSummary | null;
  code: string | null;
  codeExpiresAt: number | null;
  peers: readonly PeerSummary[];
  selectedPeerId: string | null;
  draft: Omit<FileMeta, 'id'> | null;
  incoming: IncomingOffer | null;
  task: TaskSnapshot | null;
  message: { kind: 'info' | 'error'; text: string } | null;
}

export interface ClientOptions { wsUrl?: string; name?: string }

export interface LanSendClientApi {
  getSnapshot: () => ClientSnapshot;
  subscribe: (listener: () => void) => () => void;
  connect: () => void;
  dispose: () => void;
  setName: (name: string) => Promise<void>;
  refreshPairCode: () => Promise<void>;
  pairByCode: (code: string) => Promise<void>;
  selectPeer: (id: string) => void;
  selectFile: (file: File | null) => void;
  send: () => Promise<void>;
  accept: (invitationId: string, handle: FileSystemFileHandle) => Promise<void>;
  reject: (invitationId: string) => Promise<void>;
  cancel: () => Promise<void>;
  queryStatus: () => void;
  clearTask: () => void;
  clearMessage: () => void;
}
