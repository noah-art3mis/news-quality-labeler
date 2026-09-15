import type { AutomaticStore } from '../automatic/model.ts';
import type { Publisher } from './publication.ts';
import { createPostPreview } from './preview.ts';
import { matchSource } from '../labeling/assess.ts';
import { shorteners } from '../labeling/host-policy.ts';
import { webUrl } from '../labeling/model.ts';
import type { Post, PostReference, RatingSnapshot } from '../labeling/model.ts';
import { decodeJetstreamFrame } from '../adapters/jetstream-frame.ts';

export function createAutomaticLabeler(deps: {
  queue: AutomaticStore; publisher: Publisher; ratings: RatingSnapshot;
  getPost: (reference: PostReference) => Promise<Post>; resolveDestination: (url: string) => Promise<string>;
}) {
  const assess = createPostPreview(deps);
  const active = new Set<string>();
  return {
    receive(frame: string) {
      const { seq, job } = decodeJetstreamFrame(frame);
      if (!job) { deps.queue.accept(seq, null); return; }
      const candidate = job.operation !== 'create' || !job.post || job.post.quote || job.post.links.some(link => {
        const url = webUrl(link);
        return url && (shorteners.has(url.hostname) || matchSource(url, deps.ratings));
      });
      // Even an unlinked revision can withdraw labels attached to an earlier one.
      // Keeping these cheap jobs also avoids maintaining a second publication index.
      deps.queue.accept(job.seq, candidate ? job : null);
    },
    async processNext(): Promise<boolean> {
      const job = deps.queue.next([...active]);
      if (!job) return false;
      active.add(job.uri);
      try {
        const evidence = job.post ? await assess(job.post) : null;
        await deps.publisher.automate(job.uri, job.input, evidence);
        deps.queue.complete(job);
        return true;
      } finally { active.delete(job.uri); }
    },
  };
}
