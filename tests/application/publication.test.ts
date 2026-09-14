import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreview } from '../../src/application/preview.ts';
import { createPublisher } from '../../src/application/publication.ts';
import { openPublicationStore } from '../../src/adapters/publication-store.ts';
import { parseRatings } from '../../src/ratings/snapshot.ts';
import type { LabelEvent } from '../../src/publication/model.ts';

function scenario() {
  const store = openPublicationStore(':memory:', 'test-identity');
  let links = ['https://high.example/a', 'https://low.example/b'];
  const preview = createPreview({ ratings: parseRatings('domain,pc1\nhigh.example,0.9\nlow.example,0.2', 'a'.repeat(40)),
    async getPost() { return { uri: 'at://did:plc:reader/app.bsky.feed.post/root', cid: 'bafyreirevision',
      author: 'reader.test', text: 'Reporting', links, quote: null }; },
    async resolveDestination(url) { return url; },
  });
  const sent: LabelEvent[] = [];
  const publisher = createPublisher({ preview, store, emit: async event => { sent.push(event); },
    now: () => new Date('2026-09-14T00:00:00Z') });
  return { store, publisher, sent, changeLinks: (value: string[]) => { links = value; } };
}
const input = 'https://bsky.app/profile/reader.test/post/root';

test('publishes the reviewed category set once and retracts it without rereading the post', async t => {
  const s = scenario(); t.after(() => s.store.close());
  const review = await s.publisher.inspect(input);
  assert.equal(s.sent.length, 0);
  const publication = await s.publisher.publish(review.id);
  assert.equal(publication.status, 'complete');
  assert.deepEqual(s.sent.map(e => [e.val, e.neg, e.cid]), [
    ['low-quality-news-source', false, 'bafyreirevision'], ['high-quality-news-source', false, 'bafyreirevision'],
  ]);
  await s.publisher.publish(review.id);
  assert.equal(s.sent.length, 2);
  s.changeLinks([]);
  const retraction = await s.publisher.retract(publication.id);
  assert.deepEqual(retraction.target, []);
  assert.equal(retraction.status, 'complete');
  assert.deepEqual(s.sent.slice(2).map(e => [e.val, e.neg]), [
    ['low-quality-news-source', true], ['high-quality-news-source', true],
  ]);
  assert.ok(s.sent.every((e, index) => index === 0 || e.cts > s.sent[index - 1].cts));
  await s.publisher.publish(review.id);
  assert.equal(s.sent.length, 4, 'an old publish button cannot undo a retraction');
});

test('rejects publication if the assessed source evidence changed after review', async t => {
  const s = scenario(); t.after(() => s.store.close());
  const review = await s.publisher.inspect(input);
  s.changeLinks(['https://high.example/a']);
  await assert.rejects(s.publisher.publish(review.id), /changed.*inspect again/i);
  assert.equal(s.sent.length, 0);
});

test('rejects empty proposals and unknown review tokens', async t => {
  const s = scenario(); t.after(() => s.store.close());
  s.changeLinks([]);
  const review = await s.publisher.inspect(input);
  await assert.rejects(s.publisher.publish(review.id), /No labels/);
  await assert.rejects(s.publisher.publish('unknown'), /inspect again/i);
  assert.equal(s.sent.length, 0);
});

test('serializes duplicate submissions and makes repeated retraction harmless', async t => {
  const s = scenario(); t.after(() => s.store.close());
  const review = await s.publisher.inspect(input);
  await Promise.all([s.publisher.publish(review.id), s.publisher.publish(review.id)]);
  assert.equal(s.sent.length, 2);
  await Promise.all([s.publisher.retract(review.id), s.publisher.retract(review.id)]);
  assert.equal(s.sent.length, 4);
});

test('a stale tab cannot overwrite a newer publication decision', async t => {
  const s = scenario(); t.after(() => s.store.close());
  const first = await s.publisher.inspect(input);
  const stale = await s.publisher.inspect(input);
  await s.publisher.publish(first.id);
  await s.publisher.retract(first.id);
  await assert.rejects(s.publisher.publish(stale.id), /changed.*inspect again/i);
  assert.equal(s.sent.length, 4);
});

test('keeps partial publication pending and requires retry before another decision', async t => {
  const s = scenario(); t.after(() => s.store.close());
  let fail = true;
  const delivered: LabelEvent[] = [];
  const publisher = createPublisher({ store: s.store,
    preview: async () => (await s.publisher.inspect(input)).evidence,
    emit: async event => { if (fail && delivered.length === 1) throw new Error('offline'); delivered.push(event); },
  });
  const review = await publisher.inspect(input);
  const partial = await publisher.publish(review.id);
  assert.equal(partial.status, 'pending');
  assert.equal(partial.delivered, 1);
  await assert.rejects(publisher.retract(partial.id), /retry/i);
  const next = await publisher.inspect(input);
  await assert.rejects(publisher.publish(next.id), /retry/i);
  fail = false;
  assert.equal((await publisher.retry(partial.id)).status, 'complete');
  assert.equal(delivered.length, 2);
  assert.equal((await publisher.retract(partial.id)).status, 'complete');
});

test('an expired review cannot authorize publication', async t => {
  const s = scenario(); t.after(() => s.store.close());
  let time = new Date('2026-09-14T00:00:00Z');
  const publisher = createPublisher({ store: s.store, preview: async () => (await s.publisher.inspect(input)).evidence,
    emit: async event => { s.sent.push(event); }, now: () => time });
  const review = await publisher.inspect(input);
  time = new Date('2026-09-14T00:16:00Z');
  await assert.rejects(publisher.publish(review.id), /inspect again/);
  assert.equal(s.sent.length, 0);
});

test('publication evidence and retry progress survive restart, and state cannot switch labeler identities', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'publication-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'state.db');
  const s = scenario(); t.after(() => s.store.close());
  let store = openPublicationStore(path, 'one-identity');
  const preview = async () => (await s.publisher.inspect(input)).evidence;
  let publisher = createPublisher({ store, preview, emit: async () => { throw new Error('offline'); } });
  const review = await publisher.inspect(input);
  await publisher.publish(review.id);
  store.close();
  assert.throws(() => openPublicationStore(path, 'another-identity'), /identity/i);
  store = openPublicationStore(path, 'one-identity'); t.after(() => store.close());
  publisher = createPublisher({ store, preview, emit: async event => { s.sent.push(event); } });
  assert.deepEqual(publisher.history()[0].evidence, review.evidence);
  assert.equal((await publisher.retry(review.id)).status, 'complete');
  assert.equal(s.sent.length, 2);
});

test('a no-change publication cannot reset the timestamp used by a later retraction', async t => {
  const s = scenario(); t.after(() => s.store.close());
  const first = await s.publisher.inspect(input);
  await s.publisher.publish(first.id);
  const repeated = await s.publisher.inspect(input);
  await s.publisher.publish(repeated.id);
  assert.equal(s.sent.length, 2);
  await s.publisher.retract(repeated.id);
  assert.ok(s.sent[2].cts > s.sent[1].cts);
});

test('review retention is bounded and an evicted token cannot publish', async t => {
  const s = scenario(); t.after(() => s.store.close());
  const oldest = await s.publisher.inspect(input);
  for (let i = 0; i < 100; i++) await s.publisher.inspect(input);
  await assert.rejects(s.publisher.publish(oldest.id), /inspect again/);
  assert.equal(s.sent.length, 0);
});
