export const PROTOCOL_VERSION = 1 as const;
export const CHUNK_BYTES = 1024 * 1024;
export const MAX_FRAME_BYTES = 16 * 1024;
export const FRAME_HEADER_BYTES = 64;
export const MAX_FRAME_PAYLOAD = MAX_FRAME_BYTES - FRAME_HEADER_BYTES;
export const MAX_CONTROL_BYTES = 64 * 1024;
export const MAX_WINDOW_CHUNKS = 4;
export const CHANNEL_HIGH_WATER = 1024 * 1024;
export const CHANNEL_LOW_WATER = 256 * 1024;
export const MAX_PENDING_BYTES = 4 * CHUNK_BYTES;
export const MAX_PENDING_EVENTS = 256;
export const MAX_DEVICE_NAME = 24;
export const MAX_FILE_NAME = 255;
export const PAIR_CODE_LENGTH = 8;
export const PAIR_CODE_TTL_MS = 5 * 60 * 1000;
export const INVITATION_TTL_MS = 60 * 1000;
export const MAX_PEERS = 50;
export const ERROR_CODES = [
  'INVALID_MESSAGE', 'PROTOCOL_MISMATCH', 'NOT_READY', 'NOT_FOUND', 'EXPIRED',
  'RATE_LIMITED', 'BUSY', 'FORBIDDEN', 'CONNECTION_FAILED', 'INTEGRITY_FAILED',
  'SAVE_FAILED', 'CANCELLED', 'RESULT_UNKNOWN', 'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
