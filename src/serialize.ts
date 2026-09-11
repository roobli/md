/**
 * Phase 5 — byte-exact-friendly serialize.
 *
 * Rule (same as Noto `serialize.ts`): a block the user did not change is
 * copied from the original source via offsets, never re-rendered. Only dirty
 * units go through host-supplied markdown or the dialect `renderMarkdown`
 * path. Gaps between adjacent surviving origins are reused from the prior
 * split when safe (blank-line gap, or both sides pristine).
 */

import { renderMarkdown } from './dialect.js';
import { fromLf, toLf, type LineEnding } from './line-endings.js';
import { parseDocument, parseSingleBlock } from './parse.js';
import type { EngineDocument, EngineEnvelope } from './types.js';
import type { RootContent } from 'mdast';

const UTF8_BOM = Uint8Array.from([0xef, 0xbb, 0xbf]);
const encoder = new TextEncoder();

/** One editing unit — thinner twin of Noto’s `NotoUnit`. */
export interface SerializeUnit {
  /**
   * Prior block ordinal this unit continues, or `null` for an insert.
   * Surviving origins must stay in ascending order and appear at most once.
   */
  readonly origin: number | null;
  /**
   * Replacement markdown, or `null` to keep the origin pristine (sliced from
   * `document.text`). New units must supply markdown or an mdast `node`.
   */
  readonly markdown: string | null;
  /**
   * Optional mdast node for dialect render when the unit is dirty and
   * `markdown` is omitted. Native-path hosts usually pass markdown strings.
   */
  readonly node?: RootContent | null;
}

export interface SerializeEnvelope {
  /** `mixed` = keep the document’s current endings. */
  readonly lineEnding?: LineEnding | 'mixed';
  /** Whether the output should end with a newline. Defaults to document. */
  readonly hasFinalNewline?: boolean;
}

export interface SerializeOptions {
  readonly units: readonly SerializeUnit[];
  readonly envelope?: SerializeEnvelope;
}

export type SerializeFailureCode =
  | 'EMPTY_UNIT'
  | 'FORGED_ORIGIN'
  | 'DUPLICATE_ORIGIN'
  | 'REORDERED_ORIGIN'
  | 'MULTI_BLOCK_UNIT'
  | 'MISSING_MARKDOWN';

export interface PreservedRange {
  readonly role: 'bom' | 'leading' | 'block' | 'gap' | 'trailing';
  readonly start: number;
  readonly end: number;
}

export type SerializeResult =
  | {
      readonly status: 'serialized';
      readonly text: string;
      readonly outputBytes: Uint8Array;
      readonly document: EngineDocument;
      readonly preserved: readonly PreservedRange[];
    }
  | {
      readonly status: 'failed';
      readonly code: SerializeFailureCode;
      readonly message: string;
    };

function fail(code: SerializeFailureCode, message: string): SerializeResult {
  return { status: 'failed', code, message };
}

function encodeOutput(text: string, bom: 'utf8' | 'none'): Uint8Array {
  const body = encoder.encode(text);
  if (bom === 'none') return body;
  const output = new Uint8Array(UTF8_BOM.length + body.length);
  output.set(UTF8_BOM, 0);
  output.set(body, UTF8_BOM.length);
  return output;
}

/** Identity units: every block kept pristine (null markdown). */
export function identityUnits(document: EngineDocument): SerializeUnit[] {
  return document.blocks.map((_, ordinal) => ({ origin: ordinal, markdown: null }));
}

function isPristine(unit: SerializeUnit, document: EngineDocument): boolean {
  if (unit.origin === null) return false;
  const block = document.blocks[unit.origin];
  if (block === undefined) return false;
  if (unit.markdown === null && (unit.node === undefined || unit.node === null)) return true;
  if (unit.markdown !== null && unit.markdown === block.markdown) return true;
  return false;
}

