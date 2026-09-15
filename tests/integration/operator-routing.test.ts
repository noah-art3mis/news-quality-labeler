import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { createPreviewServer } from '../../src/adapters/http.ts';

test('rejects a malformed raw request target without crashing the operator server', async t => {
  const server = createPreviewServer(async () => { throw new Error('No preview needed'); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const port = (server.address() as { port: number }).port;
  const status = await new Promise<number>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path: '//[', timeout: 500 }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode!));
    });
    req.on('timeout', () => req.destroy(new Error('Operator did not respond')));
    req.on('error', reject); req.end();
  });
  assert.equal(status, 400);
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
});
