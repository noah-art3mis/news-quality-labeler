import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import { createPreviewServer } from '../../src/adapters/http.ts';
import { createPreview } from '../../src/application/preview.ts';
import { parseRatings } from '../../src/ratings/snapshot.ts';

test('serves a private, escaped assessment with citations and rejects cross-origin or oversized submissions', async t => {
  const preview = createPreview({
    ratings: parseRatings('domain,pc1\nexample.com,0.7\n', 'a'.repeat(40)),
    getPost: async () => ({ cid: 'bafyreifixture', uri: 'at://did:plc:a/app.bsky.feed.post/b', author: 'author.test',
      text: '<script>alert("unsafe")</script>', links: ['https://example.com/a'], quote: { status: 'unavailable' } }),
    resolveDestination: async url => url,
  });
  const server = createPreviewServer(preview);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  const origin = `http://127.0.0.1:${address.port}`;
  const body = new URLSearchParams({ postUrl: 'https://bsky.app/profile/author.test/post/b' });
  const response = await fetch(`${origin}/assess`, { method: 'POST', body });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(response.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
  assert.match(html, /example.com/);
  assert.match(html, /0.700/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /The quoted post could not be inspected/);
  assert.match(html, /10.1093\/pnasnexus\/pgad286/);
  assert.match(html, new RegExp('a'.repeat(40)));
  const foreign = await fetch(`${origin}/assess`, { method: 'POST', body, headers: { Origin: 'https://evil.org' } });
  assert.equal(foreign.status, 403);
  const rebound = await new Promise<number | undefined>((resolve, reject) => {
    get(origin, { headers: { Host: 'evil.org' } }, response => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(rebound, 421);
  const oversized = await fetch(`${origin}/assess`, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'x'.repeat(9000) });
  assert.equal(oversized.status, 413);
});

test('publication controls require same-origin requests and a server token, and reject forged reviews', async t => {
  const { createPublisher } = await import('../../src/application/publication.ts');
  const { openPublicationStore } = await import('../../src/adapters/publication-store.ts');
  const store = openPublicationStore(':memory:', 'test'); t.after(() => store.close());
  const preview = createPreview({ ratings: parseRatings('domain,pc1\nexample.com,0.9', 'a'.repeat(40)),
    getPost: async () => ({ uri: 'at://did:plc:reader/app.bsky.feed.post/post', cid: 'bafyreifixture',
      author: 'reader.test', text: 'Article', links: ['https://example.com/a'], quote: null }),
    resolveDestination: async url => url });
  const sent: unknown[] = [];
  const publisher = createPublisher({ preview, store, emit: async event => { sent.push(event); } });
  const server = createPreviewServer(preview, publisher);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const response = await fetch(origin + '/assess', { method: 'POST', body: new URLSearchParams({ postUrl: 'https://bsky.app/profile/reader.test/post/post' }) });
  const html = await response.text();
  const token = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
  const id = /name="reviewId" value="([^"]+)"/.exec(html)?.[1];
  assert.ok(token && id, 'server should render its reviewed proposal and CSRF token');
  const body = new URLSearchParams({ csrf: token, reviewId: id });
  assert.equal((await fetch(origin + '/publish', { method: 'POST', body })).status, 403);
  assert.equal((await fetch(origin + '/publish', { method: 'POST', body, headers: { origin: 'https://evil.test' } })).status, 403);
  assert.equal((await fetch(origin + '/publish', { method: 'POST', body: new URLSearchParams({ reviewId: id }), headers: { origin } })).status, 403);
  assert.equal(sent.length, 0);
  const forged = await fetch(origin + '/publish', { method: 'POST', body: new URLSearchParams({ csrf: token, reviewId: 'forged' }), headers: { origin } });
  assert.equal(forged.status, 400);
  assert.equal(sent.length, 0);
  const published = await fetch(origin + '/publish', { method: 'POST', body, headers: { origin } });
  assert.equal(published.status, 200);
  assert.equal(sent.length, 1);
  assert.match(await published.text(), /Published to labeler service/);
});
