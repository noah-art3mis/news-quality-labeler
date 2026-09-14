import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreview } from '../../src/application/preview.ts';
import { parseRatings } from '../../src/ratings/snapshot.ts';

test('classifies full-precision ratings at both cutoffs and keeps missing results uncategorized', async () => {
  const cases = [
    ['zero.example', 0, 'low'],
    ['below-low.example', 0.3999999999999999, 'low'],
    ['at-low.example', 0.4, 'medium'],
    ['below-high.example', 0.6999999999999999, 'medium'],
    ['at-high.example', 0.7, 'high'],
    ['one.example', 1, 'high'],
  ] as const;
  const ratings = parseRatings('domain,pc1\n' + cases.map(([domain, score]) => `${domain},${score}`).join('\n'), 'a'.repeat(40));
  const preview = createPreview({ ratings,
    async getPost() {
      return { cid: 'bafyreifixture', uri: 'at://did:plc:a/app.bsky.feed.post/example', author: 'author.test', text: 'Sources', quote: null,
        links: [...cases.map(([domain]) => `https://${domain}/article`), 'https://unknown.example/a', 'https://bit.ly/broken'] };
    },
    async resolveDestination() { throw new Error('Unresolved'); },
  });
  const result = await preview('https://bsky.app/profile/author.test/post/example');
  assert.deepEqual(result.sources.map(s => [s.status, s.score, s.category]), [
    ...cases.map(([, score, category]) => ['rated', score, category]),
    ['unmatched', null, null], ['unresolved', null, null],
  ]);
  assert.equal(result.policy.id, 'source-quality-v1');
  assert.equal(result.policy.provisional, true);
});
