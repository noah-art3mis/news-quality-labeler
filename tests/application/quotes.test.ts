import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreview } from '../../src/application/preview.ts';
import { parseRatings } from '../../src/ratings/snapshot.ts';

const quoteRef = { actor: 'did:plc:quoted', rkey: 'quote' };
const root = { uri: 'at://did:plc:root/app.bsky.feed.post/root', author: 'root.test', text: 'A quote',
  links: [] as string[], quote: { status: 'referenced' as const, reference: quoteRef } };
const quoted = { uri: 'at://did:plc:quoted/app.bsky.feed.post/quote', author: 'quoted.test', text: 'An article',
  links: ['https://bit.ly/article'], quote: { status: 'referenced' as const,
    reference: { actor: 'did:plc:deeper', rkey: 'deeper' } } };
const ratings = parseRatings('domain,pc1\nexample.com,0.8\n', 'a'.repeat(40));
const url = 'https://bsky.app/profile/root.test/post/root';

test('assesses an article in a quote with provenance and stops before a second quote level', async () => {
  const requested: string[] = [];
  const preview = createPreview({ ratings,
    async getPost(ref) { requested.push(ref.rkey); return ref.rkey === 'root' ? root : quoted; },
    async resolveDestination() { return 'https://example.com/article'; },
  });
  const result = await preview(url);
  assert.deepEqual(requested, ['root', 'quote']);
  assert.equal(result.sources[0].source, 'example.com');
  assert.equal(result.sources[0].links[0].origin, 'quote');
  assert.equal(result.quote.status, 'inspected');
  if (result.quote.status === 'inspected') {
    assert.equal(result.quote.post.author, 'quoted.test');
    assert.equal(result.quote.hasFurtherQuote, true);
  }
});

test('groups a shared source while preserving direct and quoted link origins', async () => {
  const preview = createPreview({ ratings,
    async getPost(ref) { return ref.rkey === 'root'
      ? { ...root, links: ['https://example.com/article'] }
      : { ...quoted, links: ['https://example.com/article'], quote: null }; },
    async resolveDestination(url) { return url; },
  });
  const result = await preview(url);
  assert.equal(result.sources.length, 1);
  assert.deepEqual(result.sources[0].links.map(link => link.origin), ['direct', 'quote']);
});

test('retains direct results when the quoted post cannot be fetched', async () => {
  const preview = createPreview({ ratings,
    async getPost(ref) {
      if (ref.rkey === 'quote') throw new Error('Unavailable');
      return { ...root, links: ['https://example.com/article'] };
    },
    async resolveDestination(url) { return url; },
  });
  const result = await preview(url);
  assert.equal(result.quote.status, 'unavailable');
  assert.equal(result.sources[0].score, 0.8);
});

test('does not fetch a quote that Bluesky marks unavailable', async () => {
  let reads = 0;
  const preview = createPreview({ ratings,
    async getPost() { reads++; return { ...root, quote: { status: 'unavailable' as const } }; },
    async resolveDestination(url) { return url; },
  });
  const result = await preview(url);
  assert.equal(reads, 1);
  assert.equal(result.quote.status, 'unavailable');
  assert.deepEqual(result.sources, []);
});
