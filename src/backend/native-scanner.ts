/**
 * Native block scanner (Phase 1–3 + indented-code).
 *
 * Recognizes a CommonMark-ish subset plus GFM tables/task lists, display math,
 * YAML frontmatter, HTML blocks, link/footnote definitions, and indented code
 * with exact character offsets, without calling micromark.
 *
 * Beats a blank-line-naive splitter: fenced code keeps internal blank lines;
 * tight/loose lists (and task lists) stay one block across inter-item blanks;
 * indented code keeps internal blanks between indented chunks.
 *
 * Indented code does not interrupt paragraphs (CommonMark). Phase 10 aligns
 * opening-line offsets with micromark: up to three leading ASCII spaces before
 * a block marker become leading/gap, not span markdown (html / indented-code /
 * frontmatter keep their bytes). Phase 13: CommonMark lazy continuation keeps
 * unprefixed paragraph lines inside quotes and list items (micromark parity).
 * Phase 14: definition lazy continuations; GFM tables interrupt paragraphs;
 * lists keep indented nested blocks after a blank (micromark nest/interrupt parity).
 * Phase 15: setext `---` vs thematic-break while extending paragraphs.
 * Phase 16: mixed-marker nested lists stay one span when indented to the
 * parent item content column (micromark parity; Noto intentional golden gap #2).
 * Phase 17: GFM table header/delimiter column-count parity — looksLikeTable
 * only when delimiter cell count equals header (micromark/GFM); ragged body
 * rows still absorb once a table is open.
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

/**
 * CommonMark / micromark: up to three ASCII spaces before a block marker are
 * not part of the block's source span (they land in leading / gaps). Tabs are
 * not counted here — a leading tab is indented-code territory (≥4 columns).
 */
function linePrefixLen(content: string): number {
  let n = 0;
  while (n < 3 && content[n] === ' ') n += 1;
  return n;
}

