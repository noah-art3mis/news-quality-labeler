import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { startAutomaticRuntime } from '../../src/adapters/automatic-runtime.ts';
import { createPublisher } from '../../src/application/publication.ts';
import { openPublicationStore } from '../../src/adapters/publication-store.ts';
import type { LabelEvent } from '../../src/publication/model.ts';

test('runs stream intake and workers together, persists delivery, and closes all background work', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'automatic-runtime-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const server = new WebSocketServer({ port: 0 }); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const store = openPublicationStore(join(dir, 'labels.db'), 'test'); t.after(() => store.close());
  const sent: LabelEvent[] = [];
  const publisher = createPublisher({ store, preview: async () => { throw new Error('Manual preview not needed'); }, emit: async event => { sent.push(event); } });
  server.on('connection', ws => ws.send(JSON.stringify({ $type: 'message', payload: {
    $type: 'network.bsky.jetstream.subscribeEvents#commit', seq: 123, did: 'did:plc:reader',
    collection: 'app.bsky.feed.post', operation: 'create', rkey: 'root', cid: 'cid-123',
    record: { text: 'News', embed: { $type: 'app.bsky.embed.external', external: { uri: 'https://news.example/article' } } } } })));
  const runtime = startAutomaticRuntime({ stateDir: dir, endpoint: `ws://127.0.0.1:${(server.address() as { port: number }).port}`,
    publisher, ratings: { version: 'test', ratings: new Map([['news.example', 0.9]]) },
    getPost: async () => { throw new Error('Direct stream posts require no API read'); }, resolveDestination: async url => url });
  t.after(() => runtime.close());
  for (let i = 0; i < 100 && sent.length === 0; i++) await delay(10);
  assert.equal(sent.length, 1);
  assert.equal(runtime.status().cursor, 123);
  assert.equal(runtime.status().queued, 0);
  assert.equal(runtime.status().processed, 1);
  await runtime.close();
});
