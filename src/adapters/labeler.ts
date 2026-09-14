import { LabelerServer } from '@skyware/labeler';
import type { LabelEvent } from '../publication/model.ts';

export async function createLabelTransport(options: { did: string; signingKey: string; dbPath: string }) {
  const server = new LabelerServer({ ...options, auth: () => false });
  await server.app.ready();
  await server.app.inject({ method: 'GET', url: '/xrpc/com.atproto.label.queryLabels?limit=1' });
  return {
    app: server.app,
    async emit(event: LabelEvent) {
      // The persisted event is the receipt when a crash interrupts acknowledgement.
      const existing = await server.db.execute({
        sql: 'SELECT id FROM labels WHERE src=? AND uri=? AND val=? AND cts=?',
        args: [options.did, event.uri, event.val, event.cts],
      });
      if (!existing.rows.length) await server.createLabel(event);
    },
    start: (port: number) => server.app.listen({ port, host: '127.0.0.1' }),
    async close() { await server.app.close(); server.db.close(); },
  };
}
