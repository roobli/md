/**
 * Native block scanner (Phase 1–3).
 *
 * Recognizes a CommonMark-ish subset plus GFM tables/task lists, display math,
 * YAML frontmatter, HTML blocks, and link/footnote definitions with exact
 * character offsets, without calling micromark.
 *
 * Beats a blank-line-naive splitter: fenced code keeps internal blank lines;
 * tight/loose lists (and task lists) stay one block across inter-item blanks.
 *
 * Whole-document micromark fallback is no longer triggered for Phase 3
 * constructs. Remaining gaps (e.g. indented-code kind vs paragraph) are
 * labeled natively rather than bouncing the whole doc to micromark.
 */

import type { BlockKind } from '../kinds.js';
import type { BlockSpan, SplitDocument } from '../types.js';

interface Line {
  /** Offset of first character of the line (into `text`). */
  readonly start: number;
  /** Offset past last non-newline character (newline itself not included). */
  readonly end: number;
  /** Line text without trailing CR/LF. */
  readonly content: string;
  /** Offset past the line including its terminator (CRLF/LF), or `end` at EOF. */
  readonly next: number;
}

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let index = 0;
  while (index < text.length) {
    const start = index;
    while (index < text.length && text[index] !== '\n' && text[index] !== '\r') {
      index += 1;
    }
    const end = index;
    if (index < text.length) {
      if (text[index] === '\r' && text[index + 1] === '\n') index += 2;
      else index += 1;
    }
    lines.push({ start, end, content: text.slice(start, end), next: index });
  }
  return lines;
}

function indentOf(content: string): number {
  let indent = 0;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === ' ') indent += 1;
    else if (ch === '\t') indent += 4;
    else break;
  }
  return indent;
}

function stripIndent(content: string, max = 3): string {
  let i = 0;
  let spaces = 0;
  while (i < content.length && spaces < max) {
    if (content[i] === ' ') {
      spaces += 1;
      i += 1;
    } else if (content[i] === '\t') {
      spaces += 4;
      i += 1;
      break;
    } else break;
  }
  return content.slice(i);
}

function isBlank(content: string): boolean {
  return /^\s*$/.test(content);
}

function isAtxHeading(content: string): boolean {
  return /^\s{0,3}#{1,6}(?:\s|$)/.test(content);
}

function isSetextUnderline(content: string): boolean {
  return /^\s{0,3}(?:=+|-+)\s*$/.test(content) && /[=-]/.test(content);
}

function fenceOpen(content: string): { marker: '`' | '~'; length: number } | null {
  const match = /^( {0,3})(`{3,}|~{3,})/.exec(content);
  if (!match) return null;
  const fence = match[2]!;
  const marker = fence[0] as '`' | '~';
  // Info string may not contain the fence marker for backticks.
  const rest = content.slice(match[0].length);
  if (marker === '`' && rest.includes('`')) return null;
  return { marker, length: fence.length };
}

function isFenceClose(content: string, marker: '`' | '~', length: number): boolean {
  const match = new RegExp(`^ {0,3}${marker}{${length},}\\s*$`).exec(content);
  return match !== null;
}

function isThematicBreak(content: string): boolean {
  const body = stripIndent(content);
  if (!/^(\*|-|_)(?:\s*\1){2,}\s*$/.test(body)) return false;
  return true;
}

function bulletMarker(content: string): RegExpMatchArray | null {
  return /^( {0,3})([-*+])(\s+)/.exec(content);
}

function orderedMarker(content: string): RegExpMatchArray | null {
  return /^( {0,3})(\d{1,9})([.)])(\s+)/.exec(content);
}

function isTaskListItem(content: string): boolean {
  const bullet = bulletMarker(content);
  if (bullet) {
    const after = content.slice(bullet[0].length);
    return /^\[[ xX]\](?:\s|$)/.test(after);
  }
  const ordered = orderedMarker(content);
  if (ordered) {
    const after = content.slice(ordered[0].length);
    return /^\[[ xX]\](?:\s|$)/.test(after);
  }
  return false;
}

function isListItem(content: string): boolean {
  return bulletMarker(content) !== null || orderedMarker(content) !== null;
}

function isBlockQuote(content: string): boolean {
  return /^\s{0,3}>/.test(content);
}

function looksLikeTable(lines: Line[], index: number): boolean {
  const line = lines[index];
  if (!line || !line.content.includes('|')) return false;
  const next = lines[index + 1];
  if (!next) return false;
  return isTableDelimiter(next.content);
}

