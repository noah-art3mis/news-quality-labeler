import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBlueskyReader, translatePost } from '../../src/adapters/bluesky.ts';

const uri = 'at://did:plc:reporter/app.bsky.feed.post/3abc';
function fixture(embed: unknown) {
  return { uri, author: { handle: 'reporter.test' }, record: {
    $type: 'app.bsky.feed.post', text: 'Read this',
    facets: [{ features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/a' },
      { $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:someone' }] }], embed,
  } };
}

test('resolves a handle and reads only direct facets and the post’s own external card', async () => {
  const calls: URL[] = [];
  const post = fixture({ $type: 'app.bsky.embed.recordWithMedia',
    record: { $type: 'app.bsky.embed.record', record: {
      uri: 'at://did:plc:quoted/app.bsky.feed.post/quote', links: ['https://excluded.org'] } },
    media: { $type: 'app.bsky.embed.external', external: { uri: 'https://other.org/card' } },
  });
  const read = createBlueskyReader(async (url) => {
    calls.push(new URL(url));
    return calls.length === 1 ? { did: 'did:plc:reporter' } : { posts: [post] };
  });
  const result = await read({ actor: 'reporter.test', rkey: '3abc' });
  assert.deepEqual(result.links, ['https://example.com/a', 'https://other.org/card']);
  assert.deepEqual(result.quote, { status: 'referenced', reference: { actor: 'did:plc:quoted', rkey: 'quote' } });
  assert.equal(calls[0].searchParams.get('handle'), 'reporter.test');
  assert.deepEqual(calls[1].searchParams.getAll('uris'), [uri]);
  assert.ok(calls.every(url => url.origin === 'https://public.api.bsky.app'));
});

test('accepts DID references and extracts standalone external cards', async () => {
  const read = createBlueskyReader(async () => ({ posts: [fixture({
    $type: 'app.bsky.embed.external', external: { uri: 'https://card.org/a' },
  })] }));
  const result = await read({ actor: 'did:plc:reporter', rkey: '3abc' });
  assert.equal(result.quote, null);
  assert.deepEqual(result.links, ['https://example.com/a', 'https://card.org/a']);
});

test('translates standalone quote references but does not mistake feed embeds for posts', () => {
  const quote = translatePost(fixture({ $type: 'app.bsky.embed.record',
    record: { uri: 'at://did:plc:quoted/app.bsky.feed.post/quote' } }));
  assert.deepEqual(quote.quote, { status: 'referenced', reference: { actor: 'did:plc:quoted', rkey: 'quote' } });
  const feed = translatePost(fixture({ $type: 'app.bsky.embed.record',
    record: { uri: 'at://did:plc:quoted/app.bsky.feed.generator/feed' } }));
  assert.equal(feed.quote, null);
});

test('does not expose a fetchable reference for blocked, detached or missing quote views', () => {
  for (const status of ['viewBlocked', 'viewDetached', 'viewNotFound']) {
    const post = fixture({ $type: 'app.bsky.embed.record',
      record: { uri: 'at://did:plc:quoted/app.bsky.feed.post/quote' } });
    const result = translatePost({ ...post, embed: { $type: 'app.bsky.embed.record#view',
      record: { $type: `app.bsky.embed.record#${status}` } } });
    assert.deepEqual(result.quote, { status: 'unavailable' });
  }
  const post = fixture({ $type: 'app.bsky.embed.recordWithMedia',
    record: { $type: 'app.bsky.embed.record', record: { uri: 'at://did:plc:quoted/app.bsky.feed.post/quote' } } });
  assert.deepEqual(translatePost({ ...post, embed: { $type: 'app.bsky.embed.recordWithMedia#view',
    record: { record: { $type: 'app.bsky.embed.record#viewDetached' } } } }).quote, { status: 'unavailable' });
});

test('reports missing posts and upstream failures clearly', async () => {
  const missing = createBlueskyReader(async () => ({ posts: [] }));
  await assert.rejects(missing({ actor: 'did:plc:reporter', rkey: '3abc' }), /unavailable publicly/);
  const offline = createBlueskyReader(async () => { throw new Error('fetch failed'); });
  await assert.rejects(offline({ actor: 'did:plc:reporter', rkey: '3abc' }), /reach Bluesky/);
});
