import { assessLinks } from '../labeling/assess.ts';
import { proposePostLabels } from '../labeling/post-labels.ts';
import { parsePostUrl, webUrl } from '../labeling/model.ts';
import { shorteners } from '../labeling/host-policy.ts';
import { localQualityPolicy } from '../labeling/quality-policy.ts';
import type { AssessedLink, Post, PostReference, PostSummary, Preview, QuoteInspection, RatingSnapshot } from '../labeling/model.ts';

const summarize = ({ uri, author, text }: Post): PostSummary => ({ uri, author, text });

export function createPreview(deps: {
  ratings: RatingSnapshot;
  getPost: (reference: PostReference) => Promise<Post>;
  resolveDestination: (url: string) => Promise<string>;
}) {
  return async function preview(input: string): Promise<Preview> {
    const post = await deps.getPost(parsePostUrl(input));
    let quote: QuoteInspection = { status: post.quote ? 'unavailable' : 'none' };
    let quoted: Post | null = null;
    if (post.quote?.status === 'referenced') {
      try {
        quoted = await deps.getPost(post.quote.reference);
        quote = { status: 'inspected', post: summarize(quoted), hasFurtherQuote: quoted.quote !== null };
      } catch { /* Preserve direct results when the quote is unavailable. */ }
    }
    const inputs = [
      ...[...new Set(post.links)].map(original => ({ original, origin: 'direct' as const })),
      ...[...new Set(quoted?.links ?? [])].map(original => ({ original, origin: 'quote' as const })),
    ];
    const links: AssessedLink[] = [];
    const destinations = new Map<string, string | null>();
    for (const { original, origin } of inputs) {
      if (destinations.has(original)) {
        links.push({ original, origin, destination: destinations.get(original)! });
        continue;
      }
      const url = webUrl(original);
      let destination = url?.href ?? null;
      if (url && shorteners.has(url.hostname)) {
        try { destination = await deps.resolveDestination(url.href); }
        catch { destination = null; }
      }
      destinations.set(original, destination);
      links.push({ original, destination, origin });
    }
    const sources = assessLinks(links, deps.ratings, localQualityPolicy);
    return {
      post: summarize(post),
      quote,
      snapshot: { version: deps.ratings.version,
        url: `https://github.com/hauselin/domain-quality-ratings/tree/${deps.ratings.version}/data` },
      policy: localQualityPolicy,
      sources,
      postLabels: proposePostLabels(sources),
    };
  };
}
