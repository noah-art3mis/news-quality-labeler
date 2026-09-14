import { createPreviewServer } from '../../src/adapters/http.ts';
import { createPreview } from '../../src/application/preview.ts';
import { parseRatings } from '../../src/ratings/snapshot.ts';

const preview = createPreview({
  ratings: parseRatings('domain,pc1\nreuters.com,1\nexample.org/news,0.65\n', 'a'.repeat(40)),
  async getPost(reference) {
    if (reference.rkey === 'missing') throw new Error('This post is unavailable publicly.');
    return { uri: 'at://did:plc:example/app.bsky.feed.post/example', author: 'reader.bsky.social',
      text: 'Two perspectives on the story. Read the reporting and compare the sources.',
      hasQuote: true,
      links: reference.rkey === 'empty' ? [] : ['https://www.reuters.com/world/story',
        'https://example.org/news/story', 'https://unrated.example/story', 'https://bit.ly/unresolved'],
    };
  },
  async resolveDestination() { throw new Error('Timed out'); },
});
createPreviewServer(preview).listen(4318, '127.0.0.1');
