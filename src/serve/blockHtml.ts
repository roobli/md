import type { BlockKind } from '../kinds.js';
import type { BlockSpan } from '../types.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Lightweight inline markdown → HTML for read-only serve preview.
 * Ported from Noto.docs dogfood (`blockHtml.ts`). Not a full CommonMark
 * inline parser — primary path stays parseBlocks → spansToHtml.
 */
function inlineToHtml(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(
    /\[([^\]]+)\]\(((?:https?:\/\/|mailto:|\/|#)[^)\s]+)\)/g,
    '<a href="$2" rel="noopener noreferrer">$1</a>',
  );
  s = s.replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, '<em>$1</em>');
  return s;
}

function trimTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s.slice(0, -1) : s;
}

function headingHtml(markdown: string): string {
  const m = markdown.match(/^(#{1,6})\s+(.*)$/s);
  if (!m || m[1] === undefined || m[2] === undefined) {
    return `<p>${inlineToHtml(trimTrailingNewline(markdown))}</p>`;
  }
  const level = m[1].length;
  const body = trimTrailingNewline(m[2]).replace(/\s+#+\s*$/, '');
  return `<h${level}>${inlineToHtml(body)}</h${level}>`;
}

function paragraphHtml(markdown: string): string {
  return `<p>${inlineToHtml(trimTrailingNewline(markdown))}</p>`;
}

function listHtml(kind: BlockKind, markdown: string): string {
  const lines = trimTrailingNewline(markdown).split('\n');
  const items: string[] = [];
  let buf: string[] = [];

  const flush = () => {
    if (!buf.length) return;
    const raw = buf.join('\n');
    let content = raw;
    let checked: boolean | null = null;

    if (kind === 'task-list') {
      const tm = raw.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/s);
      if (tm && tm[1] !== undefined && tm[2] !== undefined) {
        checked = tm[1].toLowerCase() === 'x';
        content = tm[2];
      }
    } else if (kind === 'ordered-list') {
      content = raw.replace(/^\s*\d+[.)]\s+/, '');
    } else {
      content = raw.replace(/^\s*[-*+]\s+/, '');
    }

    const inner = inlineToHtml(content);
    if (checked !== null) {
      items.push(
        `<li class="rmd-task${checked ? ' is-checked' : ''}"><input type="checkbox" disabled${checked ? ' checked' : ''} /> <span>${inner}</span></li>`,
      );
    } else {
      items.push(`<li>${inner}</li>`);
    }
    buf = [];
  };

  const isItemStart = (line: string) => {
    if (kind === 'ordered-list') return /^\s*\d+[.)]\s+/.test(line);
    if (kind === 'task-list') return /^\s*[-*+]\s+\[[ xX]\]\s+/.test(line);
    return /^\s*[-*+]\s+/.test(line);
  };

  for (const line of lines) {
    if (isItemStart(line) && buf.length) flush();
    if (isItemStart(line) || buf.length) buf.push(line);
  }
  flush();

  const tag = kind === 'ordered-list' ? 'ol' : 'ul';
  const cls =
    kind === 'task-list'
      ? ' class="rmd-task-list"'
      : kind === 'bullet-list'
        ? ' class="rmd-bullet-list"'
        : ' class="rmd-ordered-list"';
  return `<${tag}${cls}>${items.join('')}</${tag}>`;
}

function quoteHtml(markdown: string): string {
  const body = trimTrailingNewline(markdown)
    .split('\n')
    .map((line) => line.replace(/^>\s?/, ''))
    .join('\n');
  return `<blockquote><p>${inlineToHtml(body)}</p></blockquote>`;
}

function fencedCodeHtml(markdown: string): string {
  const m = markdown.match(/^```([^\n`]*)\n([\s\S]*?)\n```\s*$/);
  if (!m || m[1] === undefined || m[2] === undefined) {
    return `<pre class="rmd-code"><code>${escapeHtml(trimTrailingNewline(markdown))}</code></pre>`;
  }
  const lang = m[1].trim();
  const code = m[2];
  const langAttr = lang ? ` class="language-${escapeHtml(lang)}" data-lang="${escapeHtml(lang)}"` : '';
  return `<pre class="rmd-code"${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}><code${langAttr}>${escapeHtml(code)}</code></pre>`;
}

function indentedCodeHtml(markdown: string): string {
  const body = trimTrailingNewline(markdown)
    .split('\n')
    .map((line) => line.replace(/^ {4}/, '').replace(/^\t/, ''))
    .join('\n');
  return `<pre class="rmd-code rmd-indented"><code>${escapeHtml(body)}</code></pre>`;
}

function tableHtml(markdown: string): string {
  const lines = trimTrailingNewline(markdown)
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2 || lines[0] === undefined) {
    return `<pre class="rmd-raw">${escapeHtml(markdown)}</pre>`;
  }

  const splitRow = (line: string) => {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split('|').map((c) => c.trim());
  };

  const isDelimiter = (line: string) =>
    /^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$/.test(line) && /---/.test(line);

  const header = splitRow(lines[0]);
  let start = 1;
  if (lines[1] !== undefined && isDelimiter(lines[1])) start = 2;

  const rows = lines.slice(start).map(splitRow);
  const thead = `<thead><tr>${header.map((c) => `<th>${inlineToHtml(c)}</th>`).join('')}</tr></thead>`;
  const tbody = rows.length
    ? `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inlineToHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
    : '';
  return `<div class="rmd-table-wrap"><table>${thead}${tbody}</table></div>`;
}

function displayMathHtml(markdown: string): string {
  const body = trimTrailingNewline(markdown)
    .replace(/^\$\$\s*/, '')
    .replace(/\s*\$\$$/, '');
  return `<pre class="rmd-math" title="Display math"><code>${escapeHtml(body)}</code></pre>`;
}

function frontmatterHtml(markdown: string): string {
  return `<pre class="rmd-frontmatter"><code>${escapeHtml(trimTrailingNewline(markdown))}</code></pre>`;
}

function htmlBlockHtml(markdown: string): string {
  return `<pre class="rmd-html-stub" title="HTML blocks are shown escaped"><code>${escapeHtml(trimTrailingNewline(markdown))}</code></pre>`;
}

function defHtml(kind: 'footnote-definition' | 'link-definition', markdown: string): string {
  return `<p class="rmd-def rmd-${kind}">${inlineToHtml(trimTrailingNewline(markdown))}</p>`;
}

export function blockToHtml(span: BlockSpan): string {
  const { kind, markdown } = span;
  switch (kind) {
    case 'heading':
      return headingHtml(markdown);
    case 'paragraph':
      return paragraphHtml(markdown);
    case 'bullet-list':
    case 'ordered-list':
    case 'task-list':
      return listHtml(kind, markdown);
    case 'quote':
      return quoteHtml(markdown);
    case 'fenced-code':
      return fencedCodeHtml(markdown);
    case 'indented-code':
      return indentedCodeHtml(markdown);
    case 'table':
      return tableHtml(markdown);
    case 'display-math':
      return displayMathHtml(markdown);
    case 'frontmatter':
      return frontmatterHtml(markdown);
    case 'html':
      return htmlBlockHtml(markdown);
    case 'thematic-break':
      return '<hr class="rmd-hr" />';
    case 'footnote-definition':
    case 'link-definition':
      return defHtml(kind, markdown);
    default:
      return `<pre class="rmd-raw" data-kind="${escapeHtml(String(kind))}">${escapeHtml(markdown)}</pre>`;
  }
}

export function spansToHtml(spans: readonly BlockSpan[]): string {
  return spans.map(blockToHtml).join('\n');
}
