import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocketServer } from 'ws';
import { startJetstream } from '../../src/adapters/jetstream.ts';

async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) { if (check()) return; await delay(10); }
  assert.fail('Timed out waiting for stream state');
}

test('subscribes to posts, reconnects from the durable cursor, and stops without reconnecting', async t => {
  const server = new WebSocketServer({ port: 0 }); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const port = (server.address() as { port: number }).port;
  let cursor: number | null = null; const requests: URL[] = []; const received: string[] = [];
  server.on('connection', (ws, req) => {
    requests.push(new URL(req.url!, `http://localhost:${port}`));
    assert.equal(req.headers['sec-websocket-protocol'], 'xrpc.v1.json');
    if (requests.length === 1) { ws.send('first'); setTimeout(() => ws.close(), 20); }
    else ws.send('second');
  });
  const stream = startJetstream({ endpoint: `ws://127.0.0.1:${port}`, cursor: () => cursor,
    receive(frame) { received.push(frame); cursor = 123; }, retryMs: 10 });
  t.after(() => stream.close());
  await until(() => received.length === 2);
  assert.equal(requests[0].pathname, '/xrpc/network.bsky.jetstream.subscribeEvents');
  assert.equal(requests[0].searchParams.get('collections'), 'app.bsky.feed.post');
  assert.equal(requests[0].searchParams.get('kinds'), 'commit');
  assert.equal(requests[1].searchParams.get('cursor'), '123');
  assert.equal(stream.status().state, 'connected');
  await stream.close(); await delay(30);
  assert.equal(requests.length, 2); assert.equal(stream.status().state, 'stopped');
});

test('a failed queue write closes the connection before later events can advance the cursor', async t => {
  const server = new WebSocketServer({ port: 0 }); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const port = (server.address() as { port: number }).port;
  let attempts = 0;
  server.on('connection', ws => { ws.send('cannot-save'); ws.send('must-not-skip-ahead'); });
  const stream = startJetstream({ endpoint: `ws://127.0.0.1:${port}`, cursor: () => 10,
    receive() { attempts++; throw new Error('disk full'); }, retryMs: 10_000 });
  t.after(() => stream.close());
  await until(() => stream.status().state === 'reconnecting');
  assert.equal(attempts, 1);
  assert.match(stream.status().error!, /accept/i);
});
