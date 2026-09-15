import { isAbsolute } from 'node:path';
import type { PublisherConfiguration } from '../adapters/publisher-runtime.ts';

export function validateRenderAccess(publicOrigin: string, password: string): URL {
  const origin = new URL(publicOrigin);
  if (origin.protocol !== 'https:') throw new Error('Render requires an HTTPS public origin.');
  if (origin.origin !== publicOrigin) throw new Error('Set the public origin without a path, credentials, query, or trailing slash.');
  if (password.length < 32) throw new Error('ADMIN_PASSWORD must contain at least 32 characters.');
  return origin;
}

export function readRenderConfiguration(env: NodeJS.ProcessEnv) {
  const publicOrigin = env.RENDER_EXTERNAL_URL ?? '';
  const password = env.ADMIN_PASSWORD ?? '';
  validateRenderAccess(publicOrigin, password);
  const port = Number(env.PORT ?? '10000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const enabled = env.LABELER_ENABLED ?? 'false';
  if (!['true', 'false'].includes(enabled)) throw new Error('LABELER_ENABLED must be true or false.');
  let publisher: PublisherConfiguration | undefined;
  if (enabled === 'true') {
    if (!env.LABELER_DID || !env.LABELER_SIGNING_KEY || !env.LABELER_STATE_DIR || !isAbsolute(env.LABELER_STATE_DIR)) {
      throw new Error('Publisher mode requires LABELER_DID, LABELER_SIGNING_KEY, and an absolute LABELER_STATE_DIR on the persistent disk.');
    }
    publisher = { did: env.LABELER_DID, signingKey: env.LABELER_SIGNING_KEY, stateDir: env.LABELER_STATE_DIR };
  }
  return { publicOrigin, password, port, publisher, revision: env.RENDER_GIT_COMMIT ?? 'unknown' };
}
export type RenderConfiguration = ReturnType<typeof readRenderConfiguration>;
