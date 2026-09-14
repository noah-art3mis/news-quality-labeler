import { fileURLToPath } from 'node:url';
import { createRatingStore } from '../src/adapters/rating-store.ts';

const store = createRatingStore(fileURLToPath(new URL('../', import.meta.url)));
try {
  switch (process.argv[2]) {
    case 'fetch': {
      const snapshot = await store.loadPinned();
      console.log(`Ready: ${snapshot.ratings.size} source ratings at ${snapshot.version}.`);
      break;
    }
    case 'check':
      console.log(JSON.stringify(await store.check(), null, 2));
      console.log('Review these changes, then run npm run ratings:adopt to use this revision.');
      break;
    case 'adopt':
      console.log(`Adopted ${(await store.adopt()).version}. Restart the preview to load it.`);
      break;
    default: throw new Error('Use ratings:fetch, ratings:check, or ratings:adopt.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Dataset operation failed.');
  process.exitCode = 1;
}
