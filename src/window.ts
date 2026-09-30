/**
 * Reparsing part of a document, and proving the answer is the one a parse of
 * the whole document would give.
 *
 * The scanner reads a document top to bottom, and where a top-level block
 * starts is decided by that block's first line and everything above it. So a
 * window of the text can stand in for the whole parse when both of its edges
 * are pinned:
 *
 * - **Left.** The window opens at offset 0, or at the start of a block whose
 *   first line, and everything before it, reads as it did when the caller last
 *   parsed it. A whole parse is then between blocks there, with nothing open,
 *   exactly as the window's own parse is when it begins.
 * - **Right.** The window closes at the end of the text, or at the end of an
 *   *anchor*: an untouched block the caller expects there, followed by
 *   untouched text. The window is only accepted when its last block is exactly
 *   that anchor. Then nothing inside the window ran on into it, a whole parse
 *   starts the anchor afresh just as it did before, and every block after it
 *   reads as it did before, shifted.
 *
 * The anchor check is what makes this safe. Without it, an edit that opens a
 * code fence and never closes it would look like one short block to the
 * window, while a parse of the whole text would see the fence swallow
 * everything after it.
 */

import { tryNativeSplit } from './backend/native-scanner.js';
import type { BlockKind, BlockSpan } from './types.js';

/** A first line the scanner would try as frontmatter (`isFrontmatterOpen`). */
const OPENS_FRONTMATTER = /^---[^\S\r\n]*(?:\r\n|\r|\n|$)/;

/** The block a window must end with: kind and absolute offsets. */
export interface WindowAnchor {
  readonly kind: BlockKind;
  readonly start: number;
  readonly end: number;
}

/**
 * The blocks of `text[from, to)` with offsets into `text`, or `null` when the
 * window does not end with `anchor`.
 *
 * The caller is responsible for the left edge (see the module comment); this
 * checks the right one, and refuses a window that opens the note with a `---`
 * it cannot close. `to` is `text.length` exactly when `anchor` is null.
 * Frontmatter is only recognised when the window opens the document.
 */
export function parseWindow(
  text: string,
  from: number,
  to: number,
  anchor: WindowAnchor | null,
): BlockSpan[] | null {
  const local = tryNativeSplit(text.slice(from, to), from === 0);
  // Frontmatter is the one block decided by looking arbitrarily far ahead: a
  // `---` on the first line is frontmatter if a closing `---` comes anywhere
  // after it, and a thematic break if none does. A window that opens the note
  // with one, stops short of the end, and does not contain its close cannot
  // tell which.
  if (from === 0 && to < text.length && OPENS_FRONTMATTER.test(text) && local.spans[0]?.kind !== 'frontmatter') {
    return null;
  }
  const spans: BlockSpan[] = local.spans.map((span) => ({
    kind: span.kind,
    start: span.start + from,
    end: span.end + from,
    markdown: span.markdown,
    node: span.node,
  }));
  if (anchor === null) return spans;
  const last = spans.at(-1);
  if (last === undefined || last.start !== anchor.start || last.end !== anchor.end || last.kind !== anchor.kind) {
    return null;
  }
  return spans;
}
