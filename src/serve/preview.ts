import fs from 'node:fs/promises';
import path from 'node:path';
import { parseBlocks } from '../parse.js';
import { spansToHtml } from './blockHtml.js';
import { badgeFor, classifyPath } from './fileKinds.js';
import { resolveUnderRoot, toPosixRelative } from './paths.js';

const MAX_TEXT_BYTES = 2 * 1024 * 1024;

export type FilePreview =
  | {
      readonly kind: 'markdown';
      readonly path: string;
      readonly name: string;
      readonly badge: string;
      readonly html: string;
    }
  | {
      readonly kind: 'text';
      readonly path: string;
      readonly name: string;
      readonly badge: string;
      readonly text: string;
    }
  | {
      readonly kind: 'image';
      readonly path: string;
      readonly name: string;
      readonly badge: string;
      readonly url: string;
    }
  | {
      readonly kind: 'unsupported';
      readonly path: string;
      readonly name: string;
      readonly badge: string;
      readonly url: string;
    };

export async function previewFile(root: string, relPath: string): Promise<FilePreview | { error: string; status: number }> {
  const abs = resolveUnderRoot(root, relPath);
  if (!abs) return { error: 'path escapes root', status: 400 };

  let st;
  try {
    st = await fs.stat(abs);
  } catch {
    return { error: 'not found', status: 404 };
  }
  if (!st.isFile()) return { error: 'not a file', status: 400 };

  const posix = toPosixRelative(root, abs);
  const name = path.basename(abs);
  const kind = classifyPath(abs);
  const badge = badgeFor(kind, abs);
  const rawUrl = `/raw/${posix.split('/').map(encodeURIComponent).join('/')}`;

  if (kind === 'image') {
    return { kind: 'image', path: posix, name, badge, url: rawUrl };
  }
  if (kind === 'unsupported') {
    return { kind: 'unsupported', path: posix, name, badge, url: rawUrl };
  }

  if (st.size > MAX_TEXT_BYTES) {
    return {
      kind: 'unsupported',
      path: posix,
      name,
      badge: 'Too large',
      url: rawUrl,
    };
  }

  const buf = await fs.readFile(abs);
  const text = buf.toString('utf8');

  if (kind === 'markdown') {
    const split = parseBlocks(text);
    const html = spansToHtml(split.spans);
    return { kind: 'markdown', path: posix, name, badge, html };
  }

  return { kind: 'text', path: posix, name, badge, text };
}
