import { assessLinks } from '../labeling/assess.ts';
import { parsePostUrl, webUrl } from '../labeling/model.ts';
import { shorteners } from '../labeling/host-policy.ts';
import type { Post, PostReference, Preview, RatingSnapshot } from '../labeling/model.ts';

export function createPreview(deps: {
  ratings: RatingSnapshot;
  getPost: (reference: PostReference) => Promise<Post>;
  resolveDestination: (url: string) => Promise<string>;
}) {
  return async function preview(input: string): Promise<Preview> {
    const post = await deps.getPost(parsePostUrl(input));
    const links = [];
    for (const original of new Set(post.links)) {
      const url = webUrl(original);
      let destination = url?.href ?? null;
      if (url && shorteners.has(url.hostname)) {
        try { destination = await deps.resolveDestination(url.href); }
        catch { destination = null; }
      }
      links.push({ original, destination });
    }
    const { links: _, ...summary } = post;
    return {
      post: summary,
      snapshot: { version: deps.ratings.version,
        url: `https://github.com/hauselin/domain-quality-ratings/tree/${deps.ratings.version}/data` },
      sources: assessLinks(links, deps.ratings),
    };
  };
}
