import { randomUUID } from 'node:crypto';
import type { Preview } from '../labeling/model.ts';
import { planPublication } from '../publication/model.ts';
import type { LabelEvent, Review, PublicationStore } from '../publication/model.ts';

export function createPublisher(deps: {
  preview: (input: string) => Promise<Preview>; store: PublicationStore;
  emit: (event: LabelEvent) => Promise<void>; now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  const reviews = new Map<string, Review>();
  const { store } = deps;
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  }
  async function deliver(id: string) {
    const operation = store.read(id);
    if (!operation) throw new Error('Publication not found.');
    for (const event of operation.events.slice(operation.delivered)) {
      try {
        await deps.emit(event);
        store.delivered(id);
      } catch { break; }
    }
    return store.read(id)!;
  }
  return {
    automate: (uri: string, input: string, evidence: Preview | null) => serial(async () => {
      let previous = store.latest(uri);
      if (previous?.status === 'pending') {
        previous = await deliver(previous.id);
        if (previous.status === 'pending') throw new Error('Automatic publication pending; delivery will retry.');
      }
      // An operator's retraction suppresses replay; automatic deletion permits recreation.
      if (evidence && previous?.evidence.post.cid === evidence.post.cid &&
        (previous.origin === 'manual' || previous.action === 'publish')) return;
      if (!evidence && !previous?.target.length) return;
      if (evidence && !evidence.postLabels.length && !previous?.target.length) return;
      const operation = planPublication(randomUUID(), input, evidence ?? previous!.evidence,
        evidence ? 'publish' : 'retract', previous, Math.max(now().getTime(), store.lastTimestamp()), 'automatic');
      store.save(operation);
      if ((await deliver(operation.id)).status === 'pending') throw new Error('Automatic publication pending; delivery will retry.');
    }),
    async inspect(input: string): Promise<Review> {
      const evidence = await deps.preview(input);
      const review = { id: randomUUID(), input, evidence,
        baseId: store.latest(evidence.post.uri)?.id ?? null, createdAt: now().getTime() };
      reviews.set(review.id, review);
      while (reviews.size > 100) reviews.delete(reviews.keys().next().value!);
      return review;
    },
    publish: (id: string) => serial(async () => {
      if (store.read(id)) return deliver(id);
      const review = reviews.get(id);
      if (!review || now().getTime() - review.createdAt > 15 * 60_000) throw new Error('Review unavailable; inspect again.');
      if (!review.evidence.postLabels.length) throw new Error('No labels to publish.');
      const previous = store.latest(review.evidence.post.uri);
      if (previous?.status === 'pending') throw new Error('Retry the pending publication before making another decision.');
      if ((previous?.id ?? null) !== review.baseId ||
        JSON.stringify(await deps.preview(review.input)) !== JSON.stringify(review.evidence)) {
        throw new Error('The post, source evidence, or publication decision changed; inspect again.');
      }
      const operation = planPublication(id, review.input, review.evidence, 'publish', previous,
        Math.max(now().getTime(), store.lastTimestamp()), 'manual');
      store.save(operation);
      return deliver(id);
    }),
    retract: (id: string) => serial(async () => {
      const retractionId = `retract-${id}`;
      if (store.read(retractionId)) return deliver(retractionId);
      const previous = store.read(id);
      if (!previous || store.latest(previous.evidence.post.uri)?.id !== id) {
        throw new Error('The publication decision changed; inspect again.');
      }
      if (previous.status === 'pending') throw new Error('Retry the pending publication before retracting it.');
      const operation = planPublication(retractionId, previous.input, previous.evidence, 'retract', previous,
        Math.max(now().getTime(), store.lastTimestamp()), 'manual');
      store.save(operation);
      return deliver(operation.id);
    }),
    retry: (id: string) => serial(() => deliver(id)),
    history: (before?: string) => store.list(before),
    currentId: (uri: string) => store.latest(uri)?.id,
  };
}
export type Publisher = ReturnType<typeof createPublisher>;
