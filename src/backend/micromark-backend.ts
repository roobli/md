/**
 * Legacy micromark + mdast parse backend (quarantined in Phase 6).
 *
 * Default `@roobli/md` never imports this module. Use
 * `@roobli/md/legacy-micromark` (or import here for benches / compat).
 */

import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { gfm } from 'micromark-extension-gfm';
import { cjkFriendlyExtension } from 'micromark-extension-cjk-friendly';
import { math } from 'micromark-extension-math';
import { frontmatter } from 'micromark-extension-frontmatter';
import type { List, Root, RootContent } from 'mdast';
import type { BlockKind } from '../kinds.js';
import type { BlockSpan, SplitDocument } from '../types.js';

const micromarkExtensions = [
  gfm({ singleTilde: false }),
  cjkFriendlyExtension(),
  math({ singleDollarTextMath: true }),
  frontmatter(),
];

const mdastExtensions = [gfmFromMarkdown(), mathFromMarkdown(), frontmatterFromMarkdown()];

function parseMarkdown(text: string): Root {
  return fromMarkdown(text, {
    extensions: micromarkExtensions,
    mdastExtensions,
  });
}

function isTaskList(node: List): boolean {
  return node.children.some((item) => item.checked !== null && item.checked !== undefined);
}

function kindOf(node: RootContent, source: string): BlockKind {
  switch (node.type) {
    case 'heading':
      return 'heading';
    case 'paragraph':
      return 'paragraph';
    case 'list':
      if (isTaskList(node)) return 'task-list';
      return node.ordered ? 'ordered-list' : 'bullet-list';
    case 'blockquote':
      return 'quote';
    case 'code':
      return /^\s{0,3}(?:`{3,}|~{3,})/.test(source) ? 'fenced-code' : 'indented-code';
    case 'table':
      return 'table';
    case 'math':
      return 'display-math';
    case 'yaml':
      return 'frontmatter';
    case 'html':
      return 'html';
    case 'thematicBreak':
      return 'thematic-break';
    case 'footnoteDefinition':
      return 'footnote-definition';
    case 'definition':
      return 'link-definition';
    default:
      return 'paragraph';
  }
}

function trimTrailingNewlines(text: string, end: number): number {
  let cursor = end;
  while (cursor > 0) {
    const previous = text[cursor - 1];
    if (previous !== '\n' && previous !== '\r') break;
    cursor -= 1;
  }
  return cursor;
}

/** Compatibility split — prefer native `tryNativeSplit` / `parseBlocks`. */
export function splitWithMicromark(text: string): SplitDocument {
  const root = parseMarkdown(text);
  const spans: BlockSpan[] = [];

  for (const node of root.children) {
    const position = node.position;
    if (position?.start.offset === undefined || position.end.offset === undefined) continue;
    const start = position.start.offset;
    const end = trimTrailingNewlines(text, position.end.offset);
    if (end <= start) continue;
    const markdown = text.slice(start, end);
    spans.push({
      kind: kindOf(node, markdown),
      start,
      end,
      markdown,
      node,
    });
  }

  if (spans.length === 0) {
    return { spans: [], leading: '', gaps: [], trailing: text };
  }

  const gaps: string[] = [];
  for (let index = 0; index + 1 < spans.length; index += 1) {
    gaps.push(text.slice(spans[index]!.end, spans[index + 1]!.start));
  }

  return {
    spans,
    leading: text.slice(0, spans[0]!.start),
    gaps,
    trailing: text.slice(spans[spans.length - 1]!.end),
  };
}
