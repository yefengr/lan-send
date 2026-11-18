import type { ErrorCode } from './constants.js';

export interface FileMeta {
  id: string;
  name: string;
  size: number;
  lastModified: number;
}

export interface PeerSummary {
  id: string;
  name: string;
  busy: boolean;
}

export interface IceServer {
  urls: string[];
}

export interface IceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
}

export type Signal =
  | { kind: 'description'; description: { type: 'offer' | 'answer'; sdp: string } }
  | { kind: 'candidate'; candidate: IceCandidate | null };

interface WireMessage { v: 1 }
interface Request extends WireMessage { requestId: string }
export type Outcome = 'completed' | 'cancelled' | 'failed' | 'unknown';

export type ClientMessage =
  | (WireMessage & { type: 'hello'; name: string })
  | (Request & { type: 'rename'; name: string })
  | (Request & { type: 'refresh-code' })
  | (Request & { type: 'lookup'; code: string })
  | (Request & { type: 'offer'; to: string; file: FileMeta })
  | (Request & { type: 'accept'; invitationId: string })
  | (Request & { type: 'reject'; invitationId: string })
  | (Request & { type: 'cancel'; transferId: string })
  | (WireMessage & { type: 'signal'; pairId: string; generation: number; signal: Signal })
  | (WireMessage & { type: 'release'; pairId: string; transferId: string; outcome: Outcome });

export type ServerMessage =
  | (WireMessage & {
      type: 'welcome'; self: PeerSummary; code: string; codeExpiresAt: number;
      peers: PeerSummary[]; iceServers: IceServer[];
    })
  | (WireMessage & { type: 'peers'; peers: PeerSummary[] })
  | (WireMessage & { type: 'self'; self: PeerSummary; code: string; codeExpiresAt: number })
  | (Request & { type: 'lookup-result'; peer: PeerSummary })
  | (WireMessage & {
      type: 'incoming'; invitationId: string; from: PeerSummary; file: FileMeta; expiresAt: number;
    })
  | (Request & { type: 'offered'; invitationId: string; transferId: string; expiresAt: number })
  | (WireMessage & {
      type: 'paired'; invitationId: string; pairId: string; generation: number;
      transferId: string; peer: PeerSummary; file: FileMeta;
      role: 'sender' | 'receiver'; iceServers: IceServer[];
    })
  | (WireMessage & { type: 'rejected'; transferId: string; reason: 'rejected' | 'expired' | 'busy' })
  | (WireMessage & { type: 'cancel-requested'; transferId: string; by: string })
  | (WireMessage & { type: 'signal'; pairId: string; generation: number; from: string; signal: Signal })
  | (WireMessage & { type: 'peer-left'; peerId: string })
  | (Request & { type: 'ack' })
  | (WireMessage & { type: 'error'; requestId?: string; code: ErrorCode; message: string });

interface TransferControl extends WireMessage { transferId: string; generation: number }
export type ReportedPhase = 'transferring' | 'verifying' | 'saving';

export type DataControl =
  | (TransferControl & {
      type: 'hello'; pairId: string; metaDigest: string; chunkBytes: number;
      frameBytes: number; windowChunks: number;
    })
  | (TransferControl & { type: 'ready'; offset: number; chain: string; credit: number })
  | (TransferControl & {
      type: 'chunk-begin'; index: number; offset: number; length: number; hash: string;
    })
  | (TransferControl & { type: 'chunk-end'; index: number })
  | (TransferControl & { type: 'chunk-ack'; index: number; offset: number; chain: string; credit: number })
  | (TransferControl & {
      type: 'finish'; totalBytes: number; chunkCount: number; chain: string; metaDigest: string;
    })
  | (TransferControl & { type: 'status-request' })
  | (TransferControl & { type: 'status'; phase: ReportedPhase; offset: number; elapsedMs: number })
  | (TransferControl & { type: 'complete'; totalBytes: number; chain: string; savedName: string })
  | (TransferControl & { type: 'complete-ack' })
  | (TransferControl & { type: 'cancel' })
  | (TransferControl & { type: 'cancelled' })
  | (TransferControl & { type: 'error'; code: ErrorCode; message: string });

export interface DataFrame {
  transferId: string;
  generation: number;
  chunkIndex: number;
  chunkLength: number;
  chunkOffset: number;
  offset: number;
  payload: Uint8Array;
}
