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
    getPost: async () => ({ uri: 'at://did:plc:a/app.bsky.feed.post/b', author: 'author.test',
      text: '<script>alert("unsafe")</script>', links: ['https://example.com/a'], hasQuote: true }),
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
  assert.match(html, /Quoted post links have not been inspected/);
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
