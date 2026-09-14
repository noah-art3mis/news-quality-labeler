import { sourceBoundary } from './host-policy.ts';
import { webUrl } from './model.ts';
import type { AssessedLink, RatingSnapshot, SourceAssessment } from './model.ts';

export function matchSource(url: URL, snapshot: RatingSnapshot): { source: string; score: number } | null {
  const host = url.hostname;
  let section = url.pathname.replace(/\/$/, '');
  while (section) {
    const source = host + section;
    const score = snapshot.ratings.get(source);
    if (score !== undefined) return { source, score };
    section = section.slice(0, section.lastIndexOf('/'));
  }
  const boundary = sourceBoundary(host);
  let candidate = host;
  while (candidate) {
    const score = snapshot.ratings.get(candidate);
    if (score !== undefined) return { source: candidate, score };
    if (!boundary || candidate === boundary) break;
    candidate = candidate.slice(candidate.indexOf('.') + 1);
  }
  return null;
}

export function assessLinks(links: AssessedLink[], snapshot: RatingSnapshot): SourceAssessment[] {
  const groups = new Map<string, SourceAssessment>();
  for (const link of links) {
    const url = link.destination ? webUrl(link.destination) : null;
    const match = url ? matchSource(url, snapshot) : null;
    const status = !url ? 'unresolved' : match ? 'rated' : 'unmatched';
    const source = match?.source ?? url?.hostname ?? link.original;
    const key = `${status}:${source}`;
    const group = groups.get(key) ?? { status, source, score: match?.score ?? null, links: [] };
    group.links.push(link);
    groups.set(key, group);
  }
  return [...groups.values()];
}
