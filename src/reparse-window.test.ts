import { describe, expect, it } from 'vitest';
import { parseBlocks } from './parse.js';
import { reparseFromText } from './reparse.js';
import type { SplitDocument } from './types.js';

/**
 * An incremental reparse is only correct if it says what a whole parse of the
 * same text says. These hold it to exactly that, including for edits whose
 * effect reaches well past the blocks they touched.
 */

function shape(split: SplitDocument) {
  return {
    spans: split.spans.map((span) => [span.kind, span.start, span.end, span.markdown]),
    leading: split.leading,
    gaps: split.gaps,
    trailing: split.trailing,
  };
}

function expectSameAsFull(prior: SplitDocument, next: string, neighborSlack: number, label = ''): void {
  const incremental = reparseFromText(prior, next, { neighborSlack });
  expect(shape(incremental), label).toEqual(shape(parseBlocks(next)));
}

const PARAGRAPHS = Array.from({ length: 12 }, (_, index) => `Paragraph ${index}.`).join('\n\n') + '\n';

describe('reparse windows that an edit runs out of', () => {
  it('follows an unclosed fence to the end of the note', () => {
    const prior = parseBlocks(PARAGRAPHS);
    const at = PARAGRAPHS.indexOf('Paragraph 3.');
    const next = `${PARAGRAPHS.slice(0, at)}\`\`\`\n${PARAGRAPHS.slice(at)}`;
    for (const slack of [0, 1, 2]) expectSameAsFull(prior, next, slack, `slack ${slack}`);
    expect(parseBlocks(next).spans.at(-1)!.kind).toBe('fenced-code');
  });

  it('follows an unclosed comment, and math, the same way', () => {
    const prior = parseBlocks(PARAGRAPHS);
    const at = PARAGRAPHS.indexOf('Paragraph 5.');
    for (const opener of ['<!--\n', '$$\n', '<script>\n']) {
      const next = `${PARAGRAPHS.slice(0, at)}${opener}${PARAGRAPHS.slice(at)}`;
      for (const slack of [0, 1]) expectSameAsFull(prior, next, slack, `${JSON.stringify(opener)} slack ${slack}`);
    }
  });

  it('picks up a closing fence that ends a fence which used to run to the end', () => {
    const text = `Intro\n\n\`\`\`\n${PARAGRAPHS}`;
    const prior = parseBlocks(text);
    expect(prior.spans.at(-1)!.kind).toBe('fenced-code');
    const at = text.indexOf('Paragraph 4.');
    const next = `${text.slice(0, at)}\`\`\`\n\n${text.slice(at)}`;
    for (const slack of [0, 1]) expectSameAsFull(prior, next, slack, `slack ${slack}`);
  });

  it('lets the block before the window take in a line that now continues it', () => {
    // "- item" interrupted the paragraph; without the marker it is a lazy
    // continuation line, so the paragraph before the edit grows.
    const text = 'Intro\n\nLead paragraph\n- item\n\nOutro\n';
    const prior = parseBlocks(text);
    const next = text.replace('- item', 'item');
    for (const slack of [0, 1]) expectSameAsFull(prior, next, slack, `slack ${slack}`);
  });

  it('keeps the identity of blocks outside the window when nothing ran on', () => {
    const prior = parseBlocks(PARAGRAPHS);
    const next = PARAGRAPHS.replace('Paragraph 6.', 'Paragraph six.');
    const result = reparseFromText(prior, next, { neighborSlack: 1 });
    expect(shape(result)).toEqual(shape(parseBlocks(next)));
    expect(result.spans[0]).toBe(prior.spans[0]);
    expect(result.spans[4]).toBe(prior.spans[4]);
    expect(result.spans[11]!.markdown).toBe(prior.spans[11]!.markdown);
    expect(result.dirtyFrom).toBe(5);
    expect(result.dirtyTo).toBe(7);
  });
});

/** A small deterministic generator, so a failure names a reproducible case. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const SOURCE = `---
title: Windows
---

# Title

A paragraph with *emphasis* and a [link](https://example.com).
It continues on a second line.

- first item
- second item
  - nested item

1. one
2. two

> A quote
> that goes on.

\`\`\`ts
const value = 1;

const other = 2;
\`\`\`

| a | b |
| - | - |
| 1 | 2 |

$$
x = y^2
$$

<div align="center">html</div>

Text with a footnote.[^f]

[^f]: The footnote.

[ref]: https://example.com/ref

Setext heading
--------------

    indented code

***

Last paragraph.
`;

const SNIPPETS = [
  '```\n', '```', '~~~\n', '$$\n', '<!--\n', '-->', '<div>\n', '</div>\n', '- ', '* ', '1. ', '> ', '# ',
  '---\n', '===\n', '    ', '\n', '\n\n', '| x | y |\n| - | - |\n', '[r]: /u\n', '[^n]: note\n', 'word ', 'text\n',
];

describe('reparse windows, against a whole parse, on generated edits', () => {
  for (const slack of [0, 1]) {
    it(`agrees with parseBlocks on 600 random edits (slack ${slack})`, () => {
      const prior = parseBlocks(SOURCE);
      for (let seed = 1; seed <= 600; seed += 1) {
        const random = rng(seed * 7 + slack);
        const at = Math.floor(random() * (SOURCE.length + 1));
        const pick = random();
        let next: string;
        if (pick < 0.55) {
          const snippet = SNIPPETS[Math.floor(random() * SNIPPETS.length)]!;
          next = SOURCE.slice(0, at) + snippet + SOURCE.slice(at);
        } else if (pick < 0.85) {
          const end = Math.min(SOURCE.length, at + 1 + Math.floor(random() * 40));
          next = SOURCE.slice(0, at) + SOURCE.slice(end);
        } else {
          const end = Math.min(SOURCE.length, at + 1 + Math.floor(random() * 20));
          const snippet = SNIPPETS[Math.floor(random() * SNIPPETS.length)]!;
          next = SOURCE.slice(0, at) + snippet + SOURCE.slice(end);
        }
        expectSameAsFull(prior, next, slack, `seed ${seed}`);
      }
    });
  }
});
