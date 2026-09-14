export type QualityCategory = 'low' | 'medium' | 'high';
export type QualityPolicy = Readonly<{
  id: string;
  provisional: boolean;
  lowBelow: number;
  highFrom: number;
}>;

export const localQualityPolicy: QualityPolicy = Object.freeze({
  id: 'source-quality-v1',
  provisional: true,
  lowBelow: 0.4,
  highFrom: 0.7,
});

export const categoryNames: Readonly<Record<QualityCategory, string>> = {
  low: 'Low quality news source',
  medium: 'Medium quality news source',
  high: 'High quality news source',
};

export function classifyQuality(score: number, policy: QualityPolicy): QualityCategory {
  return score < policy.lowBelow ? 'low' : score < policy.highFrom ? 'medium' : 'high';
}
