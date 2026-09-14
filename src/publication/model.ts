import type { Preview } from '../labeling/model.ts';
import type { QualityCategory } from '../labeling/quality-policy.ts';

export const labelValues: Record<QualityCategory, string> = {
  low: 'low-quality-news-source', medium: 'medium-quality-news-source', high: 'high-quality-news-source',
};
export type LabelEvent = { uri: string; cid: string; val: string; neg: boolean; cts: string };
export type Publication = {
  id: string; input: string; evidence: Preview; target: QualityCategory[];
  action: 'publish' | 'retract'; events: LabelEvent[]; delivered: number; status: 'pending' | 'complete';
};
export type Review = { id: string; input: string; evidence: Preview; baseId: string | null; createdAt: number };

export function planPublication(id: string, input: string, evidence: Preview, action: Publication['action'],
  previous: Publication | null, after: number): Publication {
  const target = action === 'publish' ? evidence.postLabels : [];
  const events: LabelEvent[] = [];
  const add = (category: QualityCategory, neg: boolean, post: Preview['post']) => {
    events.push({ uri: post.uri, cid: post.cid, val: labelValues[category], neg,
      cts: new Date(after + events.length + 1).toISOString() });
  };
  const sameRevision = previous?.evidence.post.cid === evidence.post.cid;
  for (const category of previous?.target ?? []) {
    if (!sameRevision || !target.includes(category)) add(category, true, previous!.evidence.post);
  }
  for (const category of target) {
    if (!sameRevision || !previous?.target.includes(category)) add(category, false, evidence.post);
  }
  return { id, input, evidence, target, action, events, delivered: 0, status: events.length ? 'pending' : 'complete' };
}

export interface PublicationStore {
  read(id: string): Publication | null;
  latest(uri: string): Publication | null;
  list(): Publication[];
  lastTimestamp(): number;
  save(operation: Publication): void;
  delivered(id: string): void;
  close(): void;
}
