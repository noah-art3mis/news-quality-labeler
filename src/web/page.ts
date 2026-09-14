import { webUrl } from '../labeling/model.ts';
import type { Preview, SourceAssessment } from '../labeling/model.ts';

const escape = (value: string | number) => String(value).replace(/[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function sourceResult(source: SourceAssessment): string {
  const rated = source.status === 'rated';
  const title = rated ? 'Source rating' : source.status === 'unmatched' ? 'Not in dataset' : 'Could not resolve destination';
  const score = rated && source.score !== null ? `<div class="rating"><span class="score">${source.score.toFixed(3)}</span><span class="out-of"> / 1</span>
    <meter min="0" max="1" value="${source.score}" aria-label="Source rating for ${escape(source.source)}">${source.score}</meter></div>` : '';
  return `<article class="source">
    <div class="source-heading"><div><p class="eyebrow">${title}</p><h3>${escape(source.source)}</h3></div>${score}</div>
    ${rated ? '<p class="match-note">Matched dataset entry</p>' : ''}
    <ul class="links">${source.links.map(link => {
      const url = webUrl(link.original);
      const label = escape(link.original);
      const anchor = url ? `<a href="${escape(url.href)}" target="_blank" rel="noreferrer">${label}</a>` : `<span>${label}</span>`;
      const destination = link.destination && link.destination !== url?.href
        ? `<span class="destination">Destination: ${escape(link.destination)}</span>` : '';
      return `<li>${anchor}${destination}</li>`;
    }).join('')}</ul>
  </article>`;
}

function assessment(result: Preview): string {
  return `<section class="results" aria-labelledby="results-heading">
    <div class="section-heading"><h2 id="results-heading">Source assessment</h2><span>${result.sources.length} source results</span></div>
    <blockquote><p>${escape(result.post.text)}</p><footer>@${escape(result.post.author)}</footer></blockquote>
    ${result.post.hasQuote ? '<p class="notice">Quoted post links have not been inspected.</p>' : ''}
    ${result.sources.length ? result.sources.map(sourceResult).join('')
      : '<p class="empty-result">No direct links found in this post.</p>'}
    <p class="scope-note">Ratings describe the linked sources. They do not assess this post’s accuracy or the author’s views.</p>
  </section>`;
}

export function renderPage(options: { result?: Preview; error?: string; input?: string } = {}): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>News Quality · Source preview</title><link rel="stylesheet" href="/style.css"><script src="/form.js" defer></script></head>
<body><header class="masthead"><a class="wordmark" href="/">News Quality<span>Source preview</span></a><span class="local">Local preview</span></header>
<main><section class="intro"><p class="eyebrow">A closer look at the source</p><h1>Where does the<br>news come from?</h1>
<p class="lede">Inspect the sources linked in a Bluesky post using published news-domain quality ratings.</p></section>
<form action="/assess" method="post"><label for="post-url">Bluesky post URL</label><div class="input-row">
<input id="post-url" name="postUrl" type="url" required maxlength="2048" autocomplete="off" placeholder="https://bsky.app/profile/…/post/…" value="${escape(options.input ?? '')}" aria-describedby="form-hint${options.error ? ' form-error' : ''}">
<button type="submit">Inspect sources <span aria-hidden="true">↗</span></button></div>
<p id="form-hint" class="hint">Public posts only. No login. No saved assessment history.</p>
<p id="loading" class="hint" role="status" hidden>Inspecting sources… Shortened links may take a moment.</p>
${options.error ? `<p id="form-error" class="error" role="alert">${escape(options.error)}</p>` : ''}</form>
${options.result ? assessment(options.result) : '<div class="initial-note"><span class="rule-number">01 — 02</span><p>Paste a post. See each source’s rating.<br>Unknown sources remain unrated.</p></div>'}
<details class="about"><summary>About these ratings</summary><div class="about-content">
<p>The dataset’s <code>pc1</code> score ranges from 0 (lowest quality) to 1 (highest quality). It combines existing source-rating datasets using imputation and principal component analysis. It is not a probability that an article is true.</p>
<p>Lin, H., Lasser, J., Lewandowsky, S., Cole, R., Gully, A., Rand, D. G., &amp; Pennycook, G. (2023). <a href="https://doi.org/10.1093/pnasnexus/pgad286" target="_blank" rel="noreferrer">High level of correspondence across different news domain quality rating sets</a>. <cite>PNAS Nexus</cite>, 2(9).</p>
<p><a href="https://github.com/hauselin/domain-quality-ratings" target="_blank" rel="noreferrer">Dataset repository</a>${options.result ? ` · <a href="${escape(options.result.snapshot.url)}" target="_blank" rel="noreferrer">Snapshot <code>${escape(options.result.snapshot.version)}</code></a>` : ''}</p>
<p>Exact section and hostname matches take priority. Publisher subdomains may inherit a parent rating within public-suffix boundaries. Known shortened links are expanded; other links are assessed by their URL. Quoted posts are excluded.</p>
<p>This preview does not publish labels to Bluesky. Low, medium, and high quality news source labels are planned for a later stage.</p>
</div></details></main>
<footer class="page-footer"><span>Source context, one post at a time.</span><a href="https://github.com/noah-art3mis/news-quality-labeler" target="_blank" rel="noreferrer">Project on GitHub ↗</a></footer></body></html>`;
}