function isTableDelimiter(content: string): boolean {
  return /^\s*\|?[:| \t-]+\|[:| \t-]*$/.test(content) && /-/.test(content);
}

function isTableRow(content: string): boolean {
  return content.includes('|');
}

/** YAML frontmatter open: exact `---` at byte offset 0. */
function isFrontmatterOpen(content: string, absoluteStart: boolean): boolean {
  return absoluteStart && /^---\s*$/.test(content);
}

function isFrontmatterClose(content: string): boolean {
  return /^---\s*$/.test(content);
}

/**
 * Display-math (math flow) open: ≥2 dollars, meta must not contain `$`
 * (otherwise same-line `$$…$$` is inline / paragraph).
 */
function displayMathOpen(content: string): { length: number } | null {
  const match = /^( {0,3})(\${2,})([^$]*)$/.exec(content);
  if (!match) return null;
  return { length: match[2]!.length };
}

function isDisplayMathClose(content: string, length: number): boolean {
  return new RegExp(`^ {0,3}\\${'$'}{${length},}\\s*$`).test(content);
}

/** CommonMark HTML block tag names (type 6). */
const HTML_BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'base', 'basefont', 'blockquote', 'body',
  'caption', 'center', 'col', 'colgroup', 'dd', 'details', 'dialog', 'dir',
  'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header',
  'hr', 'html', 'iframe', 'legend', 'li', 'link', 'main', 'menu', 'menuitem',
  'nav', 'noframes', 'ol', 'optgroup', 'option', 'p', 'param', 'search',
  'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead',
  'title', 'tr', 'track', 'ul',
]);

type HtmlKind =
  | { type: 1; endTag: string }
  | { type: 2 | 3 | 4 | 5 }
  | { type: 6 | 7 };

function htmlBlockKind(content: string): HtmlKind | null {
  const body = stripIndent(content);
  if (!body.startsWith('<')) return null;

  // Type 2: comment
  if (/^<!--/.test(body)) return { type: 2 };
  // Type 3: processing instruction
  if (/^<\?/.test(body)) return { type: 3 };
  // Type 4: declaration
  if (/^<![A-Za-z]/.test(body)) return { type: 4 };
  // Type 5: CDATA
  if (/^<!\[CDATA\[/i.test(body)) return { type: 5 };

  // Type 1: script / pre / style / textarea
  const type1 = /^<\/?(script|pre|style|textarea)(?:\s|\/|>|$)/i.exec(body);
  if (type1) return { type: 1, endTag: type1[1]!.toLowerCase() };

  // Type 6: block-level tag
  const type6 = /^<\/?([A-Za-z][A-Za-z0-9]*)(?=[\s\/>]|$)/.exec(body);
  if (type6 && HTML_BLOCK_TAGS.has(type6[1]!.toLowerCase())) return { type: 6 };

  // Type 7: other tags (opening or closing), not interrupting paragraphs
  if (
    /^<[A-Za-z][A-Za-z0-9]*([:][A-Za-z][A-Za-z0-9]*)?(\s+[^\s>][^>]*)?\s*\/?>\s*$/.test(body)
    || /^<\/[A-Za-z][A-Za-z0-9]*([:][A-Za-z][A-Za-z0-9]*)?\s*>\s*$/.test(body)
  ) {
    return { type: 7 };
  }

  return null;
}

function htmlInterruptsParagraph(content: string): boolean {
  const kind = htmlBlockKind(content);
  return kind !== null && kind.type !== 7;
}

function htmlBlockEnds(content: string, kind: HtmlKind): boolean {
  switch (kind.type) {
    case 1:
      return new RegExp(`</${kind.endTag}>`, 'i').test(content);
    case 2:
      return content.includes('-->');
    case 3:
      return content.includes('?>');
    case 4:
      return content.includes('>');
    case 5:
      return content.includes(']]>');
    case 6:
    case 7:
      return isBlank(content);
    default:
      return false;
  }
}

/** Link or footnote definition opening line. */
function definitionOpen(content: string): { kind: 'link-definition' | 'footnote-definition' } | null {
  const footnote = /^( {0,3})\[\^([^\]\n]+)\]:\s*/.exec(content);
  if (footnote) return { kind: 'footnote-definition' };
  const link = /^( {0,3})\[([^\]\n]+)\]:\s*\S/.exec(content);
  if (link) return { kind: 'link-definition' };
  return null;
}

