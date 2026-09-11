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

**Phase 0** — package scaffold, design docs, and a thin API that currently
delegates to micromark/mdast behind a marked `// replace` boundary. Structure
first; the custom engine replaces that boundary later.

See:

- [`docs/design/vision.md`](docs/design/vision.md) — product goal
- [`docs/design/typora-notes.md`](docs/design/typora-notes.md) — Typora study (interop research)
- [`docs/design/noto-bridge.md`](docs/design/noto-bridge.md) — how this plugs into Noto v3
- [`docs/design/contract-v0.md`](docs/design/contract-v0.md) — engine contract sketch

## Install

```
pnpm add github:roobli/md
```

## Usage (phase 0)

```ts
import { parseBlocks, parseDocument } from "@roobli/md";

const split = parseBlocks("# Hello\n\nWorld\n");
// split.spans[0].kind === "heading"
// split.spans[0].start / .end index into the source string

const doc = parseDocument(new TextEncoder().encode("# Hello\n"));
if (doc.status === "parsed") {
  console.log(doc.document.blocks.length);
}
```

## Scripts

```
pnpm install
pnpm verify   # typecheck + test + build
```

## License

MIT © roobli
