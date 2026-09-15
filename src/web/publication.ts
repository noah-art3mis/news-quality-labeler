import type { Publication, Review } from '../publication/model.ts';
import { categoryNames } from '../labeling/quality-policy.ts';
import { escape } from './html.ts';

export type PublicationPage = { csrf: string; history: Publication[]; currentIds: string[]; review?: Review };
export function renderPublication(page: PublicationPage): string {
  const fields = `<input type="hidden" name="csrf" value="${escape(page.csrf)}">`;
  return `<section class="publication" aria-labelledby="publication-heading"><h2 id="publication-heading">Publication controls</h2>
    <p class="notice">Published decisions and their source evidence are saved locally. Bluesky display must be verified separately.</p>
    ${page.review?.evidence.postLabels.length ? `<form action="/publish" method="post">${fields}
      <input type="hidden" name="reviewId" value="${escape(page.review.id)}">
      <button type="submit">Publish labels</button></form>` : ''}
    <h3>Recent publication history</h3>
    ${page.history.length ? page.history.map(operation => {
      const current = page.currentIds.includes(operation.id);
      const status = operation.status === 'pending' ? 'Pending: retry required. Some labels may already be available.'
        : operation.action === 'retract' ? 'Retraction accepted by labeler service' : 'Published to labeler service';
      const action = current && operation.status === 'pending' ? 'retry'
        : current && operation.target.length ? 'retract' : null;
      return `<div class="publication-entry"><p><strong>${status}</strong></p>
        <p>${escape(operation.evidence.post.author)}: ${escape(operation.evidence.post.text)}</p>
        <p>${operation.target.map(category => categoryNames[category]).join(' · ') || 'No active labels requested'}</p>
        <p class="hint">Delivered ${operation.delivered} of ${operation.events.length} changes. ${current ? 'Latest decision for this post.' : 'Earlier decision.'}</p>
        <details><summary>Saved source evidence</summary><pre>${escape(JSON.stringify(operation.evidence, null, 2))}</pre></details>
        ${action ? `<form action="/${action}" method="post">${fields}<input type="hidden" name="operationId" value="${escape(operation.id)}">
          <button type="submit">${action === 'retry' ? 'Retry publication' : 'Retract labels'}</button></form>` : ''}</div>`;
    }).join('') : '<p>No publication decisions on this page.</p>'}
    <nav aria-label="Publication history"><a href="/">Latest decisions</a>
    ${page.history.length === 100 ? `<a href="/?before=${encodeURIComponent(page.history.at(-1)!.id)}">Older decisions</a>` : ''}</nav>
    </section>`;
}
