import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPublisher } from '../../src/application/publication.ts';
import { createPreview } from '../../src/application/preview.ts';
import { openPublicationStore } from '../../src/adapters/publication-store.ts';

test('existing manual retractions retain their authority after the automatic-publication migration', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'publication-migration-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'labels.db'); let store = openPublicationStore(path, 'test');
  const uri = 'at://did:plc:reader/app.bsky.feed.post/root';
  const input = 'https://bsky.app/profile/did:plc:reader/post/root';
  const preview = createPreview({ ratings: { version: 'test', ratings: new Map([['news.example', 0.9]]) },
    getPost: async () => ({ uri, cid: 'same', author: 'reader.test', text: 'News', links: ['https://news.example/a'], quote: null }),
    resolveDestination: async url => url });
  let publisher = createPublisher({ store, preview, emit: async () => {} });
  const review = await publisher.inspect(input); await publisher.publish(review.id); await publisher.retract(review.id);
  store.close();
  // Represent the deployed ledger, whose decisions predate explicit origin metadata.
  const old = new DatabaseSync(path);
  old.exec("UPDATE operations SET payload=json_remove(payload,'$.origin'); DROP TABLE IF EXISTS publication_migrations"); old.close();
  store = openPublicationStore(path, 'test'); t.after(() => store.close());
  let emitted = 0;
  publisher = createPublisher({ store, preview, emit: async () => { emitted++; } });
  assert.equal(publisher.history()[0].origin, 'manual');
  await publisher.automate(uri, input, await preview(input));
  assert.equal(emitted, 0);
});