function unitMarkdown(unit: SerializeUnit, document: EngineDocument): string | null {
  if (unit.markdown !== null) return unit.markdown;
  if (unit.origin !== null) {
    const block = document.blocks[unit.origin];
    if (block !== undefined && (unit.node === undefined || unit.node === null)) {
      return block.markdown;
    }
  }
  if (unit.node) return renderMarkdown(unit.node);
  return null;
}

function validateOrigins(
  document: EngineDocument,
  units: readonly SerializeUnit[],
): SerializeResult | null {
  const seen = new Set<number>();
  let lastOrdinal = -1;
  for (const unit of units) {
    if (unit.markdown !== null && unit.markdown.length === 0) {
      return fail('EMPTY_UNIT', 'An editing unit cannot be empty. Remove it instead.');
    }
    if (unit.origin === null) {
      if (unit.markdown === null && !unit.node) {
        return fail(
          'MISSING_MARKDOWN',
          'A new unit must carry markdown or an mdast node.',
        );
      }
      continue;
    }
    if (unit.origin < 0 || unit.origin >= document.blocks.length) {
      return fail('FORGED_ORIGIN', 'An editing unit claims an ordinal this document did not issue.');
    }
    if (seen.has(unit.origin)) {
      return fail('DUPLICATE_ORIGIN', 'A block ordinal may appear only once per save.');
    }
    if (unit.origin <= lastOrdinal) {
      return fail('REORDERED_ORIGIN', 'Surviving blocks must keep their original order.');
    }
    seen.add(unit.origin);
    lastOrdinal = unit.origin;
  }
  return null;
}

/**
 * Gap between two consecutive units.
 *
 * Reuse the prior gap when both sides came from adjacent origins. A gap that
 * is only a single newline is reused only if both neighbours are pristine
 * (Noto’s rule: a single newline relies on self-terminating blocks).
 */
function gapBetween(
  document: EngineDocument,
  previous: SerializeUnit,
  current: SerializeUnit,
  previousPristine: boolean,
  currentPristine: boolean,
  lineEnding: LineEnding,
): { text: string; preserved: PreservedRange | null } {
  const canonical = { text: fromLf('\n\n', lineEnding), preserved: null };
  if (previous.origin === null || current.origin === null) return canonical;
  if (current.origin !== previous.origin + 1) return canonical;

  const gapText = document.gaps[previous.origin];
  if (gapText === undefined) return canonical;

  const hasBlankLine = toLf(gapText).includes('\n\n');
  if (!hasBlankLine && !(previousPristine && currentPristine)) return canonical;

  const previousBlock = document.blocks[previous.origin]!;
  const currentBlock = document.blocks[current.origin]!;
  return {
    text: gapText,
    preserved: {
      role: 'gap',
      start: previousBlock.end,
      end: currentBlock.start,
    },
  };
}

/**
 * Apply a block-mode save. Untouched spans are sliced from `document.text`.
 */
