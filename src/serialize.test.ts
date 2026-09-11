import type { Heading, Paragraph } from 'mdast';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './dialect.js';
import { joinSplit, parseBlocks, parseDocument } from './parse.js';
import {
  identityUnits,
  replaceBlock,
  serializeDocument,
  type SerializeUnit,
} from './serialize.js';
import type { EngineDocument } from './types.js';

const encoder = new TextEncoder();

function parsed(source: string | Uint8Array): EngineDocument {
  const bytes = typeof source === 'string' ? encoder.encode(source) : source;
  const result = parseDocument(bytes);
  expect(result.status).toBe('parsed');
  if (result.status !== 'parsed') throw new Error('parse failed');
  return result.document;
}

function editing(document: EngineDocument, ordinal: number, markdown: string): SerializeUnit[] {
  const units = identityUnits(document);
  units[ordinal] = { origin: ordinal, markdown };
  return units;
}

describe('joinSplit (Phase 5 harden)', () => {
  it('slices spans from source when source is provided', () => {
    const text = '# Title\n\nBody with **marks**.\n\n```ts\nconst a = 1;\n```\n';
    const split = parseBlocks(text);
    // Mutate markdown strings — slice path must ignore them.
    const poisoned = {
      ...split,
      spans: split.spans.map((s) => ({ ...s, markdown: 'POISON' })),
    };
    expect(joinSplit(poisoned, text)).toBe(text);
    expect(joinSplit(poisoned)).not.toBe(text);
  });

  it('identity join without source still covers', () => {
    const text = '---\ntitle: t\n---\n\nPara\n';
    expect(joinSplit(parseBlocks(text))).toBe(text);
  });
});

describe('serializeDocument byte fidelity', () => {
  const samples: Record<string, string> = {
    'plain lf': '# Title\n\nBody.\n',
    'no final newline': '# Title\n\nBody.',
    crlf: '# Title\r\n\r\nBody.\r\n',
    'blank line runs': '# Title\n\n\n\nBody.\n\n\n',
    'leading blank lines': '\n\n# Title\n\nBody.\n',
    'tight blocks': '# Title\nBody directly beneath.\n',
    'whitespace only': '\n\n\n',
    empty: '',
    'table and math': '| a |\n| --- |\n| 1 |\n\n$$\nx\n$$\n',
    frontmatter: '---\ntitle: t\n---\n\nBody.\n',
    cjk: '# 标题\n\n中文段落，带标点。\n',
  };

  for (const [name, source] of Object.entries(samples)) {
    it(`identity round-trips "${name}"`, () => {
      const document = parsed(source);
      const result = serializeDocument(document, { units: identityUnits(document) });
      expect(result.status).toBe('serialized');
      if (result.status !== 'serialized') return;
      expect(result.text).toBe(source);
      expect(Buffer.from(result.outputBytes).toString('utf8')).toBe(source);
    });
  }

  it('preserves UTF-8 BOM through an identity save', () => {
    const body = '# Title\n';
    const source = new Uint8Array([0xef, 0xbb, 0xbf, ...encoder.encode(body)]);
    const document = parsed(source);
    expect(document.envelope.bom).toBe('utf8');
    const result = serializeDocument(document, { units: identityUnits(document) });
    expect(result.status).toBe('serialized');
    if (result.status !== 'serialized') return;
    expect(Buffer.from(result.outputBytes).equals(Buffer.from(source))).toBe(true);
  });

  it('open → touch one block → output equals file except that block', () => {
    const source = '# Title\n\nUntouched paragraph.\n\n```ts\nconst a = 1;\n```\n\nTail.\n';
    const document = parsed(source);
    const result = replaceBlock(document, 0, '# Renamed');
    expect(result.status).toBe('serialized');
    if (result.status !== 'serialized') return;

    expect(result.text).toBe(
      '# Renamed\n\nUntouched paragraph.\n\n```ts\nconst a = 1;\n```\n\nTail.\n',
    );
    // Fence must survive as literal source, never re-rendered.
    expect(result.text).toContain('```ts\nconst a = 1;\n```');
    const preservedBlocks = result.preserved.filter((range) => range.role === 'block');
    expect(preservedBlocks).toHaveLength(3);
  });

  it('leaves neighbour author style alone (long rule + aligned table)', () => {
    const source = [
      'Lead paragraph.',
      '',
      '------------------',
      '',
      '| Field | Meaning |',
      '|-------|---------|',
      '| a     | first   |',
      '',
    ].join('\n');
    const document = parsed(source);
    const result = serializeDocument(document, {
      units: editing(document, 0, 'Edited lead.'),
    });
    expect(result.status).toBe('serialized');
    if (result.status !== 'serialized') return;
    expect(result.text).toBe(source.replace('Lead paragraph.', 'Edited lead.'));
    expect(result.text).toContain('------------------');
    expect(result.text).toContain('|-------|---------|');
  });

  it('restores CRLF for an edited block in a CRLF document', () => {
    const source = '# Title\r\n\r\nBody.\r\n';
    const document = parsed(source);
    const result = replaceBlock(document, 1, 'Replaced body.');
    expect(result.status).toBe('serialized');
    if (result.status !== 'serialized') return;
    expect(result.text).toBe('# Title\r\n\r\nReplaced body.\r\n');
    expect(result.text.includes('\n\n')).toBe(false);
  });

  it('preserves gaps from the prior split between pristine neighbours', () => {
    const source = '# A\n\n\n\n# B\n';
    const document = parsed(source);
    expect(document.gaps[0]!.includes('\n\n')).toBe(true);
    const result = serializeDocument(document, { units: identityUnits(document) });
    expect(result.status).toBe('serialized');
    if (result.status !== 'serialized') return;
    expect(result.text).toBe(source);
    // Gap bytes are reused, not canonicalised to a single blank line.
    expect(result.text.indexOf('# B')).toBe(source.indexOf('# B'));
  });
});

