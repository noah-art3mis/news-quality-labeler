import { createPublisherRuntime } from './adapters/publisher-runtime.ts';
import { fileURLToPath } from 'node:url';
import { createPreview } from './application/preview.ts';
import { createBlueskyReader } from './adapters/bluesky.ts';
import { createRedirectResolver } from './adapters/redirects.ts';
import { createRatingStore } from './adapters/rating-store.ts';
import { createPreviewServer } from './adapters/http.ts';

let runtime: Awaited<ReturnType<typeof createPublisherRuntime>> | undefined;
try {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const ratings = await createRatingStore(root).loadPinned();
  const preview = createPreview({ ratings, getPost: createBlueskyReader(), resolveDestination: createRedirectResolver() });
  if (process.argv.includes('--publisher')) runtime = await createPublisherRuntime(root, preview);
  const server = createPreviewServer(preview, runtime?.publisher);
  server.on('error', async error => { console.error(error.message); await runtime?.close(); process.exitCode = 1; });
  server.listen(4317, '127.0.0.1', async () => {
    if (runtime) {
      try { await runtime.start(); }
      catch (error) { console.error('Could not start the labeler endpoint.'); server.close(); await runtime.close(); process.exitCode = 1; return; }
    }
    console.log('News Quality is ready at http://localhost:4317');
    console.log(`Using rating snapshot ${ratings.version}. ${runtime ? 'Publisher mode: decisions are saved; public display requires labeler setup.' : 'No assessments are saved.'}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(async () => { await runtime?.close(); }));
} catch (error) {
  await runtime?.close();
  console.error(error instanceof Error ? error.message : 'Could not start the preview.');
  process.exitCode = 1;
}
