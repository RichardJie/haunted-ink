import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

export async function serveStatic(root: string, urlPath: string, res: ServerResponse, headers: Record<string, string>): Promise<boolean> {
  let rel: string;
  try { rel = decodeURIComponent(urlPath.split('?')[0]); } catch { return false; }
  const full = normalize(join(root, rel));
  if (full !== root && !full.startsWith(root + sep)) return false;
  let file = full;
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, 'index.html');
    await stat(file);
  } catch {
    if (extname(rel)) return false;
    file = join(root, 'index.html'); // single-page app fallback
    try { await stat(file); } catch { return false; }
  }
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const cache = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { ...headers, 'Content-Type': type, 'Cache-Control': cache });
  createReadStream(file).pipe(res);
  return true;
}