describe('serializeDocument safety', () => {
  it('rejects multi-block edited units', () => {
    const document = parsed('# Title\n\nBody.\n');
    const result = replaceBlock(document, 1, 'First.\n\nSecond.');
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.code).toBe('MULTI_BLOCK_UNIT');
  });

  it('rejects forged ordinals', () => {
    const document = parsed('# Title\n');
    const result = serializeDocument(document, {
      units: [{ origin: 99, markdown: '# X' }],
    });
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.code).toBe('FORGED_ORIGIN');
  });

  it('rejects reordered origins', () => {
    const document = parsed('# A\n\n# B\n');
    const result = serializeDocument(document, {
      units: [
        { origin: 1, markdown: null },
        { origin: 0, markdown: null },
      ],
    });
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.code).toBe('REORDERED_ORIGIN');
  });
});

describe('dialect renderMarkdown (edited path)', () => {
  it('emits heading/paragraph with Noto-like markers', () => {
    const heading: Heading = {
      type: 'heading',
      depth: 1,
      children: [{ type: 'text', value: 'Hi' }],
    };
    const para: Paragraph = {
      type: 'paragraph',
      children: [
        { type: 'text', value: 'A ' },
        { type: 'emphasis', children: [{ type: 'text', value: 'soft' }] },
        { type: 'text', value: ' and ' },
        { type: 'strong', children: [{ type: 'text', value: 'loud' }] },
        { type: 'text', value: ' word.' },
      ],
    };
    expect(renderMarkdown(heading)).toBe('# Hi');
    expect(renderMarkdown(para)).toContain('*soft*');
    expect(renderMarkdown(para)).toContain('**loud**');
  });

  it('serialize can render a dirty unit from an mdast node', () => {
    const document = parsed('# Title\n\nBody.\n');
    const node: Heading = {
      type: 'heading',
      depth: 1,
      children: [{ type: 'text', value: 'Renamed' }],
    };
    const units = identityUnits(document);
    units[0] = { origin: 0, markdown: null, node };
    const result = serializeDocument(document, { units });
    expect(result.status).toBe('serialized');
    if (result.status !== 'serialized') return;
    expect(result.text.startsWith('# Renamed\n')).toBe(true);
    expect(result.text).toContain('Body.');
  });
});
