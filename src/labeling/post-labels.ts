import type { SourceAssessment } from './model.ts';
import type { QualityCategory } from './quality-policy.ts';

export function proposePostLabels(sources: readonly SourceAssessment[]): QualityCategory[] {
  const present = new Set(sources.flatMap(source => source.status === 'rated' ? [source.category] : []));
  const order: QualityCategory[] = ['low', 'medium', 'high'];
  return order.filter(category => present.has(category));
}
