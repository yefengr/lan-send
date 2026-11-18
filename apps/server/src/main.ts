import { fileURLToPath } from 'node:url';
import { createLanSendServer } from './server.js';
import { validOrigin } from './security.js';

const host = process.env.HOST || '127.0.0.1';
const portText = process.env.PORT || '8787';
if (!/^\d+$/u.test(portText)) throw new TypeError('PORT 必须为有效端口');
const port = Number(portText);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new TypeError('PORT 必须为有效端口');
const publicOrigin = process.env.PUBLIC_ORIGIN?.trim();
const origins = publicOrigin ? [validOrigin(publicOrigin)] : [...new Set([5173, port])].flatMap(value =>
  [`http://localhost:${value}`, `http://127.0.0.1:${value}`, `http://[::1]:${value}`]);
const stunUrls = process.env.STUN_URLS?.trim() ? process.env.STUN_URLS.split(',').map(value => value.trim()) : [];
const app = createLanSendServer({ allowedOrigins: origins, stunUrls,
  webRoot: fileURLToPath(new URL('../../web/dist/', import.meta.url)) });
app.server.on('error', () => { console.error('协调服务启动失败'); void app.close().finally(() => { process.exitCode = 1; }); });
app.server.listen(port, host, () => { console.info('lan-send 协调服务已启动'); });
let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  void app.close().catch(() => { process.exitCode = 1; });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
