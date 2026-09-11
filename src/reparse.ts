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

function priorWindow(
  prior: SplitDocument,
  priorText: string,
  dirtyFrom: number,
  dirtyTo: number,
): { start: number; end: number } {
  const n = prior.spans.length;
  const start = dirtyFrom === 0 ? 0 : prior.spans[dirtyFrom - 1]!.end;
  const end = dirtyTo === n - 1 ? priorText.length : prior.spans[dirtyTo + 1]!.start;
  return { start, end };
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

function remapLocalSpan(span: BlockSpan, windowStart: number): BlockSpan {
  return {
    kind: span.kind,
    start: span.start + windowStart,
    end: span.end + windowStart,
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

  const { from: dirtyFrom, to: dirtyTo } = dirty;
  const window = priorWindow(prior, priorText, dirtyFrom, dirtyTo);

  let windowStart: number;
  let windowEnd: number;
  if (edit) {
    windowStart = mapPriorOffsetExclusiveEnd(window.start, edit);
    windowEnd = mapPriorOffsetExclusiveEnd(window.end, edit);
  } else {
    // Block-ordinal path: host guarantees the change is confined to the dirty
    // window, so prefix bytes are unchanged and suffix length is preserved.
    windowStart = window.start;
    windowEnd = text.length - (priorText.length - window.end);
  }

  if (windowStart < 0 || windowEnd < windowStart || windowEnd > text.length) {
    return finishFull();
  }

  const slice = text.slice(windowStart, windowEnd);
  const local = parseBlocks(slice);
  const middle = local.spans.map((span) => remapLocalSpan(span, windowStart));

  const prefix = prior.spans.slice(0, dirtyFrom) as BlockSpan[];
  const delta = edit
    ? edit.inserted.length - (edit.priorEnd - edit.priorStart)
    : text.length - priorText.length;
  const suffix = prior.spans.slice(dirtyTo + 1).map((span) => shiftSpan(span, delta));

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
