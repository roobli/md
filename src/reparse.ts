/**
 * Phase 4 — incremental / block-local reparse.
 *
 * WYSIWYG hosts (Noto) already know which block ordinals changed, or the
 * character range of an edit. Reparsing the whole document is wasteful and
 * destroys span object identity for untouched regions. This module reparses
 * only the dirty window (plus optional neighbor slack for fence/boundary
 * safety), then stitches prefix / middle / suffix with absolute offsets.
 *
 * Hot path uses `parseBlocks` → native scanner only (Phase 6). Micromark is not
 * imported; use `@roobli/md/legacy-micromark` for the compat backend.
 */

import { joinSplit, parseBlocks } from './parse.js';
import { parseWindow } from './window.js';
import type { BlockSpan, SplitDocument } from './types.js';

/** Character edit against the prior joined source (`joinSplit(prior)`). */
export interface SourceEdit {
  /** Inclusive start offset in the prior source. */
  readonly priorStart: number;
  /** Exclusive end offset in the prior source. */
  readonly priorEnd: number;
  /** Replacement text (empty for a pure delete). */
  readonly inserted: string;
}

/** Inclusive prior span ordinal range known dirty (editor block path). */
export interface BlockOrdinalRange {
  readonly from: number;
  readonly to: number;
}

export interface ReparseBlocksOptions {
  /** Last known good split (offsets relative to `joinSplit(prior)`). */
  readonly prior: SplitDocument;
  /**
   * Full source after the edit. Required when `edit` is omitted.
   * When both are set, `text` wins and must match applying `edit` to prior.
   */
  readonly text?: string;
  /** Character-range edit in prior-source coordinates. */
  readonly edit?: SourceEdit;
  /** Prior span ordinals replaced (inclusive). Widened by `neighborSlack`. */
  readonly replacedBlocks?: BlockOrdinalRange;
  /**
   * Extra untouched neighbours reparsed on each side (default `1`).
   * Same idea as Noto’s verification windows: an unterminated fence can only
   * swallow a neighbour if that neighbour is inside the window.
   * Pass `0` for a strict single-block path when the host already validated
   * the unit with `parseSingleBlock`.
   */
  readonly neighborSlack?: number;
}

export interface ReparseBlocksResult extends SplitDocument {
  /** Inclusive prior ordinals that were reparsed (after slack). */
  readonly dirtyFrom: number;
  readonly dirtyTo: number;
  /** Absolute character window in `text` that was fed to the scanner. */
  readonly windowStart: number;
  readonly windowEnd: number;
}

/** Apply a source edit to a joined prior string (test / host helper). */
export function applySourceEdit(priorText: string, edit: SourceEdit): string {
  if (edit.priorStart < 0 || edit.priorEnd < edit.priorStart || edit.priorEnd > priorText.length) {
    throw new RangeError('SourceEdit range is out of bounds for the prior source.');
  }
  return priorText.slice(0, edit.priorStart) + edit.inserted + priorText.slice(edit.priorEnd);
}

/**
 * Derive a single contiguous `SourceEdit` from two full texts by longest
 * common prefix / suffix. Returns `null` when the texts are identical.
 *
 * Hosts that keep a prior `SplitDocument` and receive a new full buffer
 * (Noto `replaceMarkdown`) can pass the result to `reparseBlocks` instead of
 * a whole-document `parseBlocks` of the new buffer. Overlapping prefix/suffix
 * never crosses: the common ends shrink until they leave a non-empty middle
 * on at least one side (or both empty for a pure insert at a caret).
 */
export function sourceEditBetween(priorText: string, nextText: string): SourceEdit | null {
  if (priorText === nextText) return null;
  const minLen = Math.min(priorText.length, nextText.length);
  let prefix = 0;
  while (prefix < minLen && priorText.charCodeAt(prefix) === nextText.charCodeAt(prefix)) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < minLen - prefix
    && priorText.charCodeAt(priorText.length - 1 - suffix)
      === nextText.charCodeAt(nextText.length - 1 - suffix)
  ) {
    suffix += 1;
  }
  return {
    priorStart: prefix,
    priorEnd: priorText.length - suffix,
    inserted: nextText.slice(prefix, nextText.length - suffix),
  };
}

/**
 * Incremental reparse when the host has a prior split and the full next text
 * but not ordinals or a hand-built `SourceEdit`.
 *
 * Derives the edit via `sourceEditBetween`. Identical texts return the prior
 * split with an empty dirty window (`dirtyTo < dirtyFrom`).
 */
