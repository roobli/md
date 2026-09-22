import fs from 'node:fs/promises';
import path from 'node:path';
import { toPosixRelative } from './paths.js';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.next',
  '.nuxt',
  'dist',
  'coverage',
  '.turbo',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
]);

export interface TreeFileNode {
  readonly type: 'file';
  readonly name: string;
  readonly path: string;
}

export interface TreeDirNode {
  readonly type: 'dir';
  readonly name: string;
  readonly path: string;
  readonly children: readonly TreeNode[];
}

export type TreeNode = TreeFileNode | TreeDirNode;

export interface TreeResponse {
  readonly root: string;
  readonly tree: readonly TreeNode[];
}

async function walkDir(root: string, absDir: string, depth: number): Promise<TreeNode[]> {
  if (depth > 32) return [];
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirs: TreeDirNode[] = [];
  const files: TreeFileNode[] = [];

  for (const ent of entries) {
    if (ent.name.startsWith('.') && ent.name !== '.env.example') {
      // skip most dotfiles/dirs; keep tree clean
      if (ent.isDirectory() || ent.name === '.DS_Store' || ent.name === '.git') continue;
    }
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      const childAbs = path.join(absDir, ent.name);
      const children = await walkDir(root, childAbs, depth + 1);
      dirs.push({
        type: 'dir',
        name: ent.name,
        path: toPosixRelative(root, childAbs),
        children,
      });
    } else if (ent.isFile()) {
      const childAbs = path.join(absDir, ent.name);
      files.push({
        type: 'file',
        name: ent.name,
        path: toPosixRelative(root, childAbs),
      });
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
}

export async function buildTree(root: string): Promise<TreeResponse> {
  const rootAbs = path.resolve(root);
  const tree = await walkDir(rootAbs, rootAbs, 0);
  return {
    root: path.basename(rootAbs) || rootAbs,
    tree,
  };
}

/** Prefer root README.md (case-insensitive), else null. */
export function findDefaultOpen(tree: readonly TreeNode[]): string | null {
  for (const n of tree) {
    if (n.type === 'file' && n.name.toLowerCase() === 'readme.md') return n.path;
  }
  return null;
}
