import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRatingStore } from '../../src/adapters/rating-store.ts';

test('pins downloads, previews updates without adopting them, and explicitly adopts a verified candidate', async t => {
  const root = await mkdtemp(join(tmpdir(), 'news-quality-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const before = 'domain,pc1\nexample.com,0.4\n';
  const after = 'domain,pc1\nexample.com,0.8\nother.org,0.2\n';
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  await mkdir(join(root, 'data'));
  const lockPath = join(root, 'data/ratings.lock.json');
  await writeFile(lockPath, JSON.stringify({ version: 'a'.repeat(40), sha256: hash(before) }));
  const calls: string[] = [];
  const store = createRatingStore(root, async url => {
    calls.push(url);
    if (url.includes('api.github.com')) return JSON.stringify({ sha: 'b'.repeat(40) });
    return url.includes('a'.repeat(40)) ? before : after;
  });
  assert.equal((await store.loadPinned()).ratings.get('example.com'), 0.4);
  await store.loadPinned();
  assert.equal(calls.length, 1);
  const changes = await store.check();
  assert.deepEqual(changes.changes, [
    { source: 'example.com', before: 0.4, after: 0.8 },
    { source: 'other.org', before: null, after: 0.2 },
  ]);
  assert.equal(JSON.parse(await readFile(lockPath, 'utf8')).version, 'a'.repeat(40));
  await store.adopt();
  assert.equal((await store.loadPinned()).ratings.get('example.com'), 0.8);
  assert.equal(JSON.parse(await readFile(lockPath, 'utf8')).version, 'b'.repeat(40));
});

test('rejects a download that does not match the pinned digest', async t => {
  const root = await mkdtemp(join(tmpdir(), 'news-quality-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'data'));
  await writeFile(join(root, 'data/ratings.lock.json'), JSON.stringify({ version: 'a'.repeat(40), sha256: 'b'.repeat(64) }));
  const store = createRatingStore(root, async () => 'domain,pc1\nexample.com,0.9\n');
  await assert.rejects(store.loadPinned(), /checksum/i);
});
