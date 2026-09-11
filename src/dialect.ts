/**
 * Serialize dialect for edited blocks — aligned with Noto’s habits
 * (`Noto/src/shared/markdown/v3/syntax.ts`).
 *
 * Hypothesis (verify against Noto when bridging):
 * - Untouched blocks never enter this path; they are sliced from source.
 * - Defaults match vault-majority style: `-` bullets, `*` emphasis/strong,
 *   fenced code with backticks, `listItemIndent: 'one'`, tight definitions.
 * - GFM: `singleTilde: false` (pair-only strikethrough); `tablePipeAlign: false`
 *   so delimiter rows are not padded on rewrite.
 * - Math + YAML frontmatter write extensions enabled.
 * - CJK-friendly to-markdown so Chinese flanking is not numeric-escaped.
 *
 * Noto still owns wiki-link verbatim runs, list-marker-from-node, bare autolink
 * shape, and hard-break-as-two-spaces until the bridge copies those handlers.
 * Hosts that need those exact bytes for an *edited* block should keep
 * supplying the markdown string themselves.
 */

import { toMarkdown, type Options as ToMarkdownOptions } from 'mdast-util-to-markdown';
import { cjkFriendlyToMarkdown } from 'mdast-util-to-markdown-cjk-friendly';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { mathToMarkdown } from 'mdast-util-math';
import { frontmatterToMarkdown } from 'mdast-util-frontmatter';
import type { Nodes } from 'mdast';

const EMPHASIS_MARKER = '*';
const STRONG_MARKER = '*';

/** Delimiters an edited mark would be written with (matches Noto INLINE_DELIMITERS). */
export const INLINE_DELIMITERS = {
  emphasis: EMPHASIS_MARKER,
  strong: STRONG_MARKER.repeat(2),
  strikethrough: '~~',
  inline_code: '`',
} as const;

/**
 * One tilde is text (Typora subscript); only a pair strikes.
 * Mirrors Noto’s `tildeOnlyInPairs` so `H~2~O` is not escaped on rewrite.
 */
function tildeOnlyInPairs(extension: ToMarkdownOptions): ToMarkdownOptions {
  return {
    ...extension,
    unsafe: extension.unsafe?.map((rule) =>
      rule.character === '~' && rule.after === undefined ? { ...rule, after: '~' } : rule,
    ),
    extensions: extension.extensions?.map(tildeOnlyInPairs),
  };
}

const serializerOptions: ToMarkdownOptions = {
  bullet: '-',
  emphasis: EMPHASIS_MARKER,
  strong: STRONG_MARKER,
  fence: '`',
  fences: true,
  listItemIndent: 'one',
  rule: '-',
  ruleSpaces: false,
  tightDefinitions: true,
  extensions: [
    cjkFriendlyToMarkdown(),
    tildeOnlyInPairs(gfmToMarkdown({ tablePipeAlign: false })),
    mathToMarkdown(),
    frontmatterToMarkdown(),
  ],
};

/**
 * Render a single mdast node back to markdown (edited blocks only).
 * Trailing newlines are stripped — gaps come from the split, not the node.
 */
export function renderMarkdown(node: Nodes): string {
  return toMarkdown(node, serializerOptions).replace(/\n+$/, '');
}
