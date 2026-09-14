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

**Phase 8 shipped** — serialize dialect verbatim runs (wiki links, alerts,
footnotes, `[TOC]`, snake_case / metrics) and bare http(s) autolinks, matching
Noto’s host handlers. **Phase 7** — hard-break (two trailing spaces) and list
marker / ordered delimiter from `node.data`.
**Phase 6** — micromark quarantined from the hot path; legacy entry
`@roobli/md/legacy-micromark`. Phase 5 `serializeDocument` / hardened
`joinSplit` implement Noto-aligned byte-exact saves. Phase 3 native scanner
covers heading / paragraph / list / fenced code / **indented code** / quote /
thematic / GFM tables / task lists / **display math** / **YAML frontmatter** /
**HTML blocks** / **link + footnote definitions**.
Synthetic medium/large A/B vs micromark (via legacy entry): native ~4.5 ms /
~14.5 ms vs micromark ~304 ms / ~1.5 s (see
[`docs/design/bench.md`](docs/design/bench.md)).
**v0.1.4** — verbatim runs + bare autolink. **v0.1.3** hard-break + list-marker;
**v0.1.2** native indented-code; **v0.1.1** quote/callout split. Noto may pin
`github:roobli/md#v0.1.4` when ready.

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

## Breaking change (Phase 6)

- Default entry **no longer** falls back to micromark. Documents outside the
  Phase 1–5 native dialect are still scanned natively (best-effort kinds), not
  bounced to micromark.
- Direct dependencies on `micromark-extension-*` and `mdast-util-from-markdown`
  moved to **`optionalDependencies`** (needed only for the legacy entry). The
  default path still depends on `mdast-util-to-markdown` (+ GFM/math/frontmatter
  / CJK to-markdown helpers) for `renderMarkdown` on edited blocks — those pull
  some micromark-*util* packages transitively, but the **micromark parser is
  not called** on open / reparse / serialize of pristine spans.
- Compatibility import:

```ts
import { splitWithMicromark } from "@roobli/md/legacy-micromark";
```

## Scripts

```
pnpm install
pnpm verify   # typecheck + test + build
pnpm bench:ab # synthetic medium/large native vs @roobli/md/legacy-micromark
```

## License

MIT © roobli
