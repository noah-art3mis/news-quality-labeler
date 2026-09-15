import type { Post } from '../labeling/model.ts';

export type AutomaticJob = { seq: number; operation: 'create' | 'update' | 'delete'; uri: string; input: string; post: Post | null };
export interface AutomaticStore {
  cursor(): number | null;
  size(): number;
  accept(seq: number, job: AutomaticJob | null): void;
  next(exclude?: string[]): AutomaticJob | null;
  complete(job: AutomaticJob): void;
  close(): void;
}