function isBlockStart(content: string): boolean {
  if (isBlank(content)) return false;
  if (isAtxHeading(content)) return true;
  if (fenceOpen(content)) return true;
  if (isThematicBreak(content)) return true;
  if (isBlockQuote(content)) return true;
  if (isListItem(content)) return true;
  if (displayMathOpen(content)) return true;
  if (htmlInterruptsParagraph(content)) return true;
  return false;
}

function trimTrailingNewlines(text: string, end: number): number {
  let cursor = end;
  while (cursor > 0) {
    const previous = text[cursor - 1];
    if (previous !== '\n' && previous !== '\r') break;
    cursor -= 1;
  }
  return cursor;
}

function spansToSplit(text: string, raw: { kind: BlockKind; start: number; end: number }[]): SplitDocument {
  const spans: BlockSpan[] = raw.map((span) => {
    const end = trimTrailingNewlines(text, span.end);
    return {
      kind: span.kind,
      start: span.start,
      end,
      markdown: text.slice(span.start, end),
      node: null,
    };
  }).filter((span) => span.end > span.start);

  if (spans.length === 0) {
    return { spans: [], leading: '', gaps: [], trailing: text };
  }

  const gaps: string[] = [];
  for (let index = 0; index + 1 < spans.length; index += 1) {
    gaps.push(text.slice(spans[index]!.end, spans[index + 1]!.start));
  }

  return {
    spans,
    leading: text.slice(0, spans[0]!.start),
    gaps,
    trailing: text.slice(spans[spans.length - 1]!.end),
  };
}

/**
 * Try a native split. Always succeeds for the Phase 1–3 dialect (returns a
 * SplitDocument). Returns `null` only for the empty-guard path is unused —
 * kept as `SplitDocument | null` for parseBlocks compatibility; currently
 * never returns null for non-empty failure cases.
 */
