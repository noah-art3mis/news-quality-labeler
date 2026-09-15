import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { openAutomaticStore } from './automatic-store.ts';
import { startJetstream } from './jetstream.ts';
import { createAutomaticLabeler } from '../application/automatic.ts';
import type { Publisher } from '../application/publication.ts';
import type { Post, PostReference, RatingSnapshot } from '../labeling/model.ts';

export function startAutomaticRuntime(options: {
  stateDir: string; endpoint: string; publisher: Publisher; ratings: RatingSnapshot;
  getPost: (reference: PostReference) => Promise<Post>; resolveDestination: (url: string) => Promise<string>;
}) {
  const queue = openAutomaticStore(join(options.stateDir, 'automatic.db'));
  const automatic = createAutomaticLabeler({ ...options, queue });
  const stream = startJetstream({ endpoint: options.endpoint, cursor: queue.cursor, receive: automatic.receive });
  const stop = new AbortController();
  let processed = 0; let failures = 0; let lastFailure: string | null = null;
  const workers = Array.from({ length: 4 }, async () => {
    while (!stop.signal.aborted) {
      let wait = 100;
      try {
        if (await automatic.processNext()) { processed++; wait = 0; }
      } catch {
        failures++; lastFailure = new Date().toISOString(); wait = 5000;
        console.error('Automatic labeling failed; durable work will retry.');
      }
      // Yield even after success so the stream and operator requests can run.
      await delay(wait, undefined, { signal: stop.signal }).catch(() => {});
    }
  });
  let closing: Promise<void> | undefined;
  return {
    status: () => ({ ...stream.status(), cursor: queue.cursor(), queued: queue.size(), processed, failures, lastFailure }),
    close() {
      return closing ??= (async () => {
        stop.abort(); await stream.close(); await Promise.all(workers); queue.close();
      })();
    },
  };
}
