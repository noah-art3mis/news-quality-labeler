import type { QualityCategory, QualityPolicy } from './quality-policy.ts';

export type PostReference = { actor: string; rkey: string };
export type QuotedPost = { status: 'referenced'; reference: PostReference } | { status: 'unavailable' } | null;
export type Post = {
  cid: string;
  uri: string;
  author: string;
  text: string;
  links: string[];
  quote: QuotedPost;
};
export type PostSummary = Pick<Post, 'uri' | 'cid' | 'author' | 'text'>;
export type QuoteInspection = { status: 'none' | 'unavailable' }
  | { status: 'inspected'; post: PostSummary; hasFurtherQuote: boolean };
export type AssessedLink = { original: string; destination: string | null; origin: 'direct' | 'quote' };
export type SourceAssessment = {
  source: string;
  links: AssessedLink[];
} & ({ status: 'rated'; score: number; category: QualityCategory }
  | { status: 'unmatched' | 'unresolved'; score: null; category: null });
export type RatingSnapshot = {
  version: string;
  ratings: ReadonlyMap<string, number>;
};
export type Preview = {
  post: PostSummary;
  quote: QuoteInspection;
  snapshot: { version: string; url: string };
  policy: QualityPolicy;
  sources: SourceAssessment[];
  postLabels: QualityCategory[];
};

export function parsePostUrl(input: string): PostReference {
  try {
    const url = new URL(input.trim());
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.protocol !== 'https:' || url.hostname !== 'bsky.app' || url.port ||
        url.username || url.password || parts.length !== 4 ||
        parts[0] !== 'profile' || parts[2] !== 'post') throw new Error();
    const actor = decodeURIComponent(parts[1]);
    const rkey = parts[3];
    if (!/^[a-zA-Z0-9.:%_-]+$/.test(actor) || !/^[a-zA-Z0-9_-]+$/.test(rkey)) throw new Error();
    return { actor, rkey };
  } catch {
    throw new Error('Enter a Bluesky post URL, such as https://bsky.app/profile/handle/post/id.');
  }
}

export function webUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    return url;
  } catch { return null; }
}
