import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLabelTransport } from '../../src/adapters/labeler.ts';

const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const signingKey = '01'.repeat(32);
const event = { uri: 'at://did:plc:bbbbbbbbbbbbbbbbbbbbbbbb/app.bsky.feed.post/test',
  cid: 'bafyreifake', val: 'high-quality-news-source', neg: false, cts: '2026-09-14T00:00:00.001Z' };

test('serves signed labels and retractions, deduplicates replay after restart, and disallows public writes', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'labeler-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const options = { did, signingKey, dbPath: join(dir, 'labels.db') };
  let transport = await createLabelTransport(options);
  await transport.emit(event);
  await transport.close();
  transport = await createLabelTransport(options);
  t.after(() => transport.close());
  await transport.emit(event);
  await transport.emit({ ...event, neg: true, cts: '2026-09-14T00:00:00.002Z' });
  const response = await transport.app.inject({ method: 'GET', url: '/xrpc/com.atproto.label.queryLabels?uriPatterns=' + encodeURIComponent(event.uri) });
  const labels = response.json().labels;
  assert.equal(response.statusCode, 200);
  assert.equal(labels.length, 2);
  assert.deepEqual(labels.map((label: { neg: boolean }) => label.neg), [false, true]);
  assert.ok(labels.every((label: { sig: { $bytes: string }; src: string; cid: string }) =>
    label.sig.$bytes && label.src === did && label.cid === event.cid));
  const write = await transport.app.inject({ method: 'POST', url: '/xrpc/tools.ozone.moderation.emitEvent', payload: {} });
  assert.equal(write.statusCode, 401);
});

test('recovers a saved signed event when acknowledgement was interrupted, using the same database', async t => {
  const { openPublicationStore } = await import('../../src/adapters/publication-store.ts');
  const { createPublisher } = await import('../../src/application/publication.ts');
  const { createPreview } = await import('../../src/application/preview.ts');
  const { parseRatings } = await import('../../src/ratings/snapshot.ts');
  const dir = await mkdtemp(join(tmpdir(), 'publisher-receipt-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'labels.db');
  const preview = createPreview({ ratings: parseRatings('domain,pc1\nexample.com,0.9', 'a'.repeat(40)),
    getPost: async () => ({ uri: event.uri, cid: event.cid, author: 'reader.test', text: 'Article',
      links: ['https://example.com/story'], quote: null }), resolveDestination: async url => url });
  let store = openPublicationStore(dbPath, did);
  let transport = await createLabelTransport({ did, signingKey, dbPath });
  let publisher = createPublisher({ preview, store, emit: async item => {
    await transport.emit(item);
    throw new Error('Stopped before acknowledgement');
  } });
  const review = await publisher.inspect('https://bsky.app/profile/reader.test/post/test');
  const pending = await publisher.publish(review.id);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.delivered, 0);
  await transport.close(); store.close();
  store = openPublicationStore(dbPath, did);
  transport = await createLabelTransport({ did, signingKey, dbPath });
  t.after(async () => { await transport.close(); store.close(); });
  publisher = createPublisher({ preview, store, emit: transport.emit });
  assert.equal((await publisher.retry(review.id)).status, 'complete');
  const response = await transport.app.inject({ method: 'GET', url: '/xrpc/com.atproto.label.queryLabels?uriPatterns=' + encodeURIComponent(event.uri) });
  assert.equal(response.json().labels.length, 1);
  assert.deepEqual(publisher.history()[0].evidence, review.evidence);
});
