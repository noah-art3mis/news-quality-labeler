import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { parseRatings } from '../ratings/snapshot.ts';

type Lock = { version: string; sha256: string };
const repo = 'hauselin/domain-quality-ratings';
const digest = (csv: string) => createHash('sha256').update(csv).digest('hex');

function lockFrom(text: string): Lock {
  const lock = JSON.parse(text);
  if (!/^[a-f0-9]{40}$/.test(lock.version) || !/^[a-f0-9]{64}$/.test(lock.sha256)) {
    throw new Error('Invalid ratings lock.');
  }
  return lock;
}

async function download(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'error',
    headers: { 'User-Agent': 'NewsQualityLocalPreview/0.1' } });
  if (!response.ok) throw new Error(`Dataset download failed: HTTP ${response.status}.`);
  return response.text();
}

export function createRatingStore(root: string, getText = download) {
  const lockPath = join(root, 'data/ratings.lock.json');
  const cache = join(root, '.cache/ratings');
  const candidatePath = join(cache, 'candidate.json');
  const sourceUrl = (version: string) => `https://raw.githubusercontent.com/${repo}/${version}/data/domain_pc1.csv`;
  const cachePath = (lock: Lock) => join(cache, `${lock.sha256}.csv`);

  async function atomicWrite(path: string, text: string) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, text);
    await rename(temporary, path);
  }

  async function materialize(lock: Lock) {
    let csv: string;
    try { csv = await readFile(cachePath(lock), 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      csv = await getText(sourceUrl(lock.version));
    }
    if (digest(csv) !== lock.sha256) throw new Error('Rating snapshot checksum mismatch.');
    const snapshot = parseRatings(csv, lock.version);
    await mkdir(cache, { recursive: true });
    await atomicWrite(cachePath(lock), csv);
    return snapshot;
  }

  async function loadPinned() {
    return materialize(lockFrom(await readFile(lockPath, 'utf8')));
  }

  async function check() {
    const current = await loadPinned();
    const { sha: version } = JSON.parse(await getText(`https://api.github.com/repos/${repo}/commits/main`));
    if (typeof version !== 'string' || !/^[a-f0-9]{40}$/.test(version)) throw new Error('Invalid upstream revision.');
    const csv = await getText(sourceUrl(version));
    const next = parseRatings(csv, version);
    const lock = { version, sha256: digest(csv) };
    await atomicWrite(cachePath(lock), csv);
    await atomicWrite(candidatePath, JSON.stringify(lock, null, 2));
    const changes = [...new Set([...current.ratings.keys(), ...next.ratings.keys()])].sort().flatMap(source => {
      const before = current.ratings.get(source) ?? null;
      const after = next.ratings.get(source) ?? null;
      return before === after ? [] : [{ source, before, after }];
    });
    return { current: current.version, candidate: version, changes };
  }

  async function adopt() {
    const lock = lockFrom(await readFile(candidatePath, 'utf8'));
    await materialize(lock);
    await atomicWrite(lockPath, JSON.stringify(lock, null, 2) + '\n');
    return lock;
  }

  return { loadPinned, check, adopt };
}
