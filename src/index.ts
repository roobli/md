export type {
  BlockKind,
  BlockSpan,
  SplitDocument,
  EngineEnvelope,
  EngineDocument,
  ParseResult,
} from './types.js';

export type {
  SourceEdit,
  BlockOrdinalRange,
  ReparseBlocksOptions,
  ReparseBlocksResult,
} from './reparse.js';

export type {
  SerializeUnit,
  SerializeEnvelope,
  SerializeOptions,
  SerializeFailureCode,
  PreservedRange,
  SerializeResult,
} from './serialize.js';

export type { LineEnding } from './line-endings.js';

export { parseBlocks, parseSingleBlock, parseDocument, joinSplit } from './parse.js';
export { reparseBlocks, applySourceEdit, sourceEditBetween, reparseFromText } from './reparse.js';
export {
  serializeDocument,
  identityUnits,
  replaceBlock,
} from './serialize.js';
export { renderMarkdown, INLINE_DELIMITERS, widenDelimiterCells } from './dialect.js';
export { toLf, fromLf } from './line-endings.js';
