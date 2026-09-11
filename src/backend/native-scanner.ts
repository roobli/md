/**
 * Phase 1 native block scanner.
 *
 * Recognizes a CommonMark-ish subset with exact character offsets, without
 * calling micromark. Constructs outside the subset return `null` so
 * `parseBlocks` can fall back to the micromark backend.
 *
 * Beats a blank-line-naive splitter: fenced code keeps internal blank lines;
 * tight/loose lists stay one block across inter-item blanks.
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
  // Not a setext-looking single run of dashes used under a paragraph — thematic
  // breaks require only punctuation/spaces; already matched.
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
  // GFM delimiter row: | --- | --- |  or  ---|---  or  | - | - |
  return /^\s*\|?[:| \t-]+\|[:| \t-]*$/.test(next.content) && /-/.test(next.content);
}

function looksLikeHtmlBlock(content: string): boolean {
  return /^\s{0,3}</.test(content);
}

function looksLikeLinkOrFootnoteDef(content: string): boolean {
  return /^\s{0,3}\[[^\]]*\]:/.test(content);
}

function looksLikeDisplayMath(content: string): boolean {
  return /^\s*\$\$\s*$/.test(content) || /^\s*\$\$/.test(content);
}

function looksLikeFrontmatterOpen(content: string, atDocStart: boolean): boolean {
  return atDocStart && /^---\s*$/.test(content);
}

/** True when this document needs micromark (Phase 2+ constructs). */
function needsFallback(lines: Line[]): string | null {
  for (let i = 0; i < lines.length; i += 1) {
    const content = lines[i]!.content;
    if (i === 0 && looksLikeFrontmatterOpen(content, true)) return 'frontmatter';
    if (looksLikeDisplayMath(content)) return 'display-math';
    if (looksLikeHtmlBlock(content)) return 'html';
    if (looksLikeLinkOrFootnoteDef(content)) return 'definition';
    if (isTaskListItem(content)) return 'task-list';
    if (looksLikeTable(lines, i)) return 'table';
  }
  return null;
}

function isBlockStart(content: string): boolean {
  if (isBlank(content)) return false;
  if (isAtxHeading(content)) return true;
  if (fenceOpen(content)) return true;
  if (isThematicBreak(content)) return true;
  if (isBlockQuote(content)) return true;
  if (isListItem(content)) return true;
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
 * Try a native split. Returns `null` when the document contains constructs the
 * Phase 1 scanner does not own yet (tables, tasks, math, frontmatter, …).
 */
export function tryNativeSplit(text: string): SplitDocument | null {
  if (text.length === 0) {
    return { spans: [], leading: '', gaps: [], trailing: '' };
  }

  const lines = splitLines(text);
  const reason = needsFallback(lines);
  if (reason !== null) return null;

  const raw: { kind: BlockKind; start: number; end: number }[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (isBlank(line.content)) {
      i += 1;
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
      // Include closing fence if present.
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

    // Thematic break (standalone). Setext underlines are handled in the
    // paragraph branch when they follow paragraph text.
    if (isThematicBreak(line.content)) {
      raw.push({ kind: 'thematic-break', start: line.start, end: line.next });
      i += 1;
      continue;
    }

    // Block quote: consecutive quote-marked lines (+ blank lines between quotes)
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
          // Peek: blank inside quote only if next non-blank is still a quote.
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

    // Lists (bullet / ordered) — keep loose lists as one block
    if (isListItem(line.content)) {
      const ordered = orderedMarker(line.content) !== null;
      const start = line.start;
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j]!;
        if (isListItem(next.content)) {
          // Mismatched bullet vs ordered → stop (new block)
          const nextOrdered = orderedMarker(next.content) !== null;
          if (nextOrdered !== ordered) break;
          j += 1;
          continue;
        }
        if (isBlank(next.content)) {
          let k = j + 1;
          while (k < lines.length && isBlank(lines[k]!.content)) k += 1;
          if (k < lines.length && isListItem(lines[k]!.content)) {
            const nextOrdered = orderedMarker(lines[k]!.content) !== null;
            if (nextOrdered !== ordered) break;
            j = k;
            continue;
          }
          break;
        }
        // Indented continuation of the current item
        if (indentOf(next.content) >= 2) {
          j += 1;
          continue;
        }
        break;
      }
      const end = lines[j - 1]!.next;
      raw.push({ kind: ordered ? 'ordered-list' : 'bullet-list', start, end });
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
        // Setext underline → heading spanning paragraph lines + underline
        if (isSetextUnderline(next.content)) {
          const end = next.next;
          raw.push({ kind: 'heading', start, end });
          i = j + 1;
          j = -1; // sentinel: handled
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
