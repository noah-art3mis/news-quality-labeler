import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreview } from '../../src/application/preview.ts';
import { parseRatings } from '../../src/ratings/snapshot.ts';
import type { Post } from '../../src/labeling/model.ts';

const ratings = parseRatings('domain,pc1\nhigh.example,0.9\nother-high.example,0.8\nmedium.example,0.5\nlow.example,0.2\n', 'a'.repeat(40));
const post = (links: string[], quote: Post['quote'] = null): Post => ({
  uri: 'at://did:plc:reader/app.bsky.feed.post/root', author: 'reader.test', text: 'Reporting', links, quote,
});
const reference = { status: 'referenced', reference: { actor: 'did:plc:quoted', rkey: 'quoted' } } as const;

async function inspect(root: Post, quoted?: Post) {
  const preview = createPreview({ ratings,
    async getPost(ref) {
      if (ref.rkey === 'root') return root;
      if (ref.rkey === 'quoted' && quoted) return quoted;
      throw new Error('Unavailable');
    },
    async resolveDestination() { throw new Error('Unresolved'); },
  });
  return preview('https://bsky.app/profile/reader.test/post/root');
}

test('proposes each category once across direct and quoted sources, in low-to-high order', async () => {
  const result = await inspect(post(['https://high.example/a', 'https://other-high.example/b'], reference),
    post(['https://high.example/a', 'https://low.example/b', 'https://medium.example/c']));
  assert.deepEqual(result.postLabels, ['low', 'medium', 'high']);
  assert.deepEqual(result.sources.find(s => s.source === 'high.example')?.links.map(l => l.origin), ['direct', 'quote']);
});

test('a quote-only article supplies a label to the submitted post without traversing deeper quotes', async () => {
  const result = await inspect(post([], reference), post(['https://high.example/a'], {
    status: 'referenced', reference: { actor: 'did:plc:deeper', rkey: 'deeper' },
  }));
  assert.deepEqual(result.postLabels, ['high']);
  assert.equal(result.quote.status === 'inspected' && result.quote.hasFurtherQuote, true);
});

test('keeps known direct labels when a quote or short link is unavailable', async () => {
  const result = await inspect(post(['https://medium.example/a', 'https://bit.ly/broken', 'https://unknown.example/a'], reference));
  assert.deepEqual(result.postLabels, ['medium']);
  assert.equal(result.quote.status, 'unavailable');
});

test('proposes no labels when there are no rated sources', async () => {
  for (const links of [[], ['https://unknown.example/a', 'https://bit.ly/broken']]) {
    const result = await inspect(post(links));
    assert.deepEqual(result.postLabels, []);
  }
});
