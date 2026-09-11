import { splitWithMicromark } from './backend/micromark-backend.js';
import { tryNativeSplit } from './backend/native-scanner.js';
import type { BlockSpan, EngineDocument, EngineEnvelope, ParseResult, SplitDocument } from './types.js';

const UTF8_BOM = Uint8Array.from([0xef, 0xbb, 0xbf]);

function hasBom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === UTF8_BOM[0] && bytes[1] === UTF8_BOM[1] && bytes[2] === UTF8_BOM[2];
}

function detectLineEnding(text: string): EngineEnvelope['lineEnding'] {
  let crlf = 0;
  let bareLf = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '\n') continue;
    if (index > 0 && text[index - 1] === '\r') crlf += 1;
    else bareLf += 1;
  }
  if (crlf > 0 && bareLf > 0) return 'mixed';
  return crlf > 0 ? 'crlf' : 'lf';
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Split markdown source into top-level blocks with exact offsets.
 *
 * Phase 1: try the native scanner first (heading / paragraph / list / fence /
 * quote / thematic / setext). Fall back to micromark for GFM tables, tasks,
 * math, frontmatter, HTML, definitions, etc.
 *
 * // replace — custom engine grows inside `native-scanner.ts`; micromark stays
 * the compatibility backend until Phase 6.
 */
export function parseBlocks(text: string): SplitDocument {
  const native = tryNativeSplit(text);
  if (native !== null) return native;
  // replace — backend boundary (compatibility path)
  return splitWithMicromark(text);
}

/** Confirm a candidate edit is exactly one top-level block. */
export function parseSingleBlock(markdown: string): BlockSpan | null {
  const split = parseBlocks(markdown);
  if (split.spans.length !== 1) return null;
  if (split.leading.trim().length > 0 || split.trailing.trim().length > 0) return null;
  return split.spans[0] ?? null;
}

/** Parse file bytes into an engine document (no host-specific hashing). */
export function parseDocument(bytes: Uint8Array): ParseResult {
  const decoded = decodeUtf8(bytes);
  if (decoded === null) {
    return {
      status: 'failed',
      code: 'INVALID_UTF8',
      message: 'Input is not valid UTF-8.',
      originalBytes: bytes.slice(),
    };
  }

  const bom = hasBom(bytes) ? 'utf8' : 'none';
  const text = bom === 'utf8' ? decoded.slice(1) : decoded;
  const split = parseBlocks(text);

  const document: EngineDocument = {
    envelope: {
      byteLength: bytes.byteLength,
      bom,
      lineEnding: detectLineEnding(text),
      hasFinalNewline: text.endsWith('\n'),
    },
    text,
    blocks: split.spans,
    gaps: split.gaps,
    leading: split.leading,
    trailing: split.trailing,
  };

  return { status: 'parsed', document };
}

/** Concatenate a split back to source — used by coverage tests. */
export function joinSplit(split: SplitDocument): string {
  let out = split.leading;
  for (let index = 0; index < split.spans.length; index += 1) {
    out += split.spans[index]!.markdown;
    if (index < split.gaps.length) out += split.gaps[index]!;
  }
  out += split.trailing;
  return out;
}
