import fs from 'node:fs';
import path from 'node:path';

function isInsideRoot(rootAbs: string, candidate: string): boolean {
  const relative = path.relative(rootAbs, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Resolve `rel` under `root`. Returns null when the path would escape the root
 * (including `..` segments, absolute inputs, and symlink escapes outside root).
 */
export function resolveUnderRoot(root: string, rel: string): string | null {
  if (rel == null) return null;
  const normalizedRel = rel.replace(/\\/g, '/');
  if (normalizedRel.startsWith('/') || /^[a-zA-Z]:/.test(normalizedRel)) {
    return null;
  }

  const rootResolved = path.resolve(root);
  let rootAbs = rootResolved;
  let rootReal = false;
  try {
    rootAbs = fs.realpathSync.native(rootResolved);
    rootReal = true;
  } catch {
    // Root may not exist in pure unit tests; keep resolved path for lexical checks.
  }

  const candidate = path.resolve(rootAbs, normalizedRel);
  if (!isInsideRoot(rootAbs, candidate)) {
    return null;
  }

  try {
    const real = fs.realpathSync.native(candidate);
    if (!isInsideRoot(rootAbs, real)) {
      return null;
    }
    return real;
  } catch {
    // Candidate does not exist. If we have a real root, ensure the longest
    // existing ancestor stays inside it (blocks symlink-dir → missing leaf).
    if (!rootReal) {
      return candidate;
    }
    let dir = path.dirname(candidate);
    for (;;) {
      try {
        const realDir = fs.realpathSync.native(dir);
        if (!isInsideRoot(rootAbs, realDir)) {
          return null;
        }
        return candidate;
      } catch {
        const parent = path.dirname(dir);
        if (parent === dir) {
          return null;
        }
        dir = parent;
      }
    }
  }
}

/** Posix-style relative path from root for API responses. */
export function toPosixRelative(root: string, absPath: string): string {
  return path.relative(path.resolve(root), absPath).split(path.sep).join('/');
}
