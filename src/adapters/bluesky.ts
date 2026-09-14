import type { Post, PostReference, QuotedPost } from '../labeling/model.ts';

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function quotedPost(embed: JsonObject, hydrated: JsonObject): QuotedPost {
  const recordEmbed = embed.$type === 'app.bsky.embed.recordWithMedia' ? object(embed.record) : embed;
  if (recordEmbed.$type !== 'app.bsky.embed.record') return null;
  const uri = object(recordEmbed.record).uri;
  const match = typeof uri === 'string'
    ? /^at:\/\/(did:[a-z]+:[a-zA-Z0-9._:%-]+)\/app\.bsky\.feed\.post\/([a-zA-Z0-9_-]+)$/.exec(uri) : null;
  if (!match) return null;
  const view = hydrated.$type === 'app.bsky.embed.recordWithMedia#view'
    ? object(object(hydrated.record).record) : object(hydrated.record);
  if (['app.bsky.embed.record#viewBlocked', 'app.bsky.embed.record#viewDetached',
    'app.bsky.embed.record#viewNotFound'].includes(String(view.$type))) return { status: 'unavailable' };
  return { status: 'referenced', reference: { actor: match[1], rkey: match[2] } };
}

export function translatePost(value: unknown): Post {
  const view = object(value);
  const record = object(view.record);
  const author = object(view.author);
  if (typeof view.uri !== 'string' || typeof record.text !== 'string' || typeof author.handle !== 'string') {
    throw new Error('Bluesky returned an unreadable post.');
  }
  const links: string[] = [];
  for (const facet of Array.isArray(record.facets) ? record.facets : []) {
    const features = object(facet).features;
    for (const feature of Array.isArray(features) ? features : []) {
      const item = object(feature);
      if (item.$type === 'app.bsky.richtext.facet#link' && typeof item.uri === 'string') links.push(item.uri);
    }
  }
  const embed = object(record.embed);
  const media = embed.$type === 'app.bsky.embed.recordWithMedia' ? object(embed.media) : embed;
  if (media.$type === 'app.bsky.embed.external') {
    const external = object(media.external);
    if (typeof external.uri === 'string') links.push(external.uri);
  }
  return { uri: view.uri, text: record.text, author: author.handle, links, quote: quotedPost(embed, object(view.embed)) };
}

export async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
  if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}.`);
  return response.json();
}

export function createBlueskyReader(getJson: (url: string) => Promise<unknown> = fetchJson) {
  return async (reference: PostReference): Promise<Post> => {
    const endpoint = (method: string, key: string, value: string) => {
      const url = new URL(`https://public.api.bsky.app/xrpc/${method}`);
      url.searchParams.set(key, value);
      return url.href;
    };
    let data: JsonObject;
    try {
      let did = reference.actor;
      if (!did.startsWith('did:')) {
        const resolved = object(await getJson(endpoint('com.atproto.identity.resolveHandle', 'handle', did)));
        if (typeof resolved.did !== 'string' || !resolved.did.startsWith('did:')) throw new Error('Handle not found.');
        did = resolved.did;
      }
      const uri = `at://${did}/app.bsky.feed.post/${reference.rkey}`;
      data = object(await getJson(endpoint('app.bsky.feed.getPosts', 'uris', uri)));
    } catch {
      throw new Error('Could not reach Bluesky or resolve this account. Check the URL and try again.');
    }
    if (!Array.isArray(data.posts) || !data.posts.length) {
      throw new Error('This post is unavailable publicly. It may have been deleted or require a login.');
    }
    return translatePost(data.posts[0]);
  };
}