export function reparseFromText(
  prior: SplitDocument,
  text: string,
  options?: { readonly neighborSlack?: number },
): ReparseBlocksResult {
  const priorText = joinSplit(prior);
  const edit = sourceEditBetween(priorText, text);
  if (!edit) {
    return {
      spans: prior.spans,
      leading: prior.leading,
      gaps: prior.gaps,
      trailing: prior.trailing,
      dirtyFrom: 0,
      dirtyTo: -1,
      windowStart: 0,
      windowEnd: 0,
    };
  }
  return reparseBlocks({
    prior,
    text,
    edit,
    ...(options?.neighborSlack !== undefined ? { neighborSlack: options.neighborSlack } : {}),
  });
}

function mapPriorOffsetExclusiveEnd(offset: number, edit: SourceEdit): number {
  if (offset <= edit.priorStart) return offset;
  if (offset >= edit.priorEnd) {
    return offset - (edit.priorEnd - edit.priorStart) + edit.inserted.length;
  }
  return edit.priorStart + edit.inserted.length;
}

function resolveDirtyOrdinals(
  prior: SplitDocument,
  edit: SourceEdit | undefined,
  replacedBlocks: BlockOrdinalRange | undefined,
  slack: number,
): { from: number; to: number } | 'full' {
  const n = prior.spans.length;
  if (n === 0) return 'full';

  let from = n;
  let to = -1;

  if (replacedBlocks) {
    if (replacedBlocks.from < 0 || replacedBlocks.to < replacedBlocks.from || replacedBlocks.to >= n) {
      throw new RangeError('replacedBlocks ordinals are out of range for prior.spans.');
    }
    from = Math.min(from, replacedBlocks.from);
    to = Math.max(to, replacedBlocks.to);
  }

  if (edit) {
    const { priorStart, priorEnd } = edit;
    for (let i = 0; i < n; i += 1) {
      const span = prior.spans[i]!;
      const intersects = span.end > priorStart && span.start < priorEnd;
      const caretInside = priorStart === priorEnd && priorStart >= span.start && priorStart <= span.end;
      if (intersects || caretInside) {
        from = Math.min(from, i);
        to = Math.max(to, i);
      }
    }

    if (to < from) {
      // Edit landed only in leading / gap / trailing whitespace.
      let before = -1;
      let after = n;
      for (let i = 0; i < n; i += 1) {
        const span = prior.spans[i]!;
        if (span.end <= priorStart) before = i;
        if (span.start >= priorEnd && after === n) after = i;
      }
      if (before >= 0) {
        from = before;
        to = before;
      }
      if (after < n) {
        from = Math.min(from, after);
        to = Math.max(to, after);
      }
    }
  }

  if (to < from) return 'full';

  from = Math.max(0, from - slack);
  to = Math.min(n - 1, to + slack);
  return { from, to };
}

function shiftSpan(span: BlockSpan, delta: number): BlockSpan {
  if (delta === 0) return span;
  return {
    kind: span.kind,
    start: span.start + delta,
    end: span.end + delta,
    markdown: span.markdown,
    node: span.node,
  };
}

function stitchCoverage(text: string, spans: readonly BlockSpan[], prior: SplitDocument, dirtyFrom: number, dirtyTo: number, middleCount: number): SplitDocument {
  if (spans.length === 0) {
    return { spans: [], leading: '', gaps: [], trailing: text };
  }

  const leadingRaw = text.slice(0, spans[0]!.start);
  const leading = dirtyFrom > 0 && leadingRaw === prior.leading ? prior.leading : leadingRaw;

  const gaps: string[] = [];
  for (let i = 0; i + 1 < spans.length; i += 1) {
    const gap = text.slice(spans[i]!.end, spans[i + 1]!.start);
    let preserved: string | undefined;
    if (i + 1 < dirtyFrom && i < prior.gaps.length && gap === prior.gaps[i]) {
      preserved = prior.gaps[i];
    } else if (i >= dirtyFrom + middleCount) {
      const priorGapIndex = dirtyTo + 1 + (i - dirtyFrom - middleCount);
      if (priorGapIndex >= 0 && priorGapIndex < prior.gaps.length && gap === prior.gaps[priorGapIndex]) {
        preserved = prior.gaps[priorGapIndex];
      }
    }
    gaps.push(preserved ?? gap);
  }

  const trailingRaw = text.slice(spans[spans.length - 1]!.end);
  const trailing =
    dirtyTo < prior.spans.length - 1 && trailingRaw === prior.trailing
      ? prior.trailing
      : trailingRaw;

  return { spans, leading, gaps, trailing };
}

