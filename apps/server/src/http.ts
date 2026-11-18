import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function within(root: string, path: string): boolean {
  const portion = relative(root, path);
  return portion !== '' && portion !== '..' && !portion.startsWith(`..${sep}`) && !isAbsolute(portion);
}

export function httpHandler(webRoot?: string): (request: IncomingMessage, response: ServerResponse) => void {
  const root = webRoot === undefined ? null : realpath(resolve(webRoot)).catch(() => null);
  return (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    response.setHeader('Cache-Control', 'no-store');
    const end = (status: number, content?: string) => {
      response.statusCode = status;
      response.end(request.method === 'HEAD' ? undefined : content);
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD'); end(405); return;
    }
    let path: string;
    try {
      path = decodeURIComponent((request.url ?? '/').split('?')[0]!);
      if (!path.startsWith('/') || path.includes('\\') || /[\u0000-\u001f\u007f]/u.test(path)
        || path.split('/').some(segment => segment.startsWith('.'))) { end(400); return; }
    } catch { end(400); return; }
    if (path === '/healthz') {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      end(200, JSON.stringify({ service: 'lan-send', status: 'ok' })); return;
    }
    if (path === '/favicon.ico') { end(204); return; }
    void (async () => {
      const canonicalRoot = await root;
      if (!canonicalRoot) { end(404); return; }
      const extension = extname(path);
      if (extension && !TYPES[extension]) { end(404); return; }
      // SPA 路由仅回退到首页；含扩展名的缺失资源不能取得 HTML 或任意文件。
      const requested = path === '/' || !extension ? 'index.html' : path.slice(1);
      const candidate = await realpath(resolve(canonicalRoot, requested));
      if (!within(canonicalRoot, candidate)) { end(403); return; }
      const contentType = TYPES[extname(candidate)];
      if (!contentType) { end(404); return; }
      const metadata = await stat(candidate);
      if (!metadata.isFile()) { end(404); return; }
      response.setHeader('Content-Type', contentType);
      response.setHeader('Content-Length', metadata.size);
      if (request.method === 'HEAD') { end(200); return; }
      const stream = createReadStream(candidate);
      stream.on('error', () => {
        if (response.headersSent) response.destroy();
        else { response.removeHeader('Content-Length'); end(404); }
      });
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    })().catch(() => { if (!response.headersSent) end(404); else response.destroy(); });
  };
}
