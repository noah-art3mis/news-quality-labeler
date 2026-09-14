import { parse } from 'csv-parse/sync';
import { webUrl } from '../labeling/model.ts';
import type { RatingSnapshot } from '../labeling/model.ts';

export function parseRatings(csv: string, version: string): RatingSnapshot {
  const rows: { domain: string; pc1: string }[] = parse(csv, { columns: true, skip_empty_lines: true, bom: true });
  const ratings = new Map<string, number>();
  if (!rows.length) throw new Error('Rating CSV is empty.');
  for (const row of rows) {
    if (typeof row.domain !== 'string' || typeof row.pc1 !== 'string') throw new Error('Invalid rating CSV columns.');
    const url = webUrl(`https://${row.domain.trim()}`);
    if (!url || !url.hostname.includes('.') || url.port || url.search || url.hash) throw new Error('Invalid rating domain.');
    const source = url.hostname + url.pathname.replace(/\/$/, '');
    const score = Number(row.pc1);
    if (!row.pc1.trim() || !Number.isFinite(score) || score < 0 || score > 1 || ratings.has(source)) {
      throw new Error(`Invalid or duplicate rating for ${source}.`);
    }
    ratings.set(source, score);
  }
  return { version, ratings };
}
