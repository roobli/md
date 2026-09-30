import { describe, expect, it } from 'vitest';
import { parseDocument } from './parse.js';
import { identityUnits, serializeDocument, type SerializeUnit } from './serialize.js';
import type { EngineDocument } from './types.js';

/**
 * A save builds the next document from the blocks it moved and a few small
 * reparses instead of parsing its whole output again. That is only sound if
 * the document it builds is the one a parse of the output would give; these
 * hold it to exactly that.
 */

const encoder = new TextEncoder();

function parsed(text: string, bom = false): EngineDocument {
  const body = encoder.encode(text);
  const bytes = bom ? Uint8Array.from([0xef, 0xbb, 0xbf, ...body]) : body;
  const result = parseDocument(bytes);
  if (result.status !== 'parsed') throw new Error(result.message);
  return result.document;
}

function shape(document: EngineDocument) {
  return {
    envelope: document.envelope,
    text: document.text,
    leading: document.leading,
    trailing: document.trailing,
    gaps: document.gaps,
    blocks: document.blocks.map((block) => [block.kind, block.start, block.end, block.markdown, block.node]),
  };
}

/** Serialize, then check the document against a parse of the output. */
function expectFaithful(document: EngineDocument, units: SerializeUnit[], label: string, envelope?: { hasFinalNewline?: boolean }) {
  const result = envelope ? serializeDocument(document, { units, envelope }) : serializeDocument(document, { units });
  if (result.status !== 'serialized') return result;
  const full = parseDocument(result.outputBytes);
  if (full.status !== 'parsed') throw new Error(full.message);
  expect(shape(result.document), label).toEqual(shape(full.document));
  return result;
}

const SOURCE = `---
title: Saves
---

# Title

A paragraph with *emphasis* and a [link](https://example.com).
It continues on a second line.

- first item
- second item
  - nested item

Between the lists.

- another list

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

const REPLACEMENTS = [
  'A plain paragraph.', '```\nnever closed', '$$\nnever closed', '<!--\nnever closed', '- a list item',
  '> a quote', '# A heading', '---', 'Title\n===', '1. numbered', '| x | y |\n| - | - |\n| 1 | 2 |',
  '[r]: /u', '[^n]: note', '    indented', '<div>\nhtml', 'text with trailing spaces   ',
];

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function editedUnits(document: EngineDocument, seed: number): SerializeUnit[] {
  const random = rng(seed);
  const units: SerializeUnit[] = identityUnits(document);
  const operations = 1 + Math.floor(random() * 3);
  for (let op = 0; op < operations && units.length > 1; op += 1) {
    const at = Math.floor(random() * units.length);
    const pick = random();
    const markdown = REPLACEMENTS[Math.floor(random() * REPLACEMENTS.length)]!;
    if (pick < 0.4) units[at] = { origin: units[at]!.origin, markdown };
    else if (pick < 0.7) units.splice(at + (random() < 0.5 ? 0 : 1), 0, { origin: null, markdown });
    else units.splice(at, 1);
  }
  return units;
}

describe('the document a save builds without a full reparse', () => {
  const variants: [string, string, boolean][] = [
    ['LF', SOURCE, false],
    ['CRLF', SOURCE.replace(/\n/g, '\r\n'), false],
    ['BOM', SOURCE, true],
    ['no final newline', SOURCE.trimEnd(), false],
    ['no frontmatter', SOURCE.slice(SOURCE.indexOf('# Title')), false],
  ];
  for (const [name, text, bom] of variants) {
    it(`is the one a parse of the output gives (${name}, 500 generated saves)`, () => {
      const document = parsed(text, bom);
      let serialized = 0;
      for (let seed = 1; seed <= 500; seed += 1) {
        const result = expectFaithful(document, editedUnits(document, seed), `${name} seed ${seed}`);
        if (result.status === 'serialized') serialized += 1;
      }
      expect(serialized).toBeGreaterThan(400);
    });
  }

  it('moves untouched blocks instead of re-creating them', () => {
    const document = parsed(SOURCE);
    const units = identityUnits(document);
    const target = document.blocks.findIndex((block) => block.markdown === 'Between the lists.');
    units[target] = { origin: target, markdown: 'Between the two lists.' };
    const result = expectFaithful(document, units, 'edit');
    if (result.status !== 'serialized') throw new Error('expected a save');
    // Before the edit: the very same objects. After it: the same text, moved.
    expect(result.document.blocks[0]).toBe(document.blocks[0]);
    expect(result.document.blocks[target - 2]).toBe(document.blocks[target - 2]);
    expect(result.document.blocks.at(-1)!.markdown).toBe(document.blocks.at(-1)!.markdown);
    expect(result.document.blocks.at(-1)!.start).toBe(document.blocks.at(-1)!.start + 4);
  });

  it('follows an unclosed fence to the end of the note', () => {
    const document = parsed(SOURCE);
    const units = identityUnits(document);
    const target = document.blocks.findIndex((block) => block.markdown === 'Between the lists.');
    // A tilde fence: nothing later in the note can close it.
    units[target] = { origin: target, markdown: '~~~~\nnever closed' };
    const result = expectFaithful(document, units, 'fence');
    if (result.status !== 'serialized') throw new Error('expected a save');
    expect(result.document.blocks.at(-1)!.kind).toBe('fenced-code');
    expect(result.document.blocks.length).toBe(target + 1);
  });

  it('merges two lists when the paragraph between them goes', () => {
    const document = parsed(SOURCE);
    const target = document.blocks.findIndex((block) => block.markdown === 'Between the lists.');
    const units = identityUnits(document).filter((_, index) => index !== target);
    const result = expectFaithful(document, units, 'merge');
    if (result.status !== 'serialized') throw new Error('expected a save');
    expect(result.document.blocks.length).toBe(document.blocks.length - 2);
  });

  it('handles the first and last blocks going, and the final newline changing', () => {
    const document = parsed(SOURCE);
    expectFaithful(document, identityUnits(document).slice(1), 'first');
    expectFaithful(document, identityUnits(document).slice(0, -1), 'last');
    expectFaithful(document, identityUnits(document), 'final newline', { hasFinalNewline: false });
    expectFaithful(document, [{ origin: null, markdown: '---\ntitle: new\n---' }, ...identityUnits(document).slice(1)], 'frontmatter');
  });
});
