import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { CLIENT_SCRIPT } from './clientScript.js';
import { resolveUnderRoot } from './paths.js';
import { previewFile } from './preview.js';
import { shellHtml } from './shellHtml.js';
import { buildTree, findDefaultOpen } from './tree.js';

export interface ServeOptions {
  readonly root: string;
  readonly port?: number;
  readonly host?: string;
  /** When true, do not print the listen banner (tests). */
  readonly quiet?: boolean;
}

export interface ServeHandle {
  readonly port: number;
  readonly host: string;
  readonly root: string;
  readonly url: string;
  close(): Promise<void>;
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function text(res: http.ServerResponse, status: number, body: string, type: string): void {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function guessMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.json': 'application/json',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.ts': 'text/plain; charset=utf-8',
  };
  return map[ext] ?? 'application/octet-stream';
}

export async function startServe(options: ServeOptions): Promise<ServeHandle> {
  const rootResolved = path.resolve(options.root);
  let rootAbs = rootResolved;
  try {
    const st = await fs.stat(rootResolved);
    if (!st.isDirectory()) {
      throw new Error(`md serve: not a directory: ${rootResolved}`);
    }
    // Pin to realpath so later resolveUnderRoot comparisons match.
    rootAbs = await fs.realpath(rootResolved);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('md serve:')) throw err;
    throw new Error(`md serve: cannot open directory: ${rootResolved}`);
  }

  const host = options.host ?? '127.0.0.1';
  const preferredPort = options.port ?? 4321;
  const rootName = path.basename(rootAbs) || rootAbs;

  const server = http.createServer(async (req, res) => {
    try {
      const method = req.method ?? 'GET';
      if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end('Method Not Allowed');
        return;
      }

      const url = new URL(req.url ?? '/', `http://${host}`);
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === '/' || pathname === '/index.html') {
        text(res, 200, shellHtml(rootName), 'text/html; charset=utf-8');
        return;
      }

      if (pathname === '/app.js') {
        text(res, 200, CLIENT_SCRIPT, 'text/javascript; charset=utf-8');
        return;
      }

      if (pathname === '/api/tree') {
        const tree = await buildTree(rootAbs);
        json(res, 200, {
          ...tree,
          defaultOpen: findDefaultOpen(tree.tree),
        });
        return;
      }

      if (pathname === '/api/file') {
        const rel = url.searchParams.get('path') ?? '';
        const result = await previewFile(rootAbs, rel);
        if ('error' in result) {
          json(res, result.status, { error: result.error });
          return;
        }
        json(res, 200, result);
        return;
      }

      if (pathname.startsWith('/raw/')) {
        const rel = pathname.slice('/raw/'.length);
        const abs = resolveUnderRoot(rootAbs, rel);
        if (!abs) {
          json(res, 400, { error: 'path escapes root' });
          return;
        }
        let data: Buffer;
        try {
          data = await fs.readFile(abs);
        } catch {
          json(res, 404, { error: 'not found' });
          return;
        }
        res.writeHead(200, {
          'Content-Type': guessMime(abs),
          'Cache-Control': 'no-store',
          'Content-Length': data.byteLength,
        });
        if (method === 'HEAD') {
          res.end();
          return;
        }
        res.end(data);
        return;
      }

      json(res, 404, { error: 'not found' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { error: message });
    }
  });

  const port = await new Promise<number>((resolve, reject) => {
    const onError = (err: Error) => {
      server.off('error', onError);
      reject(err);
    };
    server.once('error', onError);
    server.listen(preferredPort, host, () => {
      server.off('error', onError);
      const addr = server.address();
      if (addr && typeof addr === 'object') resolve(addr.port);
      else resolve(preferredPort);
    });
  });

  const url = `http://${host}:${port}/`;
  if (!options.quiet) {
    console.log(`md serve — read-only · ${rootAbs}`);
    console.log(`  ${url}`);
  }

  return {
    port,
    host,
    root: rootAbs,
    url,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
