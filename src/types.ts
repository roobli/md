import type { RootContent } from 'mdast';
import type { BlockKind } from './kinds.js';

export type { BlockKind } from './kinds.js';

export interface BlockSpan {
  readonly kind: BlockKind;
  /** Character offsets into the source text (BOM already stripped). */
  readonly start: number;
  readonly end: number;
  readonly markdown: string;
  /**
   * Phase 0 micromark backend: mdast node.
   * Phase 1 native scanner: `null` (offsets + kind only; host may reparse).
   * Later backends may use a different IR; treat as opaque unless opted in.
   */
  readonly node: RootContent | null;
}

export interface SplitDocument {
  readonly spans: readonly BlockSpan[];
  readonly leading: string;
  /** Text between span i and span i+1. */
  readonly gaps: readonly string[];
  readonly trailing: string;
}

export interface EngineEnvelope {
  readonly byteLength: number;
  readonly bom: 'utf8' | 'none';
  readonly lineEnding: 'lf' | 'crlf' | 'mixed';
  readonly hasFinalNewline: boolean;
}

export interface EngineDocument {
  readonly envelope: EngineEnvelope;
  readonly text: string;
  readonly blocks: readonly BlockSpan[];
  readonly gaps: readonly string[];
  readonly leading: string;
  readonly trailing: string;
}

export type ParseResult =
  | { readonly status: 'parsed'; readonly document: EngineDocument }
  | {
      readonly status: 'failed';
      readonly code: 'INVALID_UTF8';
      readonly message: string;
      readonly originalBytes: Uint8Array;
    };
