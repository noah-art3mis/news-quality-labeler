import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRatings } from '../../src/ratings/snapshot.ts';

test('imports a CSV with quoted domains, CRLF, and zero-valued ratings', () => {
  const snapshot = parseRatings('domain,pc1\r\n"EXAMPLE.COM.",0\r\nother.org,1\r\n', 'a'.repeat(40));
  assert.equal(snapshot.ratings.get('example.com'), 0);
  assert.equal(snapshot.ratings.get('other.org'), 1);
});

test('rejects corrupt rating snapshots instead of making plausible assessments', () => {
  for (const csv of ['domain,pc1\nexample.com,\n', 'domain,pc1\nexample.com,NaN\n',
    'domain,pc1\nexample.com,1.2\n', 'domain,pc1\nexample.com,-1\n',
    'domain,pc1\nexample.com,0.2\nEXAMPLE.COM,0.4\n',
    'domain,wrong\nexample.com,0.4\n', 'domain,pc1\n',
    'domain,pc1\nlocalhost,0.4\n']) {
    assert.throws(() => parseRatings(csv, 'a'.repeat(40)), /rating|domain|CSV/i);
  }
});
