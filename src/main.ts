import { fileURLToPath } from 'node:url';
import { createPreview } from './application/preview.ts';
import { createBlueskyReader } from './adapters/bluesky.ts';
import { createRedirectResolver } from './adapters/redirects.ts';
import { createRatingStore } from './adapters/rating-store.ts';
import { createPreviewServer } from './adapters/http.ts';

try {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const ratings = await createRatingStore(root).loadPinned();
  const preview = createPreview({ ratings, getPost: createBlueskyReader(), resolveDestination: createRedirectResolver() });
  const server = createPreviewServer(preview);
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(4317, '127.0.0.1', () => {
    console.log('News Quality is ready at http://localhost:4317');
    console.log(`Using rating snapshot ${ratings.version}. No assessments are saved.`);
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close());
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not start the preview.');
  process.exitCode = 1;
}
