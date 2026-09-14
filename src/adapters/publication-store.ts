import { DatabaseSync } from 'node:sqlite';
import type { Publication, PublicationStore } from '../publication/model.ts';

export function openPublicationStore(path: string, identity: string): PublicationStore {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS identity (value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS operations (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
      uri TEXT NOT NULL, payload TEXT NOT NULL);`);
  const savedIdentity = db.prepare('SELECT value FROM identity').get();
  if (savedIdentity && savedIdentity.value !== identity) {
    db.close();
    throw new Error('Publication database belongs to a different labeler identity.');
  }
  if (!savedIdentity) db.prepare('INSERT INTO identity(value) VALUES (?)').run(identity);
  const parse = (row: Record<string, unknown> | undefined) => row ? JSON.parse(String(row.payload)) as Publication : null;
  const read = (id: string) => parse(db.prepare('SELECT payload FROM operations WHERE id=?').get(id));
  const latest = (uri: string) => parse(db.prepare('SELECT payload FROM operations WHERE uri=? ORDER BY seq DESC LIMIT 1').get(uri));
  return {
    read, latest,
    list: () => db.prepare('SELECT payload FROM operations ORDER BY seq DESC').all().map(row => parse(row)!),
    lastTimestamp: () => {
      const row = db.prepare("SELECT MAX(json_extract(payload, '$.events[#-1].cts')) AS latest FROM operations").get();
      return row?.latest ? Date.parse(String(row.latest)) : 0;
    },
    save(operation: Publication) {
      db.prepare('INSERT INTO operations(id,uri,payload) VALUES (?,?,?)').run(operation.id, operation.evidence.post.uri, JSON.stringify(operation));
    },
    delivered(id: string) {
      const operation = read(id)!;
      operation.delivered++;
      operation.status = operation.delivered === operation.events.length ? 'complete' : 'pending';
      db.prepare('UPDATE operations SET payload=? WHERE id=?').run(JSON.stringify(operation), id);
    },
    close: () => db.close(),
  };
}
