/**
 * Corpus A/B bench: native scanner vs micromark backend.
 *
 * Generates synthetic medium/large documents at Noto PROFILE_OPEN orders of
 * magnitude (~512 KiB / ~2 MiB). No private vault content — public lorem shaped
 * like a technical note (headings, prose, lists, tables, fences, math).
 *
 * Usage:
 *   node scripts/bench-ab.mjs
 *   node scripts/bench-ab.mjs --json
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tryNativeSplit } from '../dist/backend/native-scanner.js';
import { splitWithMicromark } from '../dist/backend/micromark-backend.js';
import { joinSplit } from '../dist/parse.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out', 'bench');

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const WORDS = (
  'the quick brown fox jumps over a lazy dog while parsing markdown into blocks and '
  + 'serializing them back to bytes without losing a single byte of the original file content'
).split(' ');

function sentence(random, words) {
  const picked = [];
  for (let index = 0; index < words; index += 1) {
    picked.push(WORDS[Math.floor(random() * WORDS.length)]);
  }
  const text = picked.join(' ');
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

function paragraph(random) {
  const sentences = [];
  for (let index = 0; index < 3 + Math.floor(random() * 3); index += 1) {
    sentences.push(sentence(random, 8 + Math.floor(random() * 12)));
  }
  return sentences.join(' ');
}

function codeFence(random, index) {
  const lines = [`export function handler${index}(input: string): number {`];
  for (let line = 0; line < 4 + Math.floor(random() * 6); line += 1) {
    lines.push(`  const value${line} = input.length * ${Math.floor(random() * 100)};`);
  }
  lines.push('  return value0;', '}');
  return ['```ts', ...lines, '```'].join('\n');
}

function table(random) {
  const rows = ['| Name | Count | Notes |', '| --- | ---: | --- |'];
  for (let row = 0; row < 3 + Math.floor(random() * 4); row += 1) {
    rows.push(`| item ${row} | ${Math.floor(random() * 1000)} | ${sentence(random, 4)} |`);
  }
  return rows.join('\n');
}

function section(random, index) {
  const blocks = [`## Section ${index}`, paragraph(random)];
  const kind = index % 6;
  if (kind === 0) blocks.push(codeFence(random, index));
  if (kind === 1) blocks.push(table(random));
  if (kind === 2) {
    blocks.push(['- first item', '- second item', '  - nested item', '- [ ] a task', '- [x] a done task'].join('\n'));
  }
  if (kind === 3) blocks.push('$$\n\\sum_{i=0}^{n} x_i = \\frac{n(n+1)}{2}\n$$');
  if (kind === 4) blocks.push(`> ${sentence(random, 12)}`);
  if (kind === 5) blocks.push('<div class="note">\nSynthetic HTML block for bench coverage.\n</div>');
  blocks.push(paragraph(random));
  return blocks;
}

/** Build a document of at least the requested size (Noto corpus.mjs shape). */
export function buildDocument(targetBytes, seed = 7) {
  const random = seeded(seed);
  const blocks = [
    '---',
    'title: Synthetic bench document',
    'source: @roobli/md scripts/bench-ab.mjs',
    '---',
    '# Benchmark document',
    paragraph(random),
  ];
  let size = blocks.reduce((total, block) => total + block.length + 2, 0);
  let index = 0;
  while (size < targetBytes) {
    const next = section(random, index);
    blocks.push(...next);
    size += next.reduce((total, block) => total + block.length + 2, 0);
    index += 1;
  }
  // Sprinkle a few definitions at the end (block-start after blanks).
  blocks.push('[bench-ref]: https://example.com/bench');
  blocks.push('[^bench-note]: Synthetic footnote definition for native path coverage.');
  return { markdown: `${blocks.join('\n\n')}\n`, blocks: blocks.length };
}

const SIZES = [
  ['medium', 512 * 1024],
  ['large', 2 * 1024 * 1024],
];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function timeMs(run) {
  const began = performance.now();
  const value = run();
  return { ms: performance.now() - began, value };
}

function benchOne(label, text, runs = 7, warmup = 2) {
  for (let i = 0; i < warmup; i += 1) {
    tryNativeSplit(text);
    splitWithMicromark(text);
  }
  const nativeTimes = [];
  const microTimes = [];
  let nativeSpans = 0;
  let microSpans = 0;
  for (let i = 0; i < runs; i += 1) {
    const native = timeMs(() => tryNativeSplit(text));
    const micro = timeMs(() => splitWithMicromark(text));
    nativeTimes.push(native.ms);
    microTimes.push(micro.ms);
    nativeSpans = native.value?.spans.length ?? 0;
    microSpans = micro.value.spans.length;
    if (joinSplit(native.value) !== text) {
      throw new Error(`${label}: native coverage failed`);
    }
    if (joinSplit(micro.value) !== text) {
      throw new Error(`${label}: micromark coverage failed`);
    }
  }
  const nativeMed = median(nativeTimes);
  const microMed = median(microTimes);
  return {
    label,
    bytes: Buffer.byteLength(text),
    nativeMs: nativeMed,
    micromarkMs: microMed,
    speedup: microMed / nativeMed,
    nativeSpans,
    microSpans,
  };
}

async function main() {
  const asJson = process.argv.includes('--json');
  await mkdir(OUT, { recursive: true });
  const results = [];
  const lines = [
    '# @roobli/md native vs micromark A/B',
    '',
    `Measured: ${new Date().toISOString()}`,
    'Corpus: synthetic (Noto PROFILE_OPEN medium≈512KiB / large≈2MiB orders of magnitude).',
    'No RooB / private vault content.',
    '',
  ];

  for (const [name, target] of SIZES) {
    const { markdown, blocks } = buildDocument(target);
    const file = path.join(OUT, `${name}.md`);
    await writeFile(file, markdown, 'utf8');
    const row = benchOne(name, markdown);
    row.generatorBlocks = blocks;
    results.push(row);
    lines.push(
      `${name}: ${(row.bytes / 1024).toFixed(0)} KiB, ~${row.generatorBlocks} generator blocks, `
      + `native ${row.nativeSpans} spans / micromark ${row.microSpans} spans`,
    );
    lines.push(
      `  native median  ${row.nativeMs.toFixed(1)} ms`,
    );
    lines.push(
      `  micromark median ${row.micromarkMs.toFixed(1)} ms`,
    );
    lines.push(
      `  speedup        ${row.speedup.toFixed(2)}x (micromark/native)`,
    );
    lines.push('');
  }

  const reportPath = path.join(OUT, 'ab-report.txt');
  await writeFile(reportPath, `${lines.join('\n')}\n`, 'utf8');
  await writeFile(path.join(OUT, 'ab-report.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');

  if (asJson) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } else {
    process.stdout.write(`${lines.join('\n')}\n`);
    process.stdout.write(`Wrote ${reportPath}\n`);
  }
}

await main();
