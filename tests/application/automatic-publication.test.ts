import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublisher } from '../../src/application/publication.ts';
import { createPreview } from '../../src/application/preview.ts';
import { openPublicationStore } from '../../src/adapters/publication-store.ts';
import type { LabelEvent } from '../../src/publication/model.ts';

const uri = 'at://did:plc:reader/app.bsky.feed.post/root';
const input = 'https://bsky.app/profile/did:plc:reader/post/root';
function scenario() {
  const store = openPublicationStore(':memory:', 'automatic-test');
  let cid = 'first'; let links = ['https://news.example/a']; let offline = false;
  const preview = createPreview({ ratings: { version: 'test', ratings: new Map([['news.example', 0.9]]) },
    getPost: async () => ({ uri, cid, author: 'reader.test', text: 'News', links, quote: null }),
    resolveDestination: async url => url });
  const sent: LabelEvent[] = [];
  const publisher = createPublisher({ store, preview, emit: async event => {
    if (offline) throw new Error('offline'); sent.push(event);
  } });
  return { store, preview, publisher, sent,
    edit: (next: string, urls: string[]) => { cid = next; links = urls; },
    offline: (value: boolean) => { offline = value; } };
}

test('automatically publishes rated posts once, replaces changed revisions and retracts deleted posts', async t => {
  const s = scenario(); t.after(() => s.store.close());
  await s.publisher.automate(uri, input, await s.preview(input));
  await s.publisher.automate(uri, input, await s.preview(input));
  assert.deepEqual(s.sent.map(e => [e.cid, e.neg]), [['first', false]]);
  s.edit('second', ['https://news.example/b']);
  await s.publisher.automate(uri, input, await s.preview(input));
  assert.deepEqual(s.sent.map(e => [e.cid, e.neg]), [['first', false], ['first', true], ['second', false]]);
  await s.publisher.automate(uri, input, null);
  await s.publisher.automate(uri, input, null);
  assert.deepEqual(s.sent.map(e => [e.cid, e.neg]), [['first', false], ['first', true], ['second', false], ['second', true]]);
});

test('unrated posts create no history, and removing a rated link withdraws earlier labels', async t => {
  const s = scenario(); t.after(() => s.store.close());
  s.edit('unrated', ['https://unknown.example/a']);
  await s.publisher.automate(uri, input, await s.preview(input));
  assert.equal(s.publisher.history().length, 0);
  s.edit('rated', ['https://news.example/a']);
  await s.publisher.automate(uri, input, await s.preview(input));
  s.edit('no-links', []);
  await s.publisher.automate(uri, input, await s.preview(input));
  assert.deepEqual(s.sent.map(e => e.neg), [false, true]);
});

test('automatic redelivery finishes pending work and respects an operator retraction of the same revision', async t => {
  const s = scenario(); t.after(() => s.store.close());
  s.offline(true);
  await assert.rejects(s.publisher.automate(uri, input, await s.preview(input)), /pending/i);
  s.offline(false);
  await s.publisher.automate(uri, input, await s.preview(input));
  assert.equal(s.sent.length, 1);
  await s.publisher.retract(s.publisher.history()[0].id);
  await s.publisher.automate(uri, input, await s.preview(input));
  assert.deepEqual(s.sent.map(e => e.neg), [false, true]);
});

test('operator history stays bounded while older publications remain available for retraction', async t => {
  const s = scenario(); t.after(() => s.store.close());
  const evidence = await s.preview(input);
  for (let i = 0; i < 105; i++) {
    const postUri = `${uri}${i}`;
    await s.publisher.automate(postUri, input, { ...evidence, post: { ...evidence.post, uri: postUri } });
  }
  assert.equal(s.publisher.history().length, 100);
  await s.publisher.automate(`${uri}0`, input, null);
  assert.equal(s.sent.at(-1)!.neg, true);
});
