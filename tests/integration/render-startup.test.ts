import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRenderConfiguration } from '../../src/deployment/render-config.ts';
import { startRender } from '../../src/deployment/render.ts';

const env = { RENDER_EXTERNAL_URL: 'https://news-quality.onrender.com', ADMIN_PASSWORD: 'test-secret-at-least-32-characters-long', PORT: '10000', LABELER_ENABLED: 'false' };

test('starts a protected setup service without a signing key or dataset', async t => {
  const configuration = readRenderConfiguration(env);
  const running = await startRender({ ...configuration, port: 0, root: '/nonexistent-bootstrap-root' });
  t.after(() => running.close());
  const response = await fetch(`http://127.0.0.1:${running.port}/healthz`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'setup-required');
});

test('publisher deployment requires explicit durable storage and rejects malformed configuration', () => {
  for (const changed of [{ PORT: 'not-a-port' }, { LABELER_ENABLED: 'yes' }, { ADMIN_PASSWORD: '' },
    { RENDER_EXTERNAL_URL: 'http://example.org' }, { LABELER_ENABLED: 'true' },
    { LABELER_ENABLED: 'true', LABELER_DID: 'did:plc:example', LABELER_SIGNING_KEY: '01'.repeat(32), LABELER_STATE_DIR: 'relative-data' }]) {
    assert.throws(() => readRenderConfiguration({ ...env, ...changed }));
  }
  const config = readRenderConfiguration({ ...env, LABELER_ENABLED: 'true', LABELER_DID: 'did:plc:example',
    LABELER_SIGNING_KEY: '01'.repeat(32), LABELER_STATE_DIR: '/var/data/news-quality' });
  assert.equal(config.publisher?.stateDir, '/var/data/news-quality');
});

test('enabled Render deployments start automatic labeling by default and can pause it explicitly', () => {
  const enabled = { ...env, LABELER_ENABLED: 'true', LABELER_DID: 'did:plc:example',
    LABELER_SIGNING_KEY: '01'.repeat(32), LABELER_STATE_DIR: '/var/data/news-quality' };
  assert.equal(readRenderConfiguration(enabled).automatic, true);
  assert.equal(readRenderConfiguration({ ...enabled, LABELER_AUTOMATIC: 'false' }).automatic, false);
  assert.equal(readRenderConfiguration(env).automatic, false);
  assert.throws(() => readRenderConfiguration({ ...enabled, LABELER_AUTOMATIC: 'yes' }), /LABELER_AUTOMATIC/);
});
