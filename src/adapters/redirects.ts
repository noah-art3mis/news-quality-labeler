import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import ipaddr from 'ipaddr.js';
import { webUrl } from '../labeling/model.ts';
import { shorteners } from '../labeling/host-policy.ts';

type HeadResult = { status: number; location?: string };
type ReadHead = (url: URL, signal: AbortSignal) => Promise<HeadResult>;

export function publicAddress(address: string): string {
  if (!ipaddr.isValid(address) || ipaddr.process(address).range() !== 'unicast') {
    throw new Error('Only public internet destinations can be resolved.');
  }
  return address;
}

export function publicUrl(input: string): URL {
  const url = webUrl(input);
  if (!url || url.port || !url.hostname.includes('.') && !url.hostname.includes(':')) {
    throw new Error('Only public HTTP or HTTPS destinations can be resolved.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(hostname)) publicAddress(hostname);
  return url;
}

async function readPublicHead(url: URL, signal: AbortSignal): Promise<HeadResult> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length) throw new Error('No destination address.');
  for (const address of addresses) publicAddress(address.address);
  signal.throwIfAborted();
  const target = addresses[0];
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'HEAD', signal, agent: false, family: target.family,
      // Connect to the validated DNS answer; a second lookup could rebind to a private address.
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
      headers: { 'User-Agent': 'NewsQualityLocalPreview/0.1' },
    }, response => {
      resolve({ status: response.statusCode ?? 0, location: response.headers.location });
      response.destroy();
    });
    request.on('error', reject);
    request.end();
  });
}

export function createRedirectResolver(readHead: ReadHead = readPublicHead,
  options: { maxHops?: number; timeoutMs?: number } = {}) {
  return async (input: string): Promise<string> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Destination resolution timed out.'));
      }, options.timeoutMs ?? 6000);
    });
    const follow = async () => {
      let url = publicUrl(input);
      const visited = new Set<string>();
      for (let hop = 0; hop <= (options.maxHops ?? 5); hop++) {
        controller.signal.throwIfAborted();
        if (visited.has(url.href)) throw new Error('Redirect loop.');
        visited.add(url.href);
        const response = await readHead(url, controller.signal);
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (!response.location) throw new Error('Redirect missing its destination.');
          url = publicUrl(new URL(response.location, url).href);
        } else {
          if (shorteners.has(url.hostname)) throw new Error('Short link did not reveal its destination.');
          return url.href;
        }
      }
      throw new Error('Too many redirects.');
    };
    try { return await Promise.race([follow(), timeout]); }
    finally { clearTimeout(timer!); }
  };
}
