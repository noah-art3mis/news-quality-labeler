import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBlueskyReader } from '../../src/adapters/bluesky.ts';

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
    record: { record: { uri: 'at://quoted/post', links: ['https://excluded.org'] } },
    media: { $type: 'app.bsky.embed.external', external: { uri: 'https://other.org/card' } },
  });
  const read = createBlueskyReader(async (url) => {
    calls.push(new URL(url));
    return calls.length === 1 ? { did: 'did:plc:reporter' } : { posts: [post] };
  });
  const result = await read({ actor: 'reporter.test', rkey: '3abc' });
  assert.deepEqual(result.links, ['https://example.com/a', 'https://other.org/card']);
  assert.equal(result.hasQuote, true);
  assert.equal(calls[0].searchParams.get('handle'), 'reporter.test');
  assert.deepEqual(calls[1].searchParams.getAll('uris'), [uri]);
  assert.ok(calls.every(url => url.origin === 'https://public.api.bsky.app'));
});

test('accepts DID references and extracts standalone external cards', async () => {
  const read = createBlueskyReader(async () => ({ posts: [fixture({
    $type: 'app.bsky.embed.external', external: { uri: 'https://card.org/a' },
  })] }));
  const result = await read({ actor: 'did:plc:reporter', rkey: '3abc' });
  assert.equal(result.hasQuote, false);
  assert.deepEqual(result.links, ['https://example.com/a', 'https://card.org/a']);
});

test('reports missing posts and upstream failures clearly', async () => {
  const missing = createBlueskyReader(async () => ({ posts: [] }));
  await assert.rejects(missing({ actor: 'did:plc:reporter', rkey: '3abc' }), /unavailable publicly/);
  const offline = createBlueskyReader(async () => { throw new Error('fetch failed'); });
  await assert.rejects(offline({ actor: 'did:plc:reporter', rkey: '3abc' }), /reach Bluesky/);
});
