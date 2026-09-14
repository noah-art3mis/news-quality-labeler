import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Preview } from '../labeling/model.ts';
import { createPublisher } from '../application/publication.ts';
import { openPublicationStore } from './publication-store.ts';
import { createLabelTransport } from './labeler.ts';

export async function createPublisherRuntime(root: string, preview: (input: string) => Promise<Preview>) {
  const did = process.env.LABELER_DID;
  const signingKey = process.env.LABELER_SIGNING_KEY;
  if (!did || !signingKey) throw new Error('Set LABELER_DID and LABELER_SIGNING_KEY locally before starting publisher mode. See docs/publisher-setup.md.');
  const state = process.env.LABELER_STATE_DIR || join(root, '.state');
  await mkdir(state, { recursive: true, mode: 0o700 });
  const identity = createHash('sha256').update(`${did}\n${signingKey}`).digest('hex');
  const store = openPublicationStore(join(state, 'labels.db'), identity);
  try {
    const transport = await createLabelTransport({ did, signingKey, dbPath: join(state, 'labels.db') });
    return { publisher: createPublisher({ preview, store, emit: transport.emit }),
      start: () => transport.start(4319),
      async close() { await transport.close(); store.close(); },
    };
  } catch (error) { store.close(); throw error; }
}
