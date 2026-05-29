/** Minimal static server for the example app, used by the e2e test. */
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const APP_HTML = join(here, '..', '..', 'examples', 'buggy-app', 'index.html');

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

export async function startServer(): Promise<TestServer> {
  const html = readFileSync(APP_HTML, 'utf8');
  const server: Server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/' || url.startsWith('/?') || url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (url.startsWith('/api/boom')) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'intentional 500' }));
      return;
    }
    if (url === '/logout') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>Logged out</title><h1>logged out</h1>');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
