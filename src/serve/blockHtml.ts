import type { BlockKind } from '../kinds.js';
import type { BlockSpan } from '../types.js';
import { emojiFor } from '../inline/emoji-names.js';
import { ALL_MARK_KINDS, typoraMarkRanges } from '../inline/marks.js';
import { headingSlugs } from '../inline/slug.js';
import { closingTag, isInlineComment, openingTag } from '../inline/tag.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/*
 * Inline markdown to HTML for the read-only preview. Not a full CommonMark
 * inline parser: code spans, links, bold, italic and strikethrough are read
 * by pattern, as before. What Typora draws and CommonMark does not comes
 * from `@roobli/md/inline`, the same readers Noto's editor draws from:
 * `==highlight==`, `^sup^`, `~sub~`, `:emoji:`, and the inline HTML a note
 * colours or sizes its words with, which is read through a closed list and
 * never passed through. Every other tag is shown escaped.
 *
 * Built pieces are held out of the text as placeholders (a NUL, a number,
 * a NUL) while the patterns run, so a pattern never reads inside a code span
 * or a tag it did not write.
 */
const HOLE = /\u0000(\d+)\u0000/g;
const TAG = /<!--[\s\S]*?-->|<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?>/gi;

class Holes {
  private readonly pieces: string[] = [];
  hold(html: string): string {
    this.pieces.push(html);
    return `\u0000${this.pieces.length - 1}\u0000`;
  }
  fill(text: string): string {
    return text.replace(HOLE, (_, index: string) => this.pieces[Number(index)] ?? '');
  }
}

/** A tag a note wrote, as the HTML the preview draws, kept balanced. */
function tagHtml(source: string, open: string[]): string {
  if (isInlineComment(source)) return '';
  const closing = closingTag(source);
  if (closing !== null) {
    // A closing tag with nothing it closes, `</font>` included (drawn as a
    // span), is shown as written.
    const drawn = closing === 'font' ? 'span' : closing;
    const at = open.lastIndexOf(drawn);
    if (at < 0) return escapeHtml(source);
    return open.splice(at).reverse().map((name) => (name === 'a' ? '' : `</${name}>`)).join('');
  }
  const tag = openingTag(source);
  if (tag === null) return escapeHtml(source);
  // `<a id>` is an anchor and draws nothing; `<font>` is drawn as a span.
  if (tag.name === 'a') {
    open.push('a');
    return `<a id="${escapeHtml(tag.anchor ?? '')}"></a>`;
  }
  const name = tag.name === 'font' ? 'span' : tag.name;
  const attributes = [
    tag.style ? ` class="rmd-styled" style="${escapeHtml(tag.style)}"` : '',
    tag.title ? ` title="${escapeHtml(tag.title)}"` : '',
    tag.anchor ? ` id="${escapeHtml(tag.anchor)}"` : '',
  ].join('');
  open.push(name);
  return `<${name}${attributes}>`;
}

const MARK_TAG = { highlight: 'mark', superscript: 'sup', subscript: 'sub' } as const;

/** Typora's marks and emoji over a run of raw text, the rest escaped. */
function marksHtml(text: string, holes: Holes): string {
  let out = '';
  let at = 0;
  for (const range of typoraMarkRanges(text, ALL_MARK_KINDS, emojiFor)) {
    out += escapeHtml(text.slice(at, range.from));
    if (range.kind === 'emoji') {
      out += holes.hold(`<span class="rmd-emoji" title="${escapeHtml(text.slice(range.from, range.to))}">${range.emoji ?? ''}</span>`);
    } else {
      const tag = MARK_TAG[range.kind];
      let inner = '';
      let from = range.innerFrom;
      for (const escape of range.escapes) {
        inner += text.slice(from, escape);
        from = escape + 1;
      }
      inner += text.slice(from, range.innerTo);
      out += `${holes.hold(`<${tag}>`)}${escapeHtml(inner)}${holes.hold(`</${tag}>`)}`;
    }
    at = range.to;
  }
  return out + escapeHtml(text.slice(at));
}

function inlineToHtml(text: string): string {
  const holes = new Holes();
  // Code spans first: nothing inside one is read.
  let s = text.replace(/`([^`\n]+)`/g, (_, code: string) => holes.hold(`<code>${escapeHtml(code)}</code>`));
  const open: string[] = [];
  s = s.replace(TAG, (source) => holes.hold(tagHtml(source, open)));
  s = marksHtml(s, holes);
  s = s.replace(
    /\[([^\]]+)\]\(((?:https?:\/\/|mailto:|\/|#)[^)\s]+)\)/g,
    '<a href="$2" rel="noopener noreferrer">$1</a>',
  );
  // A delimiter opens only before a non-space and closes only after one, as
  // CommonMark has it, so `2 * 3 * 4` is arithmetic and `snake_case` a name.
  s = s.replace(/~~(?=\S)([^~\n]*?\S)~~/g, '<del>$1</del>');
  s = s.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*(?=[^\s*])([^*\n]*?[^\s*])?\*(?!\*)/g, (match, inner: string | undefined) => (inner === undefined ? match : `<em>${inner}</em>`));
  s = s.replace(/(?<![_\w])_(?=\S)([^_\n]*?\S)_(?![_\w])/g, '<em>$1</em>');
  // A tag the line opened and never closed ends with the line.
  return holes.fill(s) + open.reverse().map((name) => (name === 'a' ? '' : `</${name}>`)).join('');
}

function trimTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s.slice(0, -1) : s;
}

function headingParts(markdown: string): { level: number; body: string } | null {
  const m = markdown.match(/^ {0,3}(#{1,6})\s+(.*)$/s);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  return { level: m[1].length, body: trimTrailingNewline(m[2]).replace(/\s+#+\s*$/, '').trim() };
}

function headingHtml(markdown: string, id?: string): string {
  const parts = headingParts(markdown);
  if (!parts) return `<p>${inlineToHtml(trimTrailingNewline(markdown))}</p>`;
  const anchor = id ? ` id="${escapeHtml(id)}"` : '';
  return `<h${parts.level}${anchor}>${inlineToHtml(parts.body)}</h${parts.level}>`;
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

/** One block as HTML; a heading takes `id` when the caller has its slug. */
export function blockToHtml(span: BlockSpan, id?: string): string {
  const { kind, markdown } = span;
  switch (kind) {
    case 'heading':
      return headingHtml(markdown, id);
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

/**
 * A document's blocks as HTML, each heading with GitHub's slug as its id, so
 * a `[link](#heading)` in the note lands where it does on GitHub and Typora.
 */
export function spansToHtml(spans: readonly BlockSpan[]): string {
  const headings = spans.filter((span) => span.kind === 'heading');
  const slugs = headingSlugs(headings.map((span) => headingParts(span.markdown)?.body ?? ''));
  const ids = new Map(headings.map((span, index) => [span, slugs[index]]));
  return spans.map((span) => blockToHtml(span, ids.get(span))).join('\n');
}
