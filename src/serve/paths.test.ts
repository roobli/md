import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveUnderRoot, toPosixRelative } from './paths.js';

describe('resolveUnderRoot', () => {
  const root = path.resolve('/tmp/md-serve-root');

  it('resolves a nested relative path', () => {
    const abs = resolveUnderRoot(root, 'guides/a.md');
    expect(abs).toBe(path.join(root, 'guides', 'a.md'));
  });

  it('blocks .. escape', () => {
    expect(resolveUnderRoot(root, '../secret')).toBeNull();
    expect(resolveUnderRoot(root, 'a/../../secret')).toBeNull();
    expect(resolveUnderRoot(root, '..')).toBeNull();
  });

  it('blocks absolute inputs', () => {
    expect(resolveUnderRoot(root, '/etc/passwd')).toBeNull();
  });

  it('allows the root file itself via empty-ish relative', () => {
    expect(resolveUnderRoot(root, 'README.md')).toBe(path.join(root, 'README.md'));
  });

  it('toPosixRelative uses forward slashes', () => {
    const abs = path.join(root, 'a', 'b.md');
    expect(toPosixRelative(root, abs)).toBe('a/b.md');
  });
});