export function tryNativeSplit(text: string): SplitDocument | null {
  if (text.length === 0) {
    return { spans: [], leading: '', gaps: [], trailing: '' };
  }

  const lines = splitLines(text);
  const raw: { kind: BlockKind; start: number; end: number }[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (isBlank(line.content)) {
      i += 1;
      continue;
    }

    // YAML frontmatter (only at absolute document start)
    if (i === 0 && line.start === 0 && isFrontmatterOpen(line.content, true)) {
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        if (isFrontmatterClose(lines[j]!.content)) {
          closed = true;
          break;
        }
        j += 1;
      }
      if (closed) {
        const end = lines[j]!.next;
        raw.push({ kind: 'frontmatter', start: 0, end });
        i = j + 1;
        continue;
      }
      // Unclosed → fall through (typically thematic-break).
    }

    // Display math
    const math = displayMathOpen(line.content);
    if (math) {
      const start = line.start;
      let j = i + 1;
      while (j < lines.length && !isDisplayMathClose(lines[j]!.content, math.length)) {
        j += 1;
      }
      const endLine = j < lines.length ? lines[j]! : lines[lines.length - 1]!;
      const end = j < lines.length ? endLine.next : endLine.next;
      raw.push({ kind: 'display-math', start, end });
      i = j < lines.length ? j + 1 : lines.length;
      continue;
    }

    // HTML blocks
    const htmlKind = htmlBlockKind(line.content);
    if (htmlKind) {
      const start = line.start;
      let j = i;
      if (htmlKind.type === 6 || htmlKind.type === 7) {
        // Types 6/7: through lines until a blank (blank not included).
        j = i + 1;
        while (j < lines.length && !isBlank(lines[j]!.content)) {
          j += 1;
        }
        const end = lines[j - 1]!.next;
        raw.push({ kind: 'html', start, end });
        i = j;
        continue;
      }
      // Types 1–5: until closing condition on some line (that line included).
      if (htmlBlockEnds(line.content, htmlKind)) {
        raw.push({ kind: 'html', start, end: line.next });
        i += 1;
        continue;
      }
      j = i + 1;
      while (j < lines.length && !htmlBlockEnds(lines[j]!.content, htmlKind)) {
        j += 1;
      }
      if (j < lines.length) {
        raw.push({ kind: 'html', start, end: lines[j]!.next });
        i = j + 1;
      } else {
        raw.push({ kind: 'html', start, end: lines[lines.length - 1]!.next });
        i = lines.length;
      }
      continue;
    }

    // Link / footnote definitions (block-start only; do not interrupt paragraphs)
    const def = definitionOpen(line.content);
    if (def) {
      const start = line.start;
      let j = i + 1;
      // Continuations: indented non-blank lines (title / footnote body)
      while (j < lines.length) {
        const next = lines[j]!;
        if (isBlank(next.content)) break;
        if (indentOf(next.content) >= 1) {
          j += 1;
          continue;
        }
        break;
      }
      const end = lines[j - 1]!.next;
      raw.push({ kind: def.kind, start, end });
      i = j;
      continue;
    }

    // Fenced code
    const fence = fenceOpen(line.content);
    if (fence) {
      const start = line.start;
      let j = i + 1;
      while (j < lines.length && !isFenceClose(lines[j]!.content, fence.marker, fence.length)) {
        j += 1;
      }
      const endLine = j < lines.length ? lines[j]! : lines[lines.length - 1]!;
      const end = j < lines.length ? endLine.next : endLine.next;
      raw.push({ kind: 'fenced-code', start, end });
      i = j < lines.length ? j + 1 : lines.length;
      continue;
    }

    // ATX heading (single line)
    if (isAtxHeading(line.content)) {
      raw.push({ kind: 'heading', start: line.start, end: line.next });
      i += 1;
      continue;
    }

    // Thematic break
    if (isThematicBreak(line.content)) {
      raw.push({ kind: 'thematic-break', start: line.start, end: line.next });
      i += 1;
      continue;
    }

    // Block quote
    if (isBlockQuote(line.content)) {
      const start = line.start;
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j]!;
        if (isBlockQuote(next.content)) {
          j += 1;
          continue;
        }
        if (isBlank(next.content)) {
          let k = j + 1;
          while (k < lines.length && isBlank(lines[k]!.content)) k += 1;
          if (k < lines.length && isBlockQuote(lines[k]!.content)) {
            j = k;
            continue;
          }
          break;
        }
        break;
      }
      const end = lines[j - 1]!.next;
      raw.push({ kind: 'quote', start, end });
      i = j;
      continue;
    }

    // GFM table
    if (looksLikeTable(lines, i)) {
      const start = line.start;
      let j = i + 2;
      while (j < lines.length) {
        const next = lines[j]!;
        if (isBlank(next.content)) break;
        if (!isTableRow(next.content)) break;
        if (fenceOpen(next.content)) break;
        if (isAtxHeading(next.content)) break;
        if (isThematicBreak(next.content) && !isTableDelimiter(next.content)) break;
        if (isBlockQuote(next.content)) break;
        if (isListItem(next.content)) break;
        j += 1;
      }
      const end = lines[j - 1]!.next;
      raw.push({ kind: 'table', start, end });
      i = j;
      continue;
    }

    // Lists (bullet / ordered / task)
    if (isListItem(line.content)) {
      const ordered = orderedMarker(line.content) !== null;
      let hasTask = isTaskListItem(line.content);
      const start = line.start;
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j]!;
        if (isListItem(next.content)) {
          const nextOrdered = orderedMarker(next.content) !== null;
          if (nextOrdered !== ordered) break;
          if (isTaskListItem(next.content)) hasTask = true;
          j += 1;
          continue;
        }
        if (isBlank(next.content)) {
          let k = j + 1;
          while (k < lines.length && isBlank(lines[k]!.content)) k += 1;
          if (k < lines.length && isListItem(lines[k]!.content)) {
            const nextOrdered = orderedMarker(lines[k]!.content) !== null;
            if (nextOrdered !== ordered) break;
            if (isTaskListItem(lines[k]!.content)) hasTask = true;
            j = k;
            continue;
          }
          break;
        }
        if (indentOf(next.content) >= 2) {
          j += 1;
          continue;
        }
        break;
      }
      const end = lines[j - 1]!.next;
      const kind = hasTask ? 'task-list' : ordered ? 'ordered-list' : 'bullet-list';
      raw.push({ kind, start, end });
      i = j;
      continue;
    }

    // Paragraph / setext heading
    {
      const start = line.start;
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j]!;
        if (isBlank(next.content)) break;
        if (isBlockStart(next.content)) break;
        if (isSetextUnderline(next.content)) {
          const end = next.next;
          raw.push({ kind: 'heading', start, end });
          i = j + 1;
          j = -1;
          break;
        }
        j += 1;
      }
      if (j === -1) continue;
      const end = lines[j - 1]!.next;
      raw.push({ kind: 'paragraph', start, end });
      i = j;
    }
  }

  return spansToSplit(text, raw);
}
