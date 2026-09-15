import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { createRenderGateway } from '../adapters/render-gateway.ts';
import { createPreviewServer } from '../adapters/http.ts';
import { createPublisherRuntime } from '../adapters/publisher-runtime.ts';
import { createRatingStore } from '../adapters/rating-store.ts';
import { createBlueskyReader } from '../adapters/bluesky.ts';
import { createRedirectResolver } from '../adapters/redirects.ts';
import { createPreview } from '../application/preview.ts';
import { validateRenderAccess } from './render-config.ts';
import type { RenderConfiguration } from './render-config.ts';
import { startAutomaticRuntime } from '../adapters/automatic-runtime.ts';
import { jetstreamEndpoint } from '../adapters/jetstream.ts';

export async function startRender(options: RenderConfiguration & { root: string }) {
  validateRenderAccess(options.publicOrigin, options.password);
  let runtime: Awaited<ReturnType<typeof createPublisherRuntime>> | undefined;
  let operator: Server | undefined;
  let gateway: ReturnType<typeof createRenderGateway> | undefined;
  let automatic: ReturnType<typeof startAutomaticRuntime> | undefined;
  async function close() {
    await automatic?.close();
    if (gateway?.server.listening) await gateway.close();
    if (operator?.listening) await new Promise<void>((resolve, reject) => operator!.close(error => error ? reject(error) : resolve()));
    await runtime?.close();
  }
  try {
    let labelerTarget: string | undefined;
    if (options.publisher) {
      const ratings = await createRatingStore(options.root).loadPinned();
      const assessment = { ratings, getPost: createBlueskyReader(), resolveDestination: createRedirectResolver() };
      const preview = createPreview(assessment);
      runtime = await createPublisherRuntime(options.publisher, preview);
      labelerTarget = await runtime.start(0);
      operator = createPreviewServer(preview, runtime.publisher, { publicOrigin: options.publicOrigin });
      if (options.automatic) automatic = startAutomaticRuntime({ ...assessment,
        stateDir: options.publisher.stateDir, publisher: runtime.publisher, endpoint: jetstreamEndpoint });
    } else {
      operator = createServer((_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
        response.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>News Quality setup</title><h1>News Quality setup</h1><p>The service is running. Label publication is disabled.</p><p>Use this service’s HTTPS address for labeler registration. Then add the signing key in Render and set LABELER_ENABLED to true.</p><p>Follow <a href="https://github.com/noah-art3mis/news-quality-labeler/blob/main/docs/render.md">the Render setup guide</a>.</p></html>');
      });
    }
    operator.listen(0, '127.0.0.1'); await once(operator, 'listening');
    const address = operator.address() as { port: number };
    gateway = createRenderGateway({ ...options, operatorTarget: `http://127.0.0.1:${address.port}`, labelerTarget,
      automaticStatus: automatic?.status });
    gateway.server.listen(options.port, '0.0.0.0'); await once(gateway.server, 'listening');
    return { port: (gateway.server.address() as { port: number }).port, close };
  } catch (error) { await close(); throw error; }
}
