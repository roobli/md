import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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

describe('resolveUnderRoot symlink escape (Linux)', () => {
  let tmp = '';
  let outside = '';

  afterEach(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    if (outside) fs.rmSync(outside, { recursive: true, force: true });
    tmp = '';
    outside = '';
  });

  it('rejects a symlink that points outside the served root', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'md-serve-root-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'md-serve-out-'));
    const secret = path.join(outside, 'secret.txt');
    fs.writeFileSync(secret, 'nope\n');
    fs.symlinkSync(secret, path.join(tmp, 'leak.txt'));

    expect(resolveUnderRoot(tmp, 'leak.txt')).toBeNull();
  });

  it('rejects a symlink directory escape for a missing leaf', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'md-serve-root-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'md-serve-out-'));
    fs.symlinkSync(outside, path.join(tmp, 'out'));

    expect(resolveUnderRoot(tmp, 'out/missing.txt')).toBeNull();
  });

  it('allows a normal file under a real root', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'md-serve-root-'));
    const file = path.join(tmp, 'ok.md');
    fs.writeFileSync(file, '# ok\n');
    expect(resolveUnderRoot(tmp, 'ok.md')).toBe(fs.realpathSync.native(file));
  });
});
