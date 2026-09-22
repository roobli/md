import path from 'node:path';

/**
 * Resolve `rel` under `root`. Returns null when the path would escape the root
 * (including `..` segments and absolute inputs).
 */
export function resolveUnderRoot(root: string, rel: string): string | null {
  if (rel == null) return null;
  const normalizedRel = rel.replace(/\\/g, '/');
  if (normalizedRel.startsWith('/') || /^[a-zA-Z]:/.test(normalizedRel)) {
    return null;
  }
  const rootAbs = path.resolve(root);
  const candidate = path.resolve(rootAbs, normalizedRel);
  const relative = path.relative(rootAbs, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return candidate;
}

/** Posix-style relative path from root for API responses. */
export function toPosixRelative(root: string, absPath: string): string {
  return path.relative(path.resolve(root), absPath).split(path.sep).join('/');
}
