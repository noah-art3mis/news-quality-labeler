import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAutomaticLabeler } from '../../src/application/automatic.ts';
import { openAutomaticStore } from '../../src/adapters/automatic-store.ts';
import { openPublicationStore } from '../../src/adapters/publication-store.ts';
import { createPublisher } from '../../src/application/publication.ts';
import { createPreview } from '../../src/application/preview.ts';
import type { LabelEvent } from '../../src/publication/model.ts';
import { DatabaseSync } from 'node:sqlite';
import { decodeJetstreamFrame } from '../../src/adapters/jetstream-frame.ts';

export function frame(seq: number, options: { operation?: string; link?: string; quote?: boolean; rkey?: string } = {}) {
  return JSON.stringify({ $type: 'message', payload: { $type: 'network.bsky.jetstream.subscribeEvents#commit',
    seq, time: '2026-09-15T00:00:00Z', did: 'did:plc:reader', collection: 'app.bsky.feed.post',
    operation: options.operation ?? 'create', rkey: options.rkey ?? 'root', cid: `cid-${seq}`,
    record: { text: 'News', facets: options.link ? [{ features: [{ $type: 'app.bsky.richtext.facet#link', uri: options.link }] }] : [],
      embed: options.quote ? { $type: 'app.bsky.embed.record', record: { uri: 'at://did:plc:quoted/app.bsky.feed.post/quote' } } : undefined } } });
}

function scenario() {
  const queue = openAutomaticStore(':memory:'); const store = openPublicationStore(':memory:', 'test');
  const ratings = { version: 'test', ratings: new Map([['news.example', 0.9]]) };
  const getPost = async () => ({ uri: 'at://did:plc:quoted/app.bsky.feed.post/quote', cid: 'quoted', author: 'quote.test',
    text: 'Quote', links: ['https://news.example/story'], quote: null });
  const resolveDestination = async () => 'https://news.example/redirected';
  const preview = createPreview({ ratings, getPost, resolveDestination }); const sent: LabelEvent[] = [];
  let offline = false;
  const publisher = createPublisher({ preview, store, emit: async event => { if (offline) throw new Error('offline'); sent.push(event); } });
  const automatic = createAutomaticLabeler({ queue, publisher, ratings, getPost, resolveDestination });
  return { queue, store, sent, automatic, offline: (value: boolean) => { offline = value; }, close() { queue.close(); store.close(); } };
}

test('new stream posts publish automatically, including quotes and shortened links, while unmatched posts are skipped', async t => {
  const s = scenario(); t.after(() => s.close());
  s.automatic.receive(frame(1, { link: 'https://unknown.example/a' }));
  assert.equal(s.queue.size(), 0);
  for (const [seq, options] of [[2, { link: 'https://news.example/a', rkey: 'direct' }],
    [3, { quote: true, rkey: 'quote' }], [4, { link: 'https://bit.ly/news', rkey: 'short' }]] as const) {
    s.automatic.receive(frame(seq, options));
    await s.automatic.processNext();
  }
  assert.deepEqual(s.sent.map(e => [e.uri.split('/').at(-1), e.val]), [
    ['direct', 'high-quality-news-source'], ['quote', 'high-quality-news-source'], ['short', 'high-quality-news-source']]);
  assert.equal(s.queue.size(), 0); assert.equal(s.queue.cursor(), 4);
});

test('inclusive replay is harmless and queued edits coalesce to the newest revision', async t => {
  const s = scenario(); t.after(() => s.close());
  s.automatic.receive(frame(1, { link: 'https://news.example/a' }));
  s.automatic.receive(frame(2, { operation: 'update', link: 'https://news.example/b' }));
  s.automatic.receive(frame(1, { link: 'https://news.example/a' }));
  await s.automatic.processNext();
  assert.deepEqual(s.sent.map(e => e.cid), ['cid-2']);
  s.automatic.receive(frame(3, { operation: 'update' }));
  await s.automatic.processNext();
  assert.deepEqual(s.sent.map(e => e.neg), [false, true]);
});

test('failed delivery keeps durable work for retry and deletion withdraws its labels', async t => {
  const s = scenario(); t.after(() => s.close());
  s.automatic.receive(frame(1, { link: 'https://news.example/a' }));
  s.offline(true);
  await assert.rejects(s.automatic.processNext(), /pending/);
  assert.equal(s.queue.size(), 1);
  s.offline(false);
  await s.automatic.processNext();
  s.automatic.receive(frame(2, { operation: 'delete' }));
  await s.automatic.processNext();
  assert.deepEqual(s.sent.map(e => e.neg), [false, true]);
});

test('queue and cursor survive restart; a full queue does not acknowledge a lost event', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
  const dir = await mkdtemp(join(tmpdir(), 'automatic-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'queue.db'); let queue = openAutomaticStore(path, 1);
  const s = scenario(); t.after(() => s.close());
  s.automatic.receive(frame(1, { link: 'https://news.example/a' }));
  const job = s.queue.next()!;
  queue.accept(1, job);
  assert.throws(() => queue.accept(2, { ...job, seq: 2, uri: `${job.uri}other` }), /full/i);
  assert.equal(queue.cursor(), 1);
  queue.close(); queue = openAutomaticStore(path, 1); t.after(() => queue.close());
  assert.equal(queue.cursor(), 1); assert.equal(queue.next()!.uri, job.uri);
  queue.accept(2, { ...job, seq: 2 });
  queue.complete(job);
  assert.equal(queue.next()!.seq, 2, 'finishing old work must not remove an edit received while processing');
});

test('queue depth is tracked without recounting the table on every insertion', t => {
  const originalPrepare = DatabaseSync.prototype.prepare;
  let countQueries = 0;
  DatabaseSync.prototype.prepare = function(sql: string) {
    if (/count\s*\(\s*\*\s*\)/i.test(sql)) countQueries++;
    return originalPrepare.call(this, sql);
  };
  t.after(() => { DatabaseSync.prototype.prepare = originalPrepare; });
  const queue = openAutomaticStore(':memory:'); t.after(() => queue.close());
  const job = decodeJetstreamFrame(frame(1, { link: 'https://news.example/a' })).job!;
  for (let seq = 1; seq <= 20; seq++) queue.accept(seq, { ...job, seq, uri: `${job.uri}/${seq}` });
  assert.equal(queue.size(), 20);
  assert.equal(countQueries, 1, 'opening may count persisted jobs once, but accepts and size reads must not recount');
});

test('an unmatched edit supersedes a queued rated revision before publication', async t => {
  const s = scenario(); t.after(() => s.close());
  s.automatic.receive(frame(1, { link: 'https://news.example/a' }));
  s.automatic.receive(frame(2, { operation: 'update' }));
  await s.automatic.processNext();
  assert.equal(s.sent.length, 0);
});

test('a malformed post record cannot stall later valid posts in the public stream', async t => {
  const s = scenario(); t.after(() => s.close());
  const invalid = JSON.parse(frame(1)); delete invalid.payload.record.text;
  s.automatic.receive(JSON.stringify(invalid));
  s.automatic.receive(frame(2, { link: 'https://news.example/a' }));
  await s.automatic.processNext();
  assert.equal(s.sent.length, 1); assert.equal(s.queue.cursor(), 2);
});
