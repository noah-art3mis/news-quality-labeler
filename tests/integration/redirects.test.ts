import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRedirectResolver, publicAddress, publicUrl } from '../../src/adapters/redirects.ts';

test('resolves relative redirect chains and accepts an inaccessible final article as a known destination', async () => {
  const seen: string[] = [];
  const resolve = createRedirectResolver(async url => {
    seen.push(url.href);
    if (seen.length === 1) return { status: 302, location: '/next' };
    if (seen.length === 2) return { status: 301, location: 'https://publisher.org/article' };
    return { status: 403 };
  });
  assert.equal(await resolve('https://bit.ly/start'), 'https://publisher.org/article');
  assert.deepEqual(seen, ['https://bit.ly/start', 'https://bit.ly/next', 'https://publisher.org/article']);
});

test('fails on loops, missing redirects, and a shortener that does not resolve', async () => {
  await assert.rejects(createRedirectResolver(async () => ({ status: 302, location: '/same' }))('https://bit.ly/same'), /redirect/i);
  await assert.rejects(createRedirectResolver(async () => ({ status: 302 }))('https://bit.ly/a'), /redirect/i);
  await assert.rejects(createRedirectResolver(async () => ({ status: 200 }))('https://bit.ly/a'), /destination/i);
});

test('enforces a hop limit and one time budget for a resolution', async () => {
  let hops = 0;
  const endless = createRedirectResolver(async () => ({ status: 302, location: `/hop${++hops}` }), { maxHops: 2 });
  await assert.rejects(endless('https://bit.ly/a'), /redirect/i);
  assert.equal(hops, 3);
  const slow = createRedirectResolver(async () => new Promise(() => {}), { timeoutMs: 10 });
  await assert.rejects(slow('https://bit.ly/a'), /timed out/i);
});

test('rejects unsafe URL targets and non-public IP addresses, including mapped IPv6', () => {
  for (const url of ['http://localhost/a', 'http://127.1/a', 'http://[::1]/',
    'http://169.254.169.254/', 'https://user:pass@publisher.org/', 'ftp://publisher.org/',
    'https://publisher.org:8443/']) assert.throws(() => publicUrl(url), /public/i);
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.0.1',
    '169.254.169.254', '0.0.0.0', '::1', 'fc00::1', '::ffff:127.0.0.1']) {
    assert.throws(() => publicAddress(ip), /public/i);
  }
  assert.equal(publicAddress('8.8.8.8'), '8.8.8.8');
  assert.equal(publicUrl('https://publisher.org/article').hostname, 'publisher.org');
});

test('rejects redirects to private destinations before making the next request', async () => {
  let calls = 0;
  const resolve = createRedirectResolver(async () => {
    calls++;
    return { status: 302, location: 'http://127.0.0.1/private' };
  });
  await assert.rejects(resolve('https://bit.ly/a'), /public/i);
  assert.equal(calls, 1);
});
