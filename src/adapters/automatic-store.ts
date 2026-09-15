import { DatabaseSync } from 'node:sqlite';
import type { AutomaticJob, AutomaticStore } from '../automatic/model.ts';

export function openAutomaticStore(path: string, capacity = 10_000): AutomaticStore {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS stream_cursor (id INTEGER PRIMARY KEY CHECK(id=1), seq INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS automatic_jobs (uri TEXT PRIMARY KEY, seq INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS automatic_order ON automatic_jobs(seq);`);
  const cursor = () => {
    const row = db.prepare('SELECT seq FROM stream_cursor WHERE id=1').get();
    return row ? Number(row.seq) : null;
  };
  let queued = Number(db.prepare('SELECT count(*) AS n FROM automatic_jobs').get()!.n);
  const size = () => queued;
  return { cursor, size,
    accept(seq, job) {
      if (seq <= (cursor() ?? -1)) return;
      db.exec('BEGIN IMMEDIATE');
      try {
        let inserted = false;
        if (job) {
          inserted = !db.prepare('SELECT 1 FROM automatic_jobs WHERE uri=?').get(job.uri);
          if (inserted && queued >= capacity) {
            throw new Error('Automatic queue full; reconnect from the saved cursor after workers catch up.');
          }
          db.prepare(`INSERT INTO automatic_jobs(uri,seq,payload) VALUES (?,?,?)
            ON CONFLICT(uri) DO UPDATE SET seq=excluded.seq,payload=excluded.payload`).run(job.uri, seq, JSON.stringify(job));
        }
        db.prepare('INSERT INTO stream_cursor(id,seq) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET seq=excluded.seq').run(seq);
        db.exec('COMMIT');
        if (inserted) queued++;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    next(exclude = []) {
      const row = db.prepare(`SELECT payload FROM automatic_jobs
        ${exclude.length ? `WHERE uri NOT IN (${exclude.map(() => '?').join(',')})` : ''} ORDER BY seq LIMIT 1`).get(...exclude);
      return row ? JSON.parse(String(row.payload)) as AutomaticJob : null;
    },
    complete(job) {
      const result = db.prepare('DELETE FROM automatic_jobs WHERE uri=? AND seq=?').run(job.uri, job.seq);
      if (result.changes) queued--;
    },
    close: () => db.close(),
  };
}
