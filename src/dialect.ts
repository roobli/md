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
 * - Hard breaks as two trailing spaces (not backslash); list marker /
 *   ordered delimiter from `node.data` when present (Phase 7).
 *
 * Noto still owns wiki-link verbatim runs and bare autolink shape until the
 * bridge copies those handlers. Hosts that need those exact bytes for an
 * *edited* block should keep supplying the markdown string themselves.
 */

import {
  defaultHandlers,
  toMarkdown,
  type Options as ToMarkdownOptions,
} from 'mdast-util-to-markdown';
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

/**
 * Hard break as two trailing spaces (vault-majority), not backslash-newline.
 * Only rewrites the unambiguous `\\\n` form; degraded space forms stay.
 */
const hardBreakAsTwoSpaces: ToMarkdownOptions = {
  handlers: {
    break(node, parent, state, info) {
      const written = defaultHandlers.break(node, parent, state, info);
      return written === '\\\n' ? '  \n' : written;
    },
  },
};

/**
 * List keeps the marker / ordered delimiter carried on `node.data`.
 * Swaps serializer options for the duration of this list only.
 */
const listMarkerFromNode: ToMarkdownOptions = {
  handlers: {
    list(node, parent, state, info) {
      const data = node.data as { bullet?: string; delimiter?: string } | undefined;
      const previousBullet = state.options.bullet;
      const previousOrdered = state.options.bulletOrdered;
      if (!node.ordered && (data?.bullet === '*' || data?.bullet === '+' || data?.bullet === '-')) {
        state.options.bullet = data.bullet;
      }
      if (node.ordered && (data?.delimiter === '.' || data?.delimiter === ')')) {
        state.options.bulletOrdered = data.delimiter;
      }
      try {
        return defaultHandlers.list(node, parent, state, info);
      } finally {
        state.options.bullet = previousBullet;
        state.options.bulletOrdered = previousOrdered;
      }
    },
  },
};

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
    listMarkerFromNode,
    hardBreakAsTwoSpaces,
  ],
};

/**
 * Render a single mdast node back to markdown (edited blocks only).
 * Trailing newlines are stripped — gaps come from the split, not the node.
 */
export function renderMarkdown(node: Nodes): string {
  return toMarkdown(node, serializerOptions).replace(/\n+$/, '');
}
