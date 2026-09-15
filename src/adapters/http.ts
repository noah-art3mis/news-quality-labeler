import { randomBytes } from 'node:crypto';
import type { Publisher } from '../application/publication.ts';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { renderPage } from '../web/page.ts';
import type { Preview } from '../labeling/model.ts';

export function createPreviewServer(preview: (input: string) => Promise<Preview>, publisher?: Publisher, options: { publicOrigin?: string } = {}) {
  const csrf = randomBytes(24).toString('hex');
  const publicationPage = () => publisher ? { csrf, history: publisher.history() } : undefined;
  const assets = new Map([
    ['/style.css', { type: 'text/css', body: readFileSync(new URL('../web/style.css', import.meta.url)) }],
    ['/form.js', { type: 'text/javascript', body: readFileSync(new URL('../web/form.js', import.meta.url)) }],
  ]);
  let active = 0;
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    const send = (status: number, html: string) => {
      response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html);
    };
    const hosts = options.publicOrigin ? [new URL(options.publicOrigin).host]
      : [`127.0.0.1:${request.socket.localPort}`, `localhost:${request.socket.localPort}`];
    if (!hosts.includes(request.headers.host ?? '')) return send(421, 'Use the local preview address.');
    const origin = options.publicOrigin ?? `http://${request.headers.host}`;
    if (request.headers.origin && request.headers.origin !== origin) return send(403, 'Cross-origin requests are not accepted.');
    if (request.method === 'GET' && request.url === '/') return send(200, renderPage({ publication: publicationPage() }));
    const asset = assets.get(request.url ?? '');
    if (request.method === 'GET' && asset) {
      response.writeHead(200, { 'Content-Type': asset.type });
      response.end(asset.body);
      return;
    }
    if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const mutation = publisher && ['/publish', '/retract', '/retry'].includes(request.url ?? '');
    if (request.method !== 'POST' || (request.url !== '/assess' && !mutation)) return send(404, 'Not found.');
    if (!request.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) return send(415, 'Use the preview form.');
    if (active >= 4) return send(503, renderPage({ error: 'The preview is busy. Please try again in a moment.' }));
    active++;
    let input = '';
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 8192) { send(413, renderPage({ error: 'The submitted URL is too long.' })); return; }
        chunks.push(chunk);
      }
      const form = new URLSearchParams(Buffer.concat(chunks).toString());
      if (mutation) {
        if (request.headers.origin !== origin || form.get('csrf') !== csrf) return send(403, 'Use the private operator page.');
        if (request.url === '/publish') await publisher!.publish(form.get('reviewId') ?? '');
        else if (request.url === '/retract') await publisher!.retract(form.get('operationId') ?? '');
        else await publisher!.retry(form.get('operationId') ?? '');
        return send(200, renderPage({ publication: publicationPage() }));
      }
      input = form.get('postUrl') ?? '';
      if (input.length > 2048) throw new Error('The submitted URL is too long.');
      const review = publisher ? await publisher.inspect(input) : undefined;
      const result = review?.evidence ?? await preview(input);
      send(200, renderPage({ result, input, publication: review ? { ...publicationPage()!, review } : undefined }));
    } catch (error) {
      send(400, renderPage({ error: error instanceof Error ? error.message : 'Could not inspect this post.', input, publication: publicationPage() }));
    } finally { active--; }
  });
}
