import { execFile } from 'node:child_process';
import { request, type IncomingHttpHeaders } from 'node:http';
import { createServer } from 'node:net';

export function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

export interface Reply { status: number; headers: IncomingHttpHeaders; body: string; json: () => any }

export function raw(port: number, opts: { method?: string; path?: string; headers?: Record<string, string>; body?: string | Buffer }): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method: opts.method ?? 'GET', path: opts.path ?? '/', headers: opts.headers }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body, json: () => JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end(opts.body);
  });
}

export const jsonHeaders = (port: number): Record<string, string> => ({
  Host: `127.0.0.1:${port}`,
  Origin: `http://127.0.0.1:${port}`,
  'Content-Type': 'application/json',
});

/** Number of running processes whose command line contains the marker. */
export function pgrep(marker: string): Promise<number> {
  return new Promise((resolve) => {
    execFile('pgrep', ['-f', marker], (_e, out) => resolve(out.split('\n').filter(Boolean).length));
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