/**
 * Reparse only the affected region of a prior split and stitch a new
 * `SplitDocument` with correct absolute offsets.
 *
 * Untouched prefix spans keep object identity. Untouched suffix spans keep
 * the same `markdown` string identity; offset fields are shifted when the
 * edit changes document length before them.
 */
export function reparseBlocks(options: ReparseBlocksOptions): ReparseBlocksResult {
  const { prior, edit, replacedBlocks } = options;
  const slack = options.neighborSlack ?? 1;
  const priorText = joinSplit(prior);

  let text: string;
  if (options.text !== undefined) {
    text = options.text;
    if (edit) {
      const expected = applySourceEdit(priorText, edit);
      if (expected !== text) {
        throw new Error('reparseBlocks: `text` does not match `edit` applied to prior source.');
      }
    }
  } else if (edit) {
    text = applySourceEdit(priorText, edit);
  } else {
    throw new Error('reparseBlocks: provide `text` and/or `edit`.');
  }

  const finishFull = (): ReparseBlocksResult => {
    const full = parseBlocks(text);
    return {
      ...full,
      dirtyFrom: 0,
      dirtyTo: Math.max(0, full.spans.length - 1),
      windowStart: 0,
      windowEnd: text.length,
    };
  };

  if (!edit && !replacedBlocks) return finishFull();

  const dirty = resolveDirtyOrdinals(prior, edit, replacedBlocks, slack);
  if (dirty === 'full' || prior.spans.length === 0) return finishFull();

  const n = prior.spans.length;
  // Everything before the edit is where it was; everything after it moved by
  // the same amount. On the block path the host vouches that the change sits
  // inside the dirty ordinals.
  const delta = edit
    ? edit.inserted.length - (edit.priorEnd - edit.priorStart)
    : text.length - priorText.length;

  // The window is pinned at both edges (see `window.ts`): it opens at the start
  // of the untouched block before the dirty ordinals, and must close with the
  // untouched block after them, exactly as that block was. If the edit ran on
  // into it, as an unclosed fence does, the window is read on to the end of
  // the text instead.
  const leftOrdinal = dirty.from - 1;
  const rightOrdinal = dirty.to + 1;
  const left = leftOrdinal >= 0 ? prior.spans[leftOrdinal]! : null;
  const right = rightOrdinal < n ? shiftSpan(prior.spans[rightOrdinal]!, delta) : null;
  const windowStart = left ? left.start : 0;
  if (
    (left && text.slice(left.start, left.end) !== left.markdown)
    || (right && (right.end > text.length || text.slice(right.start, right.end) !== right.markdown))
  ) {
    return finishFull();
  }

  let local = right ? parseWindow(text, windowStart, right.end, right) : null;
  const anchored = local !== null;
  if (local === null) local = parseWindow(text, windowStart, text.length, null);
  if (local === null) return finishFull();
  const windowEnd = anchored ? right!.end : text.length;

  // The block before the window keeps its identity unless the edit changed how
  // it ends (a line that now continues it, say).
  const leftUnchanged = left !== null && local.length > 0
    && local[0]!.start === left.start && local[0]!.end === left.end && local[0]!.kind === left.kind;
  const dirtyFrom = leftUnchanged ? leftOrdinal + 1 : Math.max(0, leftOrdinal);
  const dirtyTo = anchored ? rightOrdinal - 1 : n - 1;
  const middle = local.slice(leftUnchanged ? 1 : 0, anchored ? -1 : undefined);

  const prefix = prior.spans.slice(0, dirtyFrom) as BlockSpan[];
  const suffix = anchored ? prior.spans.slice(rightOrdinal).map((span) => shiftSpan(span, delta)) : [];

  const spans: BlockSpan[] = [...prefix, ...middle, ...suffix];
  const stitched = stitchCoverage(text, spans, prior, dirtyFrom, dirtyTo, middle.length);

  return {
    ...stitched,
    dirtyFrom,
    dirtyTo,
    windowStart,
    windowEnd,
  };
}
