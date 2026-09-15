import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { createRenderGateway } from '../../src/adapters/render-gateway.ts';

const password = 'test-password-with-at-least-32-characters';
const authorization = 'Basic ' + Buffer.from('admin:' + password).toString('base64');
const publicOrigin = 'https://news-quality.onrender.com';
async function listen(server: ReturnType<typeof createServer>) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
function get(url: string, path: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(url + path, { method, headers: { host: 'news-quality.onrender.com', ...headers } }, res => {
      let body = ''; res.on('data', chunk => { body += chunk; }); res.on('end', () => resolve({ status: res.statusCode!, body }));
    }); req.on('error', reject); req.end();
  });
}

test('protects all operator pages and only exposes the exact public label read routes', async t => {
  const seen: { url: string; auth: string | undefined }[] = [];
  const operator = createServer((req, res) => { seen.push({ url: req.url!, auth: req.headers.authorization }); res.end('private evidence'); });
  const labels = createServer((req, res) => { seen.push({ url: req.url!, auth: req.headers.authorization }); res.end('signed labels'); });
  const operatorTarget = await listen(operator); const labelerTarget = await listen(labels);
  const gateway = createRenderGateway({ publicOrigin, password, operatorTarget, labelerTarget, revision: 'test-revision' });
  const url = await listen(gateway.server);
  t.after(async () => { await gateway.close(); operator.close(); labels.close(); });
  for (const path of ['/', '/style.css', '/publish', '/.env', '/xrpc/tools.ozone.moderation.emitEvent']) {
    assert.equal((await get(url, path)).status, 401);
  }
  assert.equal(seen.length, 0);
  assert.equal((await get(url, '/', { authorization: 'Basic ' + Buffer.from('admin:wrong').toString('base64') })).status, 401);
  assert.equal((await get(url, '/', { authorization, host: 'evil.test' })).status, 421);
  assert.equal((await get(url, '/', { authorization })).body, 'private evidence');
  assert.equal(seen.at(-1)?.auth, undefined);
  assert.equal((await get(url, '/xrpc/com.atproto.label.queryLabels?uriPatterns=*', { authorization })).body, 'signed labels');
  assert.equal(seen.at(-1)?.auth, undefined);
  assert.equal((await get(url, '/xrpc/com.atproto.label.queryLabels', {}, 'POST')).status, 401);
  assert.equal((await get(url, '/xrpc/com.atproto.label.queryLabels/')).status, 401);
});

test('bootstrap is healthy but cannot serve labels before publishing is configured', async t => {
  const operator = createServer((req, res) => res.end('Set up News Quality'));
  const operatorTarget = await listen(operator);
  const gateway = createRenderGateway({ publicOrigin, password, operatorTarget, revision: 'bootstrap-revision' });
  const url = await listen(gateway.server);
  t.after(async () => { await gateway.close(); operator.close(); });
  const health = await get(url, '/healthz');
  assert.deepEqual(JSON.parse(health.body), { status: 'setup-required', revision: 'bootstrap-revision' });
  assert.equal((await get(url, '/xrpc/com.atproto.label.queryLabels')).status, 503);
  assert.equal((await get(url, '/', { authorization })).body, 'Set up News Quality');
});

test('refuses an insecure origin or weak operator password', () => {
  const options = { publicOrigin, password, operatorTarget: 'http://127.0.0.1:4317', revision: 'test' };
  assert.throws(() => createRenderGateway({ ...options, password: 'short' }), /32/);
  assert.throws(() => createRenderGateway({ ...options, publicOrigin: 'http://example.org' }), /HTTPS/);
  assert.throws(() => createRenderGateway({ ...options, publicOrigin: 'https://example.org/path' }), /origin/);
});

