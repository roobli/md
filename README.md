# @roobli/md

WYSIWYG-first markdown engine for [Noto](https://github.com/roobli/Noto).

The goal is a parser built around **real editing habits**, not around dumping a
full AST once and hoping the editor can live with it: block-oriented spans with
byte offsets, gaps preserved for untouched regions, dialect coverage Noto
already needs (CommonMark + GFM tables/strikethrough/task lists + math + YAML
frontmatter + CJK-friendly emphasis), and open times that beat the micromark
baseline Noto measures today (~570 ms medium / ~2.3 s large on the Linux
corpus).

Noto itself is AGPL-3.0. This package is **MIT**, same as
[`@roobli/canvas`](https://github.com/roobli/canvas), so hosts that are not Noto
can depend on it without inheriting that copyleft.

## Status

**Phase 5 shipped** — `serializeDocument` / hardened `joinSplit` implement
Noto-aligned byte-exact saves: untouched spans sliced from source, gaps
preserved, edited spans via host markdown or `renderMarkdown`. Phase 4
`reparseBlocks` does incremental / block-local reparse. Phase 3 native scanner
covers heading / paragraph / list / fenced code / quote / thematic / GFM tables
/ task lists / **display math** / **YAML frontmatter** / **HTML blocks** /
**link + footnote definitions**. Synthetic medium/large A/B vs micromark:
native ~4.5 ms / ~14.5 ms vs micromark ~304 ms / ~1.5 s (see
[`docs/design/bench.md`](docs/design/bench.md)). Phase 0–4 done.
Next: Phase 6 (quarantine micromark from the hot path).

See:

- [`docs/design/vision.md`](docs/design/vision.md) — product goal
- [`docs/design/roadmap.md`](docs/design/roadmap.md) — phased plan
- [`docs/design/bench.md`](docs/design/bench.md) — native vs micromark numbers
- [`docs/design/typora-notes.md`](docs/design/typora-notes.md) — Typora study (interop research)
- [`docs/design/noto-bridge.md`](docs/design/noto-bridge.md) — how this plugs into Noto v3
- [`docs/design/contract-v0.md`](docs/design/contract-v0.md) — engine contract sketch

## Install

```
pnpm add github:roobli/md
```

## Usage

```ts
import {
  parseBlocks,
  parseDocument,
  reparseBlocks,
  serializeDocument,
  identityUnits,
  replaceBlock,
} from "@roobli/md";

const split = parseBlocks("# Hello\n\nWorld\n");
// split.spans[0].kind === "heading"
// split.spans[0].start / .end index into the source string

const next = reparseBlocks({
  prior: split,
  edit: { priorStart: split.spans[1].start, priorEnd: split.spans[1].end, inserted: "Moon" },
  replacedBlocks: { from: 1, to: 1 },
  neighborSlack: 0,
});
// next.spans[0] === split.spans[0] (untouched identity)

const doc = parseDocument(new TextEncoder().encode("# Hello\n\nWorld\n"));
if (doc.status === "parsed") {
  const saved = replaceBlock(doc.document, 0, "# Renamed");
  // untouched "World" block sliced from source — not re-serialized
}
```

## Scripts

```
pnpm install
pnpm verify   # typecheck + test + build
pnpm bench:ab # synthetic medium/large native vs micromark
```

## License

MIT © roobli
