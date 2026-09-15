import { fileURLToPath } from 'node:url';
import { readRenderConfiguration } from './deployment/render-config.ts';
import { startRender } from './deployment/render.ts';

try {
  const configuration = readRenderConfiguration(process.env);
  const running = await startRender({ ...configuration, root: fileURLToPath(new URL('../', import.meta.url)) });
  console.log(`News Quality listening on port ${running.port}; mode: ${configuration.publisher ? 'publisher' : 'setup'}.`);
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    try { await running.close(); } catch { console.error('Shutdown failed.'); process.exitCode = 1; }
  });
} catch {
  console.error('Render startup failed. Check the service configuration and persistent disk against docs/render.md.');
  process.exitCode = 1;
}