test('an authenticated operator can publish behind HTTPS while foreign-origin writes are rejected', async t => {
  const { createPreviewServer } = await import('../../src/adapters/http.ts');
  const { createPreview } = await import('../../src/application/preview.ts');
  const { createPublisher } = await import('../../src/application/publication.ts');
  const { openPublicationStore } = await import('../../src/adapters/publication-store.ts');
  const { parseRatings } = await import('../../src/ratings/snapshot.ts');
  const store = openPublicationStore(':memory:', 'gateway-test');
  const preview = createPreview({ ratings: parseRatings('domain,pc1\nexample.com,0.9', 'a'.repeat(40)),
    getPost: async () => ({ uri: 'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/app.bsky.feed.post/test', cid: 'bafyreifixture',
      author: 'reader.test', text: 'Article', links: ['https://example.com/a'], quote: null }), resolveDestination: async u => u });
  const emitted: unknown[] = [];
  const publisher = createPublisher({ preview, store, emit: async e => { emitted.push(e); } });
  const operator = createPreviewServer(preview, publisher, { publicOrigin });
  const operatorTarget = await listen(operator);
  const gateway = createRenderGateway({ publicOrigin, password, operatorTarget, revision: 'test' });
  const url = await listen(gateway.server);
  t.after(async () => { await gateway.close(); await new Promise<void>(resolve => operator.close(() => resolve())); store.close(); });
  function post(path: string, form: Record<string, string>, origin = publicOrigin) {
    return new Promise<{ status: number; html: string }>((resolve, reject) => {
      const req = request(url + path, { method: 'POST', headers: { host: 'news-quality.onrender.com', authorization, origin,
        'content-type': 'application/x-www-form-urlencoded' } }, res => {
        let html = ''; res.on('data', chunk => { html += chunk; }); res.on('end', () => resolve({ status: res.statusCode!, html }));
      }); req.on('error', reject); req.end(new URLSearchParams(form).toString());
    });
  }
  const assessment = await post('/assess', { postUrl: 'https://bsky.app/profile/reader.test/post/test' });
  assert.equal(assessment.status, 200, assessment.html);
  const csrf = /name="csrf" value="([^"]+)"/.exec(assessment.html)![1];
  const reviewId = /name="reviewId" value="([^"]+)"/.exec(assessment.html)![1];
  assert.equal((await post('/publish', { csrf, reviewId }, 'https://evil.test')).status, 403);
  assert.equal(emitted.length, 0);
  assert.equal((await post('/publish', { csrf, reviewId })).status, 200);
  assert.equal(emitted.length, 1);
});

test('streams signed labels over public WebSockets and refuses operator upgrades', { timeout: 10000 }, async t => {
  const { createLabelTransport } = await import('../../src/adapters/labeler.ts');
  const transport = await createLabelTransport({ did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', signingKey: '01'.repeat(32), dbPath: ':memory:' });
  const labelerTarget = await transport.start(0);
  const gateway = createRenderGateway({ publicOrigin, password, operatorTarget: 'http://127.0.0.1:1', labelerTarget, revision: 'test' });
  const url = await listen(gateway.server);
  t.after(async () => {
    await gateway.close();
    const closed = transport.close();
    const cleanup = setTimeout(() => {
      for (const client of transport.app.websocketServer.clients) client.terminate();
    }, 1500);
    try {
      const result = await Promise.race([closed.then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1000))]);
      assert.equal(result, true, 'shutdown must close the upstream subscription without waiting for its handshake timeout');
    } finally { await closed; clearTimeout(cleanup); }
  });
  const socket = new WebSocket(url.replace('http:', 'ws:') + '/xrpc/com.atproto.label.subscribeLabels?cursor=0');
  await new Promise<void>((resolve, reject) => { socket.addEventListener('open', () => resolve(), { once: true }); socket.addEventListener('error', () => reject(new Error('WebSocket failed')), { once: true }); });
  const received = new Promise<MessageEvent>(resolve => socket.addEventListener('message', resolve, { once: true }));
  await transport.emit({ uri: 'at://did:plc:bbbbbbbbbbbbbbbbbbbbbbbb/app.bsky.feed.post/test', cid: 'bafyreifixture',
    val: 'high-quality-news-source', neg: false, cts: new Date().toISOString() });
  assert.ok((await received).data);
  const forbidden = new WebSocket(url.replace('http:', 'ws:') + '/');
  await new Promise<void>(resolve => forbidden.addEventListener('error', () => resolve(), { once: true }));
});

test('reports stream progress separately from label-serving readiness', async t => {
  const upstream = createServer((_req, res) => res.end('ok')); const target = await listen(upstream);
  const automatic = { state: 'reconnecting', cursor: 123, queued: 5 };
  const gateway = createRenderGateway({ publicOrigin, password, operatorTarget: target, labelerTarget: target,
    revision: 'automatic', automaticStatus: () => automatic });
  const url = await listen(gateway.server);
  t.after(async () => { await gateway.close(); upstream.close(); });
  const response = await get(url, '/healthz');
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { status: 'ready', revision: 'automatic', automatic });
});
