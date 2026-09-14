// Exploratory snapshot analysis; these candidates are not the application's label policy.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRatingStore } from '../src/adapters/rating-store.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshot = await createRatingStore(root).loadPinned();
const entries = [...snapshot.ratings].map(([source, score]) => ({ source, score }));
const scores = entries.map(entry => entry.score).sort((a, b) => a - b);
const quantile = (p: number) => {
  const index = (scores.length - 1) * p;
  const low = Math.floor(index), high = Math.ceil(index);
  return scores[low] + (scores[high] - scores[low]) * (index - low);
};
const category = (score: number, low: number, high: number) => score < low ? 'low' : score < high ? 'medium' : 'high';
const candidates = [
  { name: 'Earlier illustration', low: 0.3, high: 0.7 },
  { name: 'Proposed starting policy', low: 0.4, high: 0.7 },
  { name: 'Stricter high category', low: 0.4, high: 0.8 },
  { name: 'Wider low category', low: 0.5, high: 0.8 },
].map(policy => {
  const counts = { low: 0, medium: 0, high: 0 };
  for (const score of scores) counts[category(score, policy.low, policy.high)]++;
  const percent = Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, count / scores.length * 100]));
  return { ...policy, counts, percent };
});
const exampleNames = [
  'reuters.com', 'apnews.com', 'arstechnica.com', 'npr.org', 'theverge.com', 'bbc.com',
  'nytimes.com', 'propublica.org', 'wired.com', 'washingtonpost.com', 'wsj.com',
  'elpais.com', 'aljazeera.com', 'theguardian.com', 'bbc.co.uk', 'cnn.com', 'nypost.com',
  'msnbc.com', 'huffpost.com', 'foxnews.com', 'dailycaller.com', 'theonion.com',
  'dailykos.com', 'babylonbee.com', 'dailymail.co.uk', 'dailywire.com', 'sputniknews.com',
  'breitbart.com', 'rt.com', 'beforeitsnews.com', 'infowars.com', 'naturalnews.com',
  'globo.com', 'g1.globo.com', 'folha.uol.com.br', 'uol.com.br', 'estadao.com.br', 'eluniversal.com.mx',
];
const examples = exampleNames.map(source => {
  const score = snapshot.ratings.get(source) ?? null;
  return { source, score, proposedCategory: score === null ? 'unmatched' : category(score, 0.4, 0.7) };
});
const sensitivity = [0.4, 0.7].map(cutoff => ({
  cutoff,
  belowWithin0025: scores.filter(score => score >= cutoff - 0.025 && score < cutoff).length,
  aboveWithin0025: scores.filter(score => score >= cutoff && score < cutoff + 0.025).length,
  nearestBelow: entries.filter(e => e.score < cutoff).sort((a, b) => b.score - a.score).slice(0, 5),
  nearestAbove: entries.filter(e => e.score >= cutoff).sort((a, b) => a.score - b.score).slice(0, 5),
}));
const bins = Array.from({ length: 50 }, (_, index) => ({ from: index / 50, to: (index + 1) / 50, count: 0 }));
for (const score of scores) bins[Math.min(49, Math.floor(score * 50))].count++;
const report = {
  version: snapshot.version,
  totalEntries: entries.length,
  sectionEntries: entries.filter(e => e.source.includes('/')).length,
  weighting: 'One vote per dataset entry; not weighted by Bluesky exposure or publisher.',
  quantiles: [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 1].map(p => ({ p, score: quantile(p) })),
  candidates, examples, sensitivity, histogram: bins,
};
await writeFile(new URL('../docs/threshold-analysis.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
const table = (headers: string[], rows: string[][]) => {
  const widths = headers.map((header, i) => Math.max(header.length, ...rows.map(row => row[i].length)));
  const line = (cells: string[]) => '| ' + cells.map((cell, i) => cell.padEnd(widths[i])).join(' | ') + ' |';
  return [line(headers), line(widths.map(width => '-'.repeat(width))), ...rows.map(line)].join('\n');
};
const proposed = candidates[1];
const selected = new Set(['reuters.com', 'apnews.com', 'bbc.com', 'wired.com', 'washingtonpost.com',
  'theguardian.com', 'bbc.co.uk', 'aljazeera.com', 'cnn.com', 'foxnews.com', 'dailycaller.com',
  'dailykos.com', 'dailymail.co.uk', 'dailywire.com', 'breitbart.com', 'infowars.com']);
const candidateTable = table(['Candidate', 'Low below', 'High from', 'Low', 'Medium', 'High'], candidates.map(p =>
  [p.name, p.low.toFixed(2), p.high.toFixed(2), ...(['low', 'medium', 'high'] as const).map(k =>
    `${p.counts[k].toLocaleString('en-US')} (${p.percent[k].toFixed(1)}%)`)]));
const exampleTable = table(['Source entry', 'PC1', 'Proposed category'], examples.filter(e => selected.has(e.source)).map(e =>
  [e.source, e.score!.toFixed(3), e.proposedCategory]));
const sensitivityTable = table(['Cutoff', 'Move down by 0.025', 'Move up by 0.025'], sensitivity.map(s =>
  [s.cutoff.toFixed(2), `${s.belowWithin0025} entries switch`, `${s.aboveWithin0025} entries switch`]));
const reportMarkdown = `# Source-quality threshold analysis

Status: the 0.40 / 0.70 candidate was adopted for local-preview evaluation as provisional project policy \`source-quality-v1\`. It is not a validated public-label policy.

## Recommendation

Start with **Low quality news source: score < 0.40; Medium quality news source: 0.40 ≤ score < 0.70; High quality news source: score ≥ 0.70**. Unmatched and unresolved links remain outside all categories. These cutoffs are our proposed convention, not thresholds supplied by the paper. They leave a broad middle category and use simple, reviewable boundaries. The alternative choices below remain plausible; these calculations do not establish an optimal threshold.

Under this proposal, ${proposed.percent.low.toFixed(1)}% of entries are low, ${proposed.percent.medium.toFixed(1)}% medium, and ${proposed.percent.high.toFixed(1)}% high. This counts dataset entries equally; it is not an estimate of how often Bluesky users would encounter each label.

## Evidence and reproducibility

Computed from [the pinned CSV](https://github.com/hauselin/domain-quality-ratings/blob/${snapshot.version}/data/domain_pc1.csv), revision \`${snapshot.version}\`: **${entries.length.toLocaleString('en-US')} entries**, including **${report.sectionEntries} section entries**. Median score: **${quantile(0.5).toFixed(3)}**. Counts use original scores, never rounded display values. Examples were selected to make consequences legible; they are not an independent validation set.

Run \`node tools/analyze-thresholds.ts\` after \`npm ci\` to regenerate this report and [the machine-readable calculations](threshold-analysis.json). Run \`uv run --no-project --with matplotlib tools/plot-thresholds.py\` to regenerate the chart.

![Score distribution and candidate category shares](threshold-distribution.png)

## Candidate comparison

All policies use low < lower boundary, medium from the lower boundary up to but excluding the upper boundary, and high ≥ upper boundary.

${candidateTable}

The earlier 0.30 / 0.70 illustration gives Daily Mail and Daily Wire a medium category; 0.40 / 0.70 moves them to low. Raising the upper boundary to 0.80 moves The Guardian, Al Jazeera, and bbc.co.uk to medium. Widening low to below 0.50 also moves Daily Caller and Daily Kos to low. These are consequences to decide on, not reasons to tune scores around preferred brands.

## Recognizable examples under the proposal

Scores here are rounded to three decimals for reading. Category assignment uses the full stored value.

${exampleTable}

## Boundary sensitivity

The following counts show how many entries switch if only one boundary moves; the other remains fixed. They measure policy sensitivity, not classification error.

${sensitivityTable}

For example, clinicaltrialsarena.com has score 0.699984811952302 while jamanetwork.com has 0.700002508921952. Both display as 0.700 at three decimals but lie on opposite sides of the proposed high cutoff. The local preview exposes the original score under “Exact score”; a category boundary does not imply a meaningful quality gap.

## What this analysis cannot establish

The [methodology review](threshold-methodology.md) explains why these values are historical ensemble scores rather than current article verdicts, confidence probabilities, or a paper-approved three-band classification. The [pinned commit](https://github.com/hauselin/domain-quality-ratings/commit/${snapshot.version}) dates to September 2023; fetching it today does not refresh its underlying judgments.

The exact entries bbc.com and bbc.co.uk differ (${snapshot.ratings.get('bbc.com')!.toFixed(3)} versus ${snapshot.ratings.get('bbc.co.uk')!.toFixed(3)}). Domain-specific input coverage and imputation matter; this analysis does not infer which score better represents the organization. No per-entry confidence or original-observation count is supplied by the two-column CSV.

The selected checks globo.com, g1.globo.com, folha.uol.com.br, uol.com.br, estadao.com.br, and eluniversal.com.mx have no exact entries in this snapshot. This small coverage check is not a regional audit. Missing sources must remain unmatched rather than medium or low.

The Onion scores ${snapshot.ratings.get('theonion.com')!.toFixed(3)} and Babylon Bee ${snapshot.ratings.get('babylonbee.com')!.toFixed(3)}. The dataset alone does not supply a satire-specific product policy; categories must not be described as fact-checks of individual stories.

## Decision to make

The user approved 0.40 / 0.70 for the **local categorical preview**. The preview keeps the score, matched entry, snapshot, and provisional-policy status visible. Independently validating the categories and deciding mixed-source publication behavior remain separate steps before public label publication.
`;
await writeFile(new URL('../docs/threshold-analysis.md', import.meta.url), reportMarkdown);
console.log(JSON.stringify({ entries: report.totalEntries, candidates, sensitivity }, null, 2));
