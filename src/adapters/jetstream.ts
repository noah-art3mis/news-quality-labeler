import WebSocket from 'ws';
import { setTimeout as delay } from 'node:timers/promises';

export const jetstreamEndpoint = 'wss://jetstream.us-east.bsky.network';
export type StreamStatus = { state: 'connecting' | 'connected' | 'reconnecting' | 'stopped'; error: string | null };

export function startJetstream(options: {
  endpoint: string; cursor: () => number | null; receive: (frame: string) => void; retryMs?: number;
}) {
  const stop = new AbortController();
  let socket: WebSocket | undefined;
  let status: StreamStatus = { state: 'connecting', error: null };
  async function connect() {
    const url = new URL('/xrpc/network.bsky.jetstream.subscribeEvents', options.endpoint);
    url.searchParams.set('collections', 'app.bsky.feed.post');
    url.searchParams.set('kinds', 'commit');
    const cursor = options.cursor();
    if (cursor !== null) url.searchParams.set('cursor', String(cursor));
    await new Promise<void>(resolve => {
      const ws = socket = new WebSocket(url, 'xrpc.v1.json', {
        handshakeTimeout: 10_000, maxPayload: 2 * 1024 * 1024, allowSynchronousEvents: false,
      });
      let accepting = true; let alive = true;
      const heartbeat = setInterval(() => {
        if (!alive) { status.error = 'Jetstream heartbeat timed out.'; ws.terminate(); return; }
        alive = false;
        if (ws.readyState === WebSocket.OPEN) ws.ping();
      }, 30_000);
      ws.on('pong', () => { alive = true; });
      ws.on('open', () => { status = { state: 'connected', error: null }; });
      ws.on('message', (data, binary) => {
        if (!accepting || stop.signal.aborted) return;
        try {
          if (binary) throw new Error('Unexpected binary stream.');
          options.receive(data.toString());
        } catch {
          accepting = false;
          status.error = 'Could not accept a stream event; reconnecting from the durable cursor.';
          ws.terminate();
        }
      });
      ws.on('error', () => { status.error ??= 'Jetstream connection failed; check endpoint and cursor retention.'; });
      ws.on('close', () => { clearInterval(heartbeat); resolve(); });
    });
  }
  const done = (async () => {
    while (!stop.signal.aborted) {
      try { await connect(); }
      catch { status.error = 'Could not start Jetstream connection.'; }
      if (stop.signal.aborted) break;
      status.state = 'reconnecting';
      await delay(options.retryMs ?? 5000, undefined, { signal: stop.signal }).catch(() => {});
    }
    status.state = 'stopped';
  })();
  return { status: () => ({ ...status }), async close() { stop.abort(); socket?.terminate(); await done; } };
}
