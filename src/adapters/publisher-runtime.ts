import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Preview } from '../labeling/model.ts';
import { createPublisher } from '../application/publication.ts';
import { openPublicationStore } from './publication-store.ts';
import { createLabelTransport } from './labeler.ts';

export type PublisherConfiguration = { did: string; signingKey: string; stateDir: string };

export async function createPublisherRuntime(configuration: PublisherConfiguration, preview: (input: string) => Promise<Preview>) {
  const { did, signingKey, stateDir: state } = configuration;
  await mkdir(state, { recursive: true, mode: 0o700 });
  const identity = createHash('sha256').update(`${did}\n${signingKey}`).digest('hex');
  const store = openPublicationStore(join(state, 'labels.db'), identity);
  try {
    const transport = await createLabelTransport({ did, signingKey, dbPath: join(state, 'labels.db') });
    return { publisher: createPublisher({ preview, store, emit: transport.emit }),
      start: (port = 4319) => transport.start(port),
      async close() { await transport.close(); store.close(); },
    };
  } catch (error) { store.close(); throw error; }
}