/** Span start after the optional 0–3 space line prefix. */
function spanStartAfterPrefix(line: Line): number {
  return line.start + linePrefixLen(line.content);
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

/** CommonMark indented code: ≥4 spaces (or a tab) of indent on a non-blank line. */
function isIndentedCodeLine(content: string): boolean {
  return !isBlank(content) && indentOf(content) >= 4;
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

/**
 * Split a GFM table row into cells the way micromark effectively counts them
 * for header↔delimiter parity: leading/trailing pipes are optional markers
 * (empty edge cells from outer pipes are ignored); interior empties count;
 * `\|` does not divide.
 */
function tableRowCells(content: string): string[] | null {
  let i = 0;
  while (i < content.length && (content[i] === ' ' || content[i] === '\t')) {
    i += 1;
  }
  const body = content.slice(i);
  // Trim trailing whitespace so `| a |  ` still treats the final pipe as edge.
  let end = body.length;
  while (end > 0 && (body[end - 1] === ' ' || body[end - 1] === '\t')) {
    end -= 1;
  }
  const row = body.slice(0, end);
  if (!row.includes('|')) return null;

  const cells: string[] = [];
  let current = '';
  let escaped = false;
  let start = 0;
  if (row[0] === '|') start = 1;

  for (let j = start; j < row.length; j += 1) {
    const ch = row[j]!;
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }
    if (ch === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  // Trailing pipe: final empty edge cell is ignored. Otherwise keep the last cell.
  if (!row.endsWith('|')) {
    cells.push(current);
  }

  // Micromark rejects a head row that is only a single pipe (ignoring spaces).
  if (cells.length === 0) return null;
  return cells;
}

/** Delimiter cell: optional align colons around ≥1 continuous dashes. */
function isDelimiterCell(cell: string): boolean {
  return /^\s*:?-{1,}:?\s*$/.test(cell);
}

function countHeaderCells(content: string): number | null {
  const cells = tableRowCells(content);
  if (!cells) return null;
  return cells.length;
}

function countDelimiterCells(content: string): number | null {
  const cells = tableRowCells(content);
  if (!cells) return null;
  // Micromark requires a `|` or `:` somewhere (pure `---` is thematic/setext).
  if (!/[|:]/.test(content)) return null;
  if (!cells.every(isDelimiterCell)) return null;
  return cells.length;
}

function looksLikeTable(lines: Line[], index: number): boolean {
  const line = lines[index];
  if (!line || !line.content.includes('|')) return false;
  const next = lines[index + 1];
  if (!next) return false;
  const headerCount = countHeaderCells(line.content);
  const delimCount = countDelimiterCells(next.content);
  if (headerCount === null || delimCount === null) return false;
  return headerCount === delimCount;
}

function isTableDelimiter(content: string): boolean {
  return countDelimiterCells(content) !== null;
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
  // Adjacent link/footnote definitions are new blocks, not lazy text under the
  // previous definition (micromark / CommonMark; Noto link-defs.md golden).
  if (definitionOpen(content)) return true;
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
 * Native split for the Phase 1–5 dialect. Always returns a SplitDocument
 * (never null). Micromark is not consulted — see `@roobli/md/legacy-micromark`
 * for the Phase 0 compatibility backend.
 */
export function tryNativeSplit(text: string): SplitDocument {
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
      const start = spanStartAfterPrefix(line);
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
      const start = spanStartAfterPrefix(line);
      let j = i + 1;
      // Continuations: indented non-blank lines (title / footnote body), then
      // lazy unindented non-block-starts (Phase 14; micromark footnote parity).
      while (j < lines.length) {
        const next = lines[j]!;
        if (isBlank(next.content)) break;
        if (indentOf(next.content) >= 1) {
          j += 1;
          continue;
        }
        if (!isBlockStart(next.content)) {
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
      const start = spanStartAfterPrefix(line);
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
      raw.push({ kind: 'heading', start: spanStartAfterPrefix(line), end: line.next });
      i += 1;
      continue;
    }

    // Thematic break
    if (isThematicBreak(line.content)) {
      raw.push({ kind: 'thematic-break', start: spanStartAfterPrefix(line), end: line.next });
      i += 1;
      continue;
    }

    // Block quote.
    // CommonMark: a blank line without a `>` marker ends the quote, so
    //   > a\n\n> b
    // is two quotes (ex. 231). Marker-only blank lines (`>` / `> `) stay
    // inside one quote. Do not merge across unprefixed blanks (Noto #37 /
    // tight adjacent quotes+callouts).
    // Lazy continuation (Phase 13): a following non-blank line that is not a
    // block start may omit `>` and still belongs to the quote (ex. 240;
    // setext `===` stays inside; `---` / lists / ATX / fences end the quote).
    if (isBlockQuote(line.content)) {
      const start = spanStartAfterPrefix(line);
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j]!;
        if (isBlockQuote(next.content)) {
          j += 1;
          continue;
        }
        if (isBlank(next.content)) break;
        if (isBlockStart(next.content)) break;
        j += 1;
      }
      const end = lines[j - 1]!.next;
      raw.push({ kind: 'quote', start, end });
      i = j;
      continue;
    }

    // GFM table
    if (looksLikeTable(lines, i)) {
      const start = spanStartAfterPrefix(line);
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
      const start = spanStartAfterPrefix(line);
      // Content column after the current sibling item's marker. Mixed-marker
      // nests must reach this indent (CommonMark / micromark); same-family
      // siblings update it. Phase 16.
      const openingMarker = (orderedMarker(line.content) ?? bulletMarker(line.content))!;
      let nestIndent = openingMarker[0].length;
      let j = i + 1;

      /** Absorb a list-item line into this span, or signal break. */
      const absorbListItem = (content: string): 'keep' | 'break' => {
        const marker = orderedMarker(content) ?? bulletMarker(content);
        if (!marker) return 'break';
        const nextOrdered = orderedMarker(content) !== null;
        const nextIndent = indentOf(content);
        const nested = nextIndent >= nestIndent;
        if (nextOrdered !== ordered) {
          // Phase 16: indented mixed-marker nest stays in this span.
          if (!nested) return 'break';
          return 'keep';
        }
        // Same-family: siblings (indent < nestIndent) may flip task-list and
        // refresh nestIndent; nested same-family keep parent nestIndent so a
        // later mixed nest under the parent still matches micromark.
        if (!nested) {
          if (isTaskListItem(content)) hasTask = true;
          nestIndent = marker[0].length;
        }
        return 'keep';
      };

      while (j < lines.length) {
        const next = lines[j]!;
        if (isListItem(next.content)) {
          if (absorbListItem(next.content) === 'break') break;
          j += 1;
          continue;
        }
        if (isBlank(next.content)) {
          let k = j + 1;
          while (k < lines.length && isBlank(lines[k]!.content)) k += 1;
          if (k >= lines.length) break;
          if (isListItem(lines[k]!.content)) {
            if (absorbListItem(lines[k]!.content) === 'break') break;
            j = k;
            continue;
          }
          // Phase 14: after a blank, indented nested blocks (table rows,
          // indented-code, nested paragraphs) stay inside the list span
          // (CommonMark list-item nested content; micromark parity).
          if (indentOf(lines[k]!.content) >= 2) {
            j = k;
            continue;
          }
          break;
        }
        if (indentOf(next.content) >= 2) {
          j += 1;
          continue;
        }
        // CommonMark lazy continuation of a list-item paragraph (Phase 13):
        // unindented lines that are not block starts stay in the list.
        if (!isBlockStart(next.content)) {
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

    // Indented code (CommonMark): ≥4 spaces / tab; does not interrupt paragraphs
    // (only reached at block starts after blanks). Internal blanks between
    // indented chunks stay inside one span; trailing blanks after the last
    // indented line become gaps.
    if (isIndentedCodeLine(line.content)) {
      const start = line.start;
      let j = i + 1;
      let lastContent = i;
      while (j < lines.length) {
        const next = lines[j]!;
        if (isBlank(next.content)) {
          j += 1;
          continue;
        }
        if (isIndentedCodeLine(next.content)) {
          lastContent = j;
          j += 1;
          continue;
        }
        break;
      }
      const end = lines[lastContent]!.next;
      raw.push({ kind: 'indented-code', start, end });
      i = lastContent + 1;
      continue;
    }

    // Paragraph / setext heading
    {
      const start = spanStartAfterPrefix(line);
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j]!;
        if (isBlank(next.content)) break;
        // Phase 15: continuous setext underline (`===` / `---`) absorbs as
        // heading before thematic-break / other isBlockStart wins. Spaced
        // markers (`- - -`) and `*`/`_` remain thematic via isBlockStart.
        // Standalone / top-of-doc `---` still hits the thematic path above.
        if (isSetextUnderline(next.content)) {
          const end = next.next;
          raw.push({ kind: 'heading', start, end });
          i = j + 1;
          j = -1;
          break;
        }
        if (isBlockStart(next.content)) break;
        // Phase 14: GFM tables interrupt paragraphs (two-line look-ahead only;
        // do not treat every pipe line as isBlockStart).
        if (looksLikeTable(lines, j)) break;
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
