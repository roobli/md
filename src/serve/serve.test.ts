import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyPath } from './fileKinds.js';
import { previewFile } from './preview.js';
import { startServe } from './server.js';
import { buildTree, findDefaultOpen } from './tree.js';

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'notes');

describe('fileKinds', () => {
  it('classifies md / text / image / unsupported', () => {
    expect(classifyPath('a.md')).toBe('markdown');
    expect(classifyPath('a.ts')).toBe('text');
    expect(classifyPath('a.png')).toBe('image');
    expect(classifyPath('a.zip')).toBe('unsupported');
  });
});

describe('buildTree', () => {
  it('lists fixture tree and finds README.md default', async () => {
    const tree = await buildTree(fixturesRoot);
    expect(tree.root).toBe('notes');
    expect(findDefaultOpen(tree.tree)).toBe('README.md');
    const names = tree.tree.map((n) => n.name);
    expect(names).toContain('README.md');
    expect(names).toContain('guides');
    expect(names).not.toContain('node_modules');
  });

  it('skips node_modules when present', async () => {
    const tmp = await fs.mkdtemp(path.join(path.dirname(fixturesRoot), 'tmp-'));
    try {
      await fs.mkdir(path.join(tmp, 'node_modules', 'x'), { recursive: true });
      await fs.writeFile(path.join(tmp, 'node_modules', 'x', 'index.js'), '1');
      await fs.writeFile(path.join(tmp, 'ok.md'), '# ok\n');
      const tree = await buildTree(tmp);
      expect(tree.tree.map((n) => n.name)).toEqual(['ok.md']);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('previewFile', () => {
  it('renders markdown via parseBlocks → HTML', async () => {
    const result = await previewFile(fixturesRoot, 'README.md');
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.kind).toBe('markdown');
    if (result.kind === 'markdown') {
      expect(result.html).toContain('<h1>Fixture README</h1>');
      expect(result.html).toContain('<strong>md serve</strong>');
    }
  });

  it('returns text for .ts', async () => {
    const result = await previewFile(fixturesRoot, 'src/serve.ts');
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.text).toContain('export const x');
      expect(result.badge).toBe('TypeScript');
    }
  });

  it('returns image url for png', async () => {
    const result = await previewFile(fixturesRoot, 'cover.png');
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.kind).toBe('image');
    if (result.kind === 'image') {
      expect(result.url).toBe('/raw/cover.png');
    }
  });

  it('returns unsupported + download for zip', async () => {
    const result = await previewFile(fixturesRoot, 'bin/archive.zip');
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.kind).toBe('unsupported');
    if (result.kind === 'unsupported') {
      expect(result.url).toBe('/raw/bin/archive.zip');
    }
  });

  it('rejects path traversal', async () => {
    const result = await previewFile(fixturesRoot, '../package.json');
    expect(result).toEqual({ error: 'path escapes root', status: 400 });
  });
});

describe('startServe smoke', () => {
  it('binds 127.0.0.1, serves tree + md preview, blocks escape', async () => {
    const handle = await startServe({ root: fixturesRoot, port: 0, host: '127.0.0.1', quiet: true });
    try {
      expect(handle.host).toBe('127.0.0.1');
      expect(handle.port).toBeGreaterThan(0);

      const treeRes = await fetch(`${handle.url}api/tree`);
      expect(treeRes.status).toBe(200);
      const tree = (await treeRes.json()) as { root: string; defaultOpen: string | null };
      expect(tree.root).toBe('notes');
      expect(tree.defaultOpen).toBe('README.md');

      const fileRes = await fetch(`${handle.url}api/file?path=${encodeURIComponent('README.md')}`);
      expect(fileRes.status).toBe(200);
      const file = (await fileRes.json()) as { kind: string; html?: string };
      expect(file.kind).toBe('markdown');
      expect(file.html).toContain('<h1>Fixture README</h1>');

      const shellRes = await fetch(handle.url);
      expect(shellRes.status).toBe(200);
      const html = await shellRes.text();
      expect(html).toContain('md serve');
      expect(html).toContain('只读');
      expect(html).not.toContain('demo-bar');

      const escapeRes = await fetch(`${handle.url}api/file?path=${encodeURIComponent('../package.json')}`);
      expect(escapeRes.status).toBe(400);

      // URL normalizes /raw/../… away from /raw → 404 (still safe)
      const rawNormalized = await fetch(`${handle.url}raw/../package.json`);
      expect(rawNormalized.status).toBe(404);
      // encoded absolute segment still blocked by resolveUnderRoot
      const rawAbs = await fetch(`${handle.url}raw/%2fetc%2fpasswd`);
      expect(rawAbs.status).toBe(400);
    } finally {
      await handle.close();
    }
  });
});
