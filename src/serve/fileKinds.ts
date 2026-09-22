/** Atelier §5 text / code whitelist (plus common siblings). */
const TEXT_EXT = new Set([
  'txt',
  'log',
  'csv',
  'tsv',
  'json',
  'yaml',
  'yml',
  'toml',
  'xml',
  'html',
  'htm',
  'css',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'mts',
  'cts',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'c',
  'h',
  'cpp',
  'hpp',
  'cc',
  'hh',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'bat',
  'cmd',
  'sql',
  'graphql',
  'gql',
  'r',
  'swift',
  'kt',
  'kts',
  'scala',
  'php',
  'lua',
  'vim',
  'ini',
  'cfg',
  'conf',
  'env',
  'gitignore',
  'dockerignore',
  'editorconfig',
  'dockerfile',
  'makefile',
  'cmake',
  'svelte',
  'vue',
  'astro',
  'diff',
  'patch',
  'mdx',
]);

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif']);

const MARKDOWN_EXT = new Set(['md', 'mdx']);

export type PreviewKind = 'markdown' | 'text' | 'image' | 'unsupported';

export function extensionOf(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() ?? '';
  const lower = base.toLowerCase();
  if (lower === 'dockerfile' || lower === 'makefile' || lower === 'cmake') return lower;
  const i = lower.lastIndexOf('.');
  if (i <= 0) return '';
  return lower.slice(i + 1);
}

export function classifyPath(filePath: string): PreviewKind {
  const ext = extensionOf(filePath);
  if (MARKDOWN_EXT.has(ext) || ext === 'md') return 'markdown';
  // mdx is in MARKDOWN_EXT; keep text fallback for odd names
  if (IMAGE_EXT.has(ext)) return 'image';
  if (TEXT_EXT.has(ext)) return 'text';
  // extensionless known texty names
  const base = (filePath.split(/[/\\]/).pop() ?? '').toLowerCase();
  if (base === 'dockerfile' || base === 'makefile' || base === 'license' || base === 'licence') {
    return 'text';
  }
  return 'unsupported';
}

export function badgeFor(kind: PreviewKind, filePath: string): string {
  if (kind === 'markdown') return 'Markdown';
  if (kind === 'image') return 'Image';
  if (kind === 'unsupported') return 'Binary';
  const ext = extensionOf(filePath);
  const map: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript',
    mts: 'TypeScript',
    cts: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript',
    mjs: 'JavaScript',
    cjs: 'JavaScript',
    json: 'JSON',
    yaml: 'YAML',
    yml: 'YAML',
    css: 'CSS',
    html: 'HTML',
    htm: 'HTML',
    py: 'Python',
    rs: 'Rust',
    go: 'Go',
    sh: 'Shell',
    bash: 'Shell',
    zsh: 'Shell',
    txt: 'Text',
    log: 'Log',
    csv: 'CSV',
    tsv: 'TSV',
    toml: 'TOML',
    xml: 'XML',
    md: 'Markdown',
    mdx: 'Markdown',
  };
  return map[ext] ?? (ext ? ext.toUpperCase() : 'Text');
}

export { TEXT_EXT, IMAGE_EXT, MARKDOWN_EXT };
