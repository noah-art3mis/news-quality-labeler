import { translatePost } from './bluesky.ts';
import type { AutomaticJob } from '../automatic/model.ts';

export function decodeJetstreamFrame(frame: string): { seq: number; job: AutomaticJob | null } {
  const envelope = JSON.parse(frame);
  const event = envelope?.payload;
  if (envelope?.$type !== 'message' || event?.$type !== 'network.bsky.jetstream.subscribeEvents#commit' ||
    !Number.isSafeInteger(event.seq) || event.seq < 0 || event.collection !== 'app.bsky.feed.post') {
    throw new Error('Unexpected Jetstream frame; cursor has not advanced.');
  }
  if (typeof event.did !== 'string' || !/^did:[a-z]+:[a-zA-Z0-9._:%-]+$/.test(event.did) ||
    typeof event.rkey !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(event.rkey) ||
    !['create', 'update', 'delete'].includes(event.operation)) {
    return { seq: event.seq, job: null };
  }
  const uri = `at://${event.did}/app.bsky.feed.post/${event.rkey}`;
  try {
    const post = event.operation === 'delete' ? null : translatePost({ uri, cid: event.cid,
      author: { handle: event.did }, record: event.record });
    return { seq: event.seq, job: { seq: event.seq, operation: event.operation, uri,
      input: `https://bsky.app/profile/${event.did}/post/${event.rkey}`, post } };
  } catch { return { seq: event.seq, job: null }; }
}
