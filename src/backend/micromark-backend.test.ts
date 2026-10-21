import { describe, expect, it } from 'vitest';
import type { Paragraph, PhrasingContent } from 'mdast';
import { splitWithMicromark } from './micromark-backend.js';

/** The first paragraph's children as `type(text)` tokens. */
function inline(text: string): string {
  const node = splitWithMicromark(text).spans[0]?.node as Paragraph | null | undefined;
  if (!node || node.type !== 'paragraph') throw new Error('no paragraph');
  const show = (child: PhrasingContent): string => {
    if (child.type === 'text') return JSON.stringify(child.value);
    if ('children' in child) return `${child.type}(${child.children.map(show).join(' ')})`;
    return child.type;
  };
  return node.children.map(show).join(' ');
}

describe('legacy micromark backend: CJK-friendly strikethrough', () => {
  // GFM flanking alone leaves these tildes as text: a CJK letter on one side
  // and punctuation on the other. The amendment `*` and `_` already take
  // applies to `~~` too.
  it('strikes a run between CJK text and punctuation', () => {
    expect(inline('中~~「删」~~文\n')).toBe('"中" delete("「删」") "文"');
    expect(inline('文~~:~~\n')).toBe('"文" delete(":")');
  });

  it('strikes a run holding nested emphasis next to CJK text', () => {
    expect(inline('文~~***:***~~\n')).toBe('"文" delete(emphasis(strong(":")))');
  });

  it('keeps a single tilde as text', () => {
    expect(inline('中~删~文\n')).toBe('"中~删~文"');
  });

  it('leaves Latin flanking as GFM has it', () => {
    expect(inline('a~~.b~~\n')).toBe('"a~~.b~~"');
  });
});
