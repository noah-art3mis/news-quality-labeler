import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPublisher } from '../../src/application/publication.ts';
import { createPreview } from '../../src/application/preview.ts';
import { openPublicationStore } from '../../src/adapters/publication-store.ts';
import { createPreviewServer } from '../../src/adapters/http.ts';

test('an operator can page to and retract an old publication even when its post is unavailable', async t => {
  const store = openPublicationStore(':memory:', 'history'); t.after(() => store.close());
  const input = 'https://bsky.app/profile/did:plc:reader/post/root';
  const preview = createPreview({ ratings: { version: 'test', ratings: new Map([['news.example', 0.9]]) },
    getPost: async () => ({ uri: 'at://did:plc:reader/app.bsky.feed.post/root', cid: 'same', author: 'reader.test',
      text: 'News', links: ['https://news.example/a'], quote: null }), resolveDestination: async url => url });
  const sent: boolean[] = [];
  const unavailable = async () => { throw new Error('Post deleted'); };
  const publisher = createPublisher({ store, preview: unavailable, emit: async event => { sent.push(event.neg); } });
  const evidence = await preview(input);
  for (let i = 0; i < 101; i++) {
    const uri = `${evidence.post.uri}${i}`;
    await publisher.automate(uri, input, { ...evidence, post: { ...evidence.post, uri, text: `News ${i}` } });
  }
  const server = createPreviewServer(unavailable, publisher); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const first = await (await fetch(origin)).text();
  const older = /href="([^\"]+)"[^>]*>Older decisions</.exec(first)?.[1];
  assert.ok(older, 'history must provide access beyond the newest page');
  const response = await fetch(origin + older);
  assert.equal(response.status, 200);
  const page = await response.text(); assert.match(page, /News 0</);
  const id = /name="operationId" value="([^\"]+)"/.exec(page)![1];
  const csrf = /name="csrf" value="([^\"]+)"/.exec(page)![1];
  const retracted = await fetch(origin + '/retract', { method: 'POST', headers: { Origin: origin },
    body: new URLSearchParams({ operationId: id, csrf }) });
  assert.equal(retracted.status, 200); assert.equal(sent.at(-1), true);
  const stalePage = await (await fetch(origin + older)).text();
  assert.doesNotMatch(stalePage, /name="operationId"/, 'older decisions must not acquire controls by moving to a different page');
});
