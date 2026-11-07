import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { createHealthProbe, createKiroRunner, type AgentName } from './kiro/runner.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.HAUNTED_INK_PORT ?? 4317);
const dev = process.env.NODE_ENV !== 'production';

function loadAgent(name: AgentName): string {
  const json = readFileSync(join(root, `.kiro/agents/${name}.json`), 'utf8');
  const agent = JSON.parse(json) as { tools?: unknown[]; mcpServers?: object };
  if ((agent.tools?.length ?? 0) !== 0 || Object.keys(agent.mcpServers ?? {}).length) {
    console.error(`The ${name} agent must have no tools and no MCP servers. Refusing to start.`);
    process.exit(1);
  }
  return json;
}
const reviserJson = loadAgent('haunted-ink-reviser');
const editorJson = loadAgent('haunted-ink-editor');

let vite: Awaited<ReturnType<(typeof import('vite'))['createServer']>> | undefined;
if (dev) {
  const { createServer } = await import('vite');
  vite = await createServer({ root, server: { middlewareMode: true, hmr: { port: port + 1, host: '127.0.0.1' } }, appType: 'spa' });
}

const app = createApp({
  port,
  dev,
  run: {
    reviser: createKiroRunner({ agentName: 'haunted-ink-reviser', agentJson: reviserJson }),
    editor: createKiroRunner({ agentName: 'haunted-ink-editor', agentJson: editorJson }),
  },
  health: createHealthProbe(),
  staticRoot: dev ? undefined : join(root, 'dist'),
  vite: vite ? (req, res, next) => vite!.middlewares(req, res, next) : undefined,
});

app.server.on('error', (e: NodeJS.ErrnoException) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${port} is in use. Set HAUNTED_INK_PORT to another port.` : e.message);
  process.exit(1);
});
app.server.listen(port, '127.0.0.1', () => {
  console.log(`Haunted Ink listening on http://127.0.0.1:${port} (${dev ? 'development' : 'production'})`);
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  app.server.close();
  await app.shutdown();
  await vite?.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
