import { createPublisher } from '../../src/application/publication.ts';
import { openPublicationStore } from '../../src/adapters/publication-store.ts';
import { createPreviewServer } from '../../src/adapters/http.ts';
import { createPreview } from '../../src/application/preview.ts';
import { parseRatings } from '../../src/ratings/snapshot.ts';

const preview = createPreview({
  ratings: parseRatings('domain,pc1\nreuters.com,1\nexample.org/news,0.65\nlow.example,0.2\n', 'a'.repeat(40)),
  async getPost(reference) {
    if (reference.rkey === 'missing') throw new Error('This post is unavailable publicly.');
    if (reference.rkey === 'quoted') return {
      cid: 'bafyreifixture', uri: 'at://did:plc:quote/app.bsky.feed.post/quoted', author: 'quoted.bsky.social', text: 'Another report on the story.',
      links: ['https://www.reuters.com/quoted'],
      quote: { status: 'referenced', reference: { actor: 'did:plc:deeper', rkey: 'deeper' } },
    };
    return { cid: 'bafyreifixture', uri: 'at://did:plc:example/app.bsky.feed.post/example', author: 'reader.bsky.social',
      text: 'Two perspectives on the story. Read the reporting and compare the sources.',
      quote: reference.rkey === 'empty' ? null : { status: 'referenced', reference: { actor: 'did:plc:quote', rkey: 'quoted' } },
      links: reference.rkey === 'empty' ? [] : ['https://www.reuters.com/world/story',
        'https://example.org/news/story', 'https://low.example/story', 'https://unrated.example/story', 'https://bit.ly/unresolved'],
    };
  },
  async resolveDestination() { throw new Error('Timed out'); },
});
const publisher = createPublisher({ preview, store: openPublicationStore(':memory:', 'browser-fixture'), emit: async () => {} });
createPreviewServer(preview, publisher).listen(4318, '127.0.0.1');