export function serializeDocument(
  document: EngineDocument,
  options: SerializeOptions,
): SerializeResult {
  const units = options.units;
  const originFailure = validateOrigins(document, units);
  if (originFailure) return originFailure;

  const target = options.envelope ?? {};
  const lineEnding: LineEnding =
    target.lineEnding === undefined || target.lineEnding === 'mixed'
      ? document.envelope.lineEnding
      : target.lineEnding;
  const converting = lineEnding !== document.envelope.lineEnding;
  const hasFinalNewline = target.hasFinalNewline ?? document.envelope.hasFinalNewline;

  const preserved: PreservedRange[] = [];
  const keep = (range: PreservedRange) => {
    if (!converting) preserved.push(range);
  };

  if (document.blocks.length === 0 && units.length === 0) {
    const outputBytes = encodeOutput(document.text, document.envelope.bom);
    return {
      status: 'serialized',
      text: document.text,
      outputBytes,
      document,
      preserved: [
        { role: 'trailing', start: 0, end: document.text.length },
      ],
    };
  }

  const parts: string[] = [];
  let cursor = 0;
  const emit = (text: string) => {
    parts.push(text);
    cursor += text.length;
  };

  if (document.envelope.bom === 'utf8') {
    keep({ role: 'bom', start: 0, end: 3 });
  }

  const startsAtFirstBlock = units[0]?.origin === 0;
  const emittedLeading = startsAtFirstBlock
    ? converting
      ? fromLf(toLf(document.leading), lineEnding)
      : document.leading
    : '';
  if (emittedLeading.length > 0) {
    emit(emittedLeading);
    keep({ role: 'leading', start: 0, end: document.leading.length });
  }

  const pristine = units.map((unit) => isPristine(unit, document));

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index]!;
    if (index > 0) {
      const found = gapBetween(
        document,
        units[index - 1]!,
        unit,
        pristine[index - 1]!,
        pristine[index]!,
        lineEnding,
      );
      const gap = converting
        ? { text: fromLf(toLf(found.text), lineEnding), preserved: null }
        : found;
      emit(gap.text);
      if (gap.preserved) keep(gap.preserved);
    }

    if (pristine[index] && unit.origin !== null) {
      const block = document.blocks[unit.origin]!;
      // Byte-exact: slice original source, never re-stringify.
      const source = document.text.slice(block.start, block.end);
      emit(converting ? fromLf(toLf(source), lineEnding) : source);
      keep({ role: 'block', start: block.start, end: block.end });
      continue;
    }

    const markdown = unitMarkdown(unit, document);
    if (markdown === null) {
      return fail('MISSING_MARKDOWN', 'A dirty unit must supply markdown or an mdast node.');
    }
    if (parseSingleBlock(markdown) === null) {
      return fail('MULTI_BLOCK_UNIT', 'Each editing unit must be exactly one markdown block.');
    }
    emit(fromLf(toLf(markdown), lineEnding));
  }

  const lastUnit = units.at(-1);
  const endsAtLastBlock =
    lastUnit?.origin === document.blocks.length - 1 && document.blocks.length > 0;
  const trailingUnchanged =
    !converting && hasFinalNewline === document.envelope.hasFinalNewline;
  if (
    endsAtLastBlock &&
    pristine[units.length - 1] &&
    document.trailing.length > 0 &&
    trailingUnchanged
  ) {
    const lastBlock = document.blocks[document.blocks.length - 1]!;
    emit(document.trailing);
    keep({
      role: 'trailing',
      start: lastBlock.end,
      end: document.text.length,
    });
  } else if (hasFinalNewline && units.length > 0) {
    const source =
      endsAtLastBlock && document.trailing.length > 0 ? toLf(document.trailing) : '\n';
    emit(fromLf(source, lineEnding));
  }

  const outputText = parts.join('');
  const outputBytes = encodeOutput(outputText, document.envelope.bom);

  if (outputText === document.text && !converting) {
    return {
      status: 'serialized',
      text: outputText,
      outputBytes,
      document,
      preserved,
    };
  }

  const reparsed = parseDocument(outputBytes);
  if (reparsed.status !== 'parsed') {
    return fail('MULTI_BLOCK_UNIT', reparsed.message);
  }

  return {
    status: 'serialized',
    text: outputText,
    outputBytes,
    document: reparsed.document,
    preserved,
  };
}

/**
 * Convenience: replace a single block ordinal’s markdown, keep the rest
 * pristine. Used by round-trip tests and simple host paths.
 */
export function replaceBlock(
  document: EngineDocument,
  ordinal: number,
  markdown: string,
  envelope?: SerializeEnvelope,
): SerializeResult {
  const units = identityUnits(document);
  if (ordinal < 0 || ordinal >= units.length) {
    return fail('FORGED_ORIGIN', 'replaceBlock ordinal is out of range.');
  }
  units[ordinal] = { origin: ordinal, markdown };
  return envelope === undefined
    ? serializeDocument(document, { units })
    : serializeDocument(document, { units, envelope });
}
