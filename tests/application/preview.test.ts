import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreview } from '../../src/application/preview.ts';
import { parseRatings } from '../../src/ratings/snapshot.ts';

const postUrl = 'https://bsky.app/profile/reporter.test/post/3abc';
const csv = 'domain,pc1\nexample.com,0.8\nnews.example.com,0.6\nother.org,0.2\nblogspot.com,0.9\nauthor.blogspot.com,0.4\n';

function scenario(links: string[], options: { quote?: boolean; csv?: string } = {}) {
  const requests: unknown[] = [];
  const resolved: string[] = [];
  const preview = createPreview({
    ratings: parseRatings(options.csv ?? csv, 'a'.repeat(40)),
    async getPost(ref) {
      requests.push(ref);
      return { uri: 'at://did:plc:author/app.bsky.feed.post/3abc', text: 'A post',
        author: 'reporter.test', links, hasQuote: options.quote ?? false };
    },
    async resolveDestination(url) {
      resolved.push(url);
      if (url.endsWith('/broken')) throw new Error('timeout');
      return 'https://example.com/resolved';
    },
  });
  return { preview, requests, resolved };
}

test('assesses multiple sources independently and groups links by matched source', async () => {
  const { preview } = scenario(['https://www.example.com/a', 'https://example.com/b',
    'https://example.com/b', 'https://other.org/story']);
  const result = await preview(postUrl);
  assert.equal(result.snapshot.version, 'a'.repeat(40));
  assert.deepEqual(result.sources.map(s => [s.status, s.source, s.score]),
    [['rated', 'example.com', 0.8], ['rated', 'other.org', 0.2]]);
  assert.equal(result.sources[0].links.length, 2);
});

test('uses exact ratings before publisher parent ratings and normalizes hostnames', async () => {
  const { preview } = scenario(['https://NEWS.EXAMPLE.COM./story', 'https://edition.example.com/a']);
  const result = await preview(postUrl);
  assert.deepEqual(result.sources.map(s => [s.source, s.score]),
    [['news.example.com', 0.6], ['example.com', 0.8]]);
});

test('does not inherit ratings across private public-suffix boundaries or lookalike hosts', async () => {
  const { preview } = scenario(['https://stranger.blogspot.com/a',
    'https://example.com.evil.org/a', 'https://sub.author.blogspot.com/a']);
  const result = await preview(postUrl);
  assert.deepEqual(result.sources.map(s => s.status), ['unmatched', 'unmatched', 'rated']);
  assert.equal(result.sources[2].source, 'author.blogspot.com');
});

test('keeps independent publishers on shared hosts distinct even when absent from the private suffix list', async () => {
  const { preview } = scenario(['https://writer.substack.com/p/story', 'https://writer.medium.com/story',
    'https://writer.wordpress.com/story', 'https://news.author.substack.com/story'], {
    csv: 'domain,pc1\nsubstack.com,0.8\nmedium.com,0.7\nwordpress.com,0.9\nauthor.substack.com,0.4\n',
  });
  const result = await preview(postUrl);
  assert.deepEqual(result.sources.map(s => s.status), ['unmatched', 'unmatched', 'unmatched', 'rated']);
  assert.equal(result.sources[3].source, 'author.substack.com');
});

test('distinguishes absent ratings from unresolved short links and unsafe URLs', async () => {
  const { preview, resolved } = scenario(['https://unknown.org/a', 'https://bit.ly/broken',
    'https://bit.ly/story', 'javascript:alert(1)']);
  const result = await preview(postUrl);
  assert.deepEqual(result.sources.map(s => s.status), ['unmatched', 'unresolved', 'rated', 'unresolved']);
  assert.equal(result.sources[2].links[0].destination, 'https://example.com/resolved');
  assert.deepEqual(resolved, ['https://bit.ly/broken', 'https://bit.ly/story']);
});

test('preserves quote notice and handles posts with no direct links', async () => {
  const { preview } = scenario([], { quote: true });
  const result = await preview(postUrl);
  assert.equal(result.post.hasQuote, true);
  assert.deepEqual(result.sources, []);
});

test('rejects non-post URLs before accessing Bluesky', async () => {
  const { preview, requests } = scenario([]);
  for (const input of ['hello', 'https://evil.org/profile/a/post/b',
    'https://bsky.app/profile/a', 'https://user:pass@bsky.app/profile/a/post/b']) {
    await assert.rejects(preview(input), /Bluesky post URL/);
  }
  assert.deepEqual(requests, []);
});

test('accepts pasted share URLs with a query without retaining it in the post reference', async () => {
  const { preview, requests } = scenario([]);
  await preview(` ${postUrl}?ref=share `);
  assert.deepEqual(requests, [{ actor: 'reporter.test', rkey: '3abc' }]);
});

test('prefers the most specific section on the same hostname without crossing path boundaries', async () => {
  const { preview } = scenario(['https://example.com/news/local/story', 'https://example.com/news/story',
    'https://example.com/newsletter', 'https://sub.example.com/news/story'], {
    csv: 'domain,pc1\nexample.com,0.5\nexample.com/news,0.8\nexample.com/news/local,0.9\n',
  });
  const result = await preview(postUrl);
  assert.deepEqual(result.sources.map(s => [s.source, s.score]),
    [['example.com/news/local', 0.9], ['example.com/news', 0.8], ['example.com', 0.5]]);
  assert.equal(result.sources[2].links.length, 2);
});
