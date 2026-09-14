import { getDomain } from 'tldts';

// Supplements the PSL for publishing platforms whose tenants operate independently.
const publishingPlatforms = ['substack.com', 'medium.com', 'wordpress.com', 'tumblr.com', 'weebly.com'];

export function sourceBoundary(host: string): string | null {
  const platform = publishingPlatforms.find(root => host.endsWith(`.${root}`));
  if (platform) {
    const tenant = host.slice(0, -(platform.length + 1)).split('.').at(-1);
    return `${tenant}.${platform}`;
  }
  return getDomain(host, { allowPrivateDomains: true });
}

export const shorteners = new Set([
  'bit.ly', 't.co', 'tinyurl.com', 'ow.ly', 'buff.ly', 'trib.al', 'dlvr.it',
  'ift.tt', 'goo.gl', 'is.gd', 'lnkd.in', 'reut.rs', 'wapo.st', 'nyti.ms',
  'bbc.in', 'aje.io', 'on.ft.com', 'apne.ws', 'cnb.cx', 'cnn.it', 'n.pr',
]);
