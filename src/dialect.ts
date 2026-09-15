/**
 * Serialize dialect for edited blocks — aligned with Noto’s habits
 * (`Noto/src/shared/markdown/v3/syntax.ts`).
 *
 * Hypothesis (verify against Noto when bridging):
 * - Untouched blocks never enter this path; they are sliced from source.
 * - Defaults match vault-majority style: `-` bullets, `*` emphasis/strong,
 *   fenced code with backticks, `listItemIndent: 'one'`, tight definitions.
 * - GFM: `singleTilde: false` (pair-only strikethrough); `tablePipeAlign: false`
 *   so content cells stay unpadded (vault majority). Delimiter hyphens are
 *   widened to ≥3 (vault three-dash style) via `widenDelimiterCells` / Phase 9.
 * - Math + YAML frontmatter write extensions enabled.
 * - CJK-friendly to-markdown so Chinese flanking is not numeric-escaped
 *   (Phase 12 lock-in: Typora-shaped `**注意：**…` round-trips without `&#x…`).
 * - Hard breaks as two trailing spaces (not backslash); list marker /
 *   ordered delimiter from `node.data` when present (Phase 7).
 * - Verbatim runs (wiki links, alerts, footnotes, `[TOC]`, snake_case, …)
 *   and bare http(s) autolinks (Phase 8) — previously host-owned in Noto.
 * - Table delimiter widening to vault three-dash style (Phase 9).
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

/**
 * A word character for CommonMark's flanking rules: letters, digits, and CJK
 * ideographs. Spelled out rather than as a unicode property (no unicode flag).
 */
const WORD = `[0-9A-Za-z\u00C0-\u024F\u3400-\u4DBF\u4E00-\u9FFF]`;

/**
 * Runs the serializer must emit exactly as they are (wiki links, alerts,
 * footnotes, `[TOC]`, snake_case identifiers, metrics like `NDCG@10`, lone
 * stars glued to words). All begin with characters the default serializer
 * escapes "just in case"; escaping them stops them being what they say.
 */
const VERBATIM_RUN = new RegExp(
  [
    '\\[\\[[^[\\]\\n|]+(?:\\|[^[\\]\\n]*)?\\]\\]',
    '\\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\]',
    '==[^=\\n]+==',
    '\\[\\^[^\\]\\s]+\\]',
    '\\[[Tt][Oo][Cc]\\]',
    `${WORD}+(?:_+${WORD}+)+`,
    `${WORD}+@${WORD}+`,
    `\\*[A-Za-z][A-Za-z0-9.+_-]*`,
  ].join('|'),
  'g',
);

/**
 * A URL written on its own stays written on its own (not `<url>`).
 * Only unambiguous http(s) addresses that GFM would keep bare.
 */
const BARE_URL = /^https?:\/\/[^\s<>]*[^\s<>.,:;!?)\]]$/;

const bareAutolink: ToMarkdownOptions = {
  handlers: {
    link(node, parent, state, info) {
      const [only] = node.children;
      if (
        node.children.length === 1
        && only?.type === 'text'
        && only.value === node.url
        && (node.title === null || node.title === undefined)
        && BARE_URL.test(node.url)
      ) {
        return node.url;
      }
      return defaultHandlers.link(node, parent, state, info);
    },
  },
};

function emitWithVerbatimRuns(
  value: string,
  state: { safe: (value: string, info: { before: string; after: string }) => string },
  info: { before: string; after: string },
): string {
  VERBATIM_RUN.lastIndex = 0;
  if (!VERBATIM_RUN.test(value)) return state.safe(value, info);

  VERBATIM_RUN.lastIndex = 0;
  let out = '';
  let last = 0;
  for (;;) {
    const match = VERBATIM_RUN.exec(value);
    if (match === null) break;
    if (match.index > last) {
      out += state.safe(value.slice(last, match.index), {
        ...info,
        before: last === 0 ? info.before : ']',
        after: '[',
      });
    }
    out += match[0];
    last = match.index + match[0].length;
  }
  if (last < value.length) {
    out += state.safe(value.slice(last), { ...info, before: ']' });
  }
  return out;
}

const verbatimRunsInText: ToMarkdownOptions = {
  handlers: {
    text(node, _parent, state, info) {
      return emitWithVerbatimRuns(node.value, state, info);
    },
    image(node, parent, state, info) {
      if (!node.alt) return defaultHandlers.image(node, parent, state, info);
      const original = state.safe.bind(state);
      state.safe = ((value: string, safeInfo: { before: string; after: string }) => {
        if (safeInfo.after === ']' && safeInfo.before.endsWith('![')) {
          return emitWithVerbatimRuns(value, { safe: original }, safeInfo);
        }
        return original(value, safeInfo);
      }) as typeof state.safe;
      try {
        return defaultHandlers.image(node, parent, state, info);
      } finally {
        state.safe = original;
      }
    },
  },
};


/**
 * GFM with `tablePipeAlign: false` emits short delimiter cells (`| - | :- |`).
 * Valid GFM needs ≥3 dashes. Widen only the hyphen run; keep alignment colons
 * and surrounding spaces exactly where they were (Noto vault style).
 */
export function widenDelimiterCells(line: string): string {
  return line.split('|').map((cell) => {
    const trimmed = cell.trim();
    if (!/^:?-+:?$/.test(trimmed)) return cell;
    const left = trimmed.startsWith(':') ? ':' : '';
    const right = trimmed.endsWith(':') ? ':' : '';
    const dashes = '-'.repeat(Math.max(3, trimmed.length - left.length - right.length));
    const lead = cell.startsWith(' ') ? ' ' : '';
    const tail = cell.endsWith(' ') ? ' ' : '';
    return `${lead}${left}${dashes}${right}${tail}`;
  }).join('|');
}

/** The table handler, with its delimiter row rewritten on the way out. */
function tablesAsTheVaultWritesThem(extension: ToMarkdownOptions): ToMarkdownOptions {
  const table = extension.handlers?.table;
  // The table handler lives in one of the GFM bundle's own sub-extensions
  // rather than at its top level, so the search goes down as well as across.
  const nested = extension.extensions?.map(tablesAsTheVaultWritesThem);
  if (typeof table !== 'function') {
    return nested ? { ...extension, extensions: nested } : extension;
  }
  return {
    ...extension,
    ...(nested ? { extensions: nested } : {}),
    handlers: {
      ...extension.handlers,
      table(node, parent, state, info) {
        const out = table.call(this, node, parent, state, info) as string;
        const lines = out.split('\n');
        const delimiter = lines[1];
        if (delimiter === undefined) return out;
        lines[1] = widenDelimiterCells(delimiter);
        return lines.join('\n');
      },
    },
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
    tablesAsTheVaultWritesThem(tildeOnlyInPairs(gfmToMarkdown({ tablePipeAlign: false }))),
    mathToMarkdown(),
    frontmatterToMarkdown(),
    verbatimRunsInText,
    listMarkerFromNode,
    bareAutolink,
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
