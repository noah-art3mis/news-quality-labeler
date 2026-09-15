import { validateRenderAccess } from '../deployment/render-config.ts';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import httpProxy from 'http-proxy';

export function createRenderGateway(options: {
  publicOrigin: string; password: string; operatorTarget: string; labelerTarget?: string; revision: string;
  automaticStatus?: () => unknown;
}) {
  const origin = validateRenderAccess(options.publicOrigin, options.password);
  const digest = (value: string) => createHash('sha256').update(value).digest();
  const expected = digest('Basic ' + Buffer.from('admin:' + options.password).toString('base64'));
  const proxy = httpProxy.createProxyServer({ ws: true, proxyTimeout: 60_000 });
  const upgrades = new Set<Duplex>();
  let closing = false;
  function ownSocket(socket: Duplex) {
    if (closing) { socket.destroy(); return; }
    upgrades.add(socket);
    socket.once('close', () => upgrades.delete(socket));
  }
  proxy.on('open', ownSocket);
  proxy.on('error', (_error, _request, response) => {
    if (response instanceof ServerResponse) {
      if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain' });
      response.end('Service temporarily unavailable.');
    } else response.destroy();
  });
  const publicPaths = new Set(['/xrpc/com.atproto.label.queryLabels', '/xrpc/com.atproto.label.subscribeLabels', '/xrpc/_health']);
  const pathOf = (url: string | undefined) => (url ?? '').split('?')[0];
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'GET' && pathOf(request.url) === '/healthz') {
      let healthy = true;
      if (options.labelerTarget) {
        try { healthy = (await fetch(`${options.labelerTarget}/xrpc/_health`, { signal: AbortSignal.timeout(2000) })).ok; }
        catch { healthy = false; }
      }
      response.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
      return response.end(JSON.stringify({ status: !healthy ? 'unavailable' : options.labelerTarget ? 'ready' : 'setup-required',
        revision: options.revision, automatic: options.automaticStatus?.() }));
    }
    const publicRead = request.method === 'GET' && publicPaths.has(pathOf(request.url));
    if (!publicRead) {
      if (request.headers.host !== origin.host) { response.writeHead(421); return response.end('Use the configured service address.'); }
      if (!timingSafeEqual(digest(request.headers.authorization ?? ''), expected)) {
        response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="News Quality operator", charset="UTF-8"' });
        return response.end('Sign in as admin to use the operator page.');
      }
    }
    const target = publicRead ? options.labelerTarget : options.operatorTarget;
    if (!target) { response.writeHead(503); return response.end('Labeler setup is not complete.'); }
    delete request.headers.authorization;
    delete request.headers.cookie;
    proxy.web(request, response, { target });
  });
  server.on('upgrade', (request, socket, head) => {
    if (request.method !== 'GET' || pathOf(request.url) !== '/xrpc/com.atproto.label.subscribeLabels' || !options.labelerTarget) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    delete request.headers.authorization;
    delete request.headers.cookie;
    ownSocket(socket);
    const cursor = new URL(request.url!, origin).searchParams.get('cursor');
    const connectedAt = Date.now();
    console.info(JSON.stringify({ event: 'label-stream-connect', cursor, userAgent: request.headers['user-agent'] }));
    socket.once('close', () => console.info(JSON.stringify({ event: 'label-stream-close', cursor, durationMs: Date.now() - connectedAt })));
    proxy.ws(request, socket, head, { target: options.labelerTarget });
  });
  return { server,
    close: () => new Promise<void>((resolve, reject) => {
      closing = true;
      for (const socket of upgrades) socket.destroy();
      server.close(error => { proxy.close(); error ? reject(error) : resolve(); });
    }),
  };
}
