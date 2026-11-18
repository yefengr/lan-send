import { createServer } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { MAX_CONTROL_BYTES } from '@lan-send/protocol';
import { Coordinator } from './coordinator.js';
import { httpHandler } from './http.js';
import { iceConfiguration, isLocalOrigin, normalizeAddress, validOrigin } from './security.js';

export interface LanSendServerOptions {
  allowedOrigins: readonly string[];
  webRoot?: string;
  stunUrls?: readonly string[];
  now?: () => number;
  sourceAddress?: (request: IncomingMessage) => string;
}

export function createLanSendServer(options: LanSendServerOptions): { server: Server; close: () => Promise<void> } {
  const origins = new Set(options.allowedOrigins.map(validOrigin));
  const coordinator = new Coordinator(options.now ?? Date.now, iceConfiguration(options.stunUrls));
  const server = createServer({ maxHeaderSize: 16 * 1024 }, httpHandler(options.webRoot));
  server.headersTimeout = 10_000; server.requestTimeout = 10_000;
  server.keepAliveTimeout = 5_000; server.maxConnections = 512;
  const ws = new WebSocketServer({ noServer: true, maxPayload: MAX_CONTROL_BYTES, perMessageDeflate: false });
  server.on('upgrade', (request, socket, head) => {
    const reject = (status: number) => {
      socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    };
    const origin = request.headers.origin;
    if (request.url !== '/ws' || request.method !== 'GET') { reject(404); return; }
    if (typeof origin !== 'string' || !origins.has(origin)) { reject(403); return; }
    let source: string;
    try { source = normalizeAddress(options.sourceAddress?.(request) ?? request.socket.remoteAddress ?? 'unknown'); }
    catch { reject(400); return; }
    if (!coordinator.canConnect(source)) { reject(503); return; }
    const forwarded = ['forwarded', 'x-forwarded-for', 'x-real-ip'].some(header => request.headers[header] !== undefined);
    const group = !forwarded && isLocalOrigin(origin) && source !== 'unknown' ? source : null;
    ws.handleUpgrade(request, socket, head, client => coordinator.connect(client, source, group));
  });
  let closing: Promise<void> | undefined;
  return { server, close: () => {
    closing ??= new Promise<void>((resolve, reject) => {
      coordinator.stop();
      ws.close();
      server.close(error => {
        if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolve();
      });
      server.closeAllConnections();
    });
    return closing;
  } };
}
