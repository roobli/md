# @roobli/md

A Markdown engine for editors that must not rewrite the file.

`@roobli/md` splits a document into top-level blocks with exact byte offsets
and keeps the gaps between them. A host can then re-parse only the part that
changed, and save by slicing every untouched block straight from the original
source instead of re-serializing it. It is the engine under
[Noto](https://github.com/roobli/Noto), and it has no dependency on any editor
or UI.

MIT licensed, so a host that is not Noto can use it without taking on Noto's
AGPL.

## What it guarantees

- **Byte-exact identity.** Parse a document, serialize it with every block
  untouched, and you get the same bytes back: line endings, BOM, trailing
  whitespace and odd gaps included. Noto's docs site checks this on every page
  it publishes.
- **Stable spans.** Every block carries its `start` and `end` in the source,
  its kind, and the literal gap before it.
- **Local reparse.** `reparseBlocks` and `reparseFromText` rebuild only the
  window around an edit; blocks outside it keep their identity.
- **One dialect.** CommonMark plus GFM tables, task lists and strikethrough,
  `$`/`$$` math, YAML frontmatter, footnotes, callouts, wiki links and
  CJK-friendly emphasis. Behaviour is checked against micromark for parity.

## Status

`0.1.x`: in production as Noto's default engine since Noto
`v0.0.2-alpha.112`. The API may still change before 1.0; every change is in
the [changelog](CHANGELOG.md). Published to npm once the contract reaches v1;
until then, install from a tag.

On a synthetic corpus, the native scanner splits a medium document in about
4.5 ms and a large one in about 14.5 ms, against about 304 ms and 1.5 s for
micromark ([bench](docs/design/bench.md)).

Design notes: [vision](docs/design/vision.md) ·
[roadmap](docs/design/roadmap.md) · [contract](docs/design/contract-v0.md) ·
[Noto bridge](docs/design/noto-bridge.md) ·
[Typora interop notes](docs/design/typora-notes.md)

## Install

```
pnpm add github:roobli/md#v0.1.19
```

Pin a tag: `main` moves. A host that runs install scripts may need to allow
this package's `prepare` step, which builds `dist/` with `tsc`.

## Usage

```ts
import {
  parseBlocks,
  parseDocument,
  reparseBlocks,
  reparseFromText,
  serializeDocument,
  identityUnits,
  replaceBlock,
} from "@roobli/md";

const split = parseBlocks("# Hello\n\nWorld\n");
// split.spans[0].kind === "heading"
// split.spans[0].start / .end index into the source string

const next = reparseFromText(split, "# Hello\n\nMoon\n");
// or reparseBlocks({ prior, edit, replacedBlocks, neighborSlack })
// next.spans[0] === split.spans[0] when the heading is outside the dirty window

const doc = parseDocument(new TextEncoder().encode("# Hello\n\nWorld\n"));
if (doc.status === "parsed") {
  const saved = replaceBlock(doc.document, 0, "# Renamed");
  // untouched "World" block sliced from source — not re-serialized
}
```


## Local folder browser (`md serve`)

Thin **read-only** localhost HTTP UI for a directory. Markdown preview uses
`parseBlocks` → IR → HTML (same dogfood path as Noto.docs). Not Noto Electron,
not holt, not a collab surface.

```
pnpm build
node dist/serve/cli.js serve ./folder
# or, after link/install: md serve ./folder
```

Defaults to `127.0.0.1:4321`. Optional `--port` / explicit `--host 0.0.0.0`.
Root is pinned by the CLI argument; the UI cannot change it.

## Scripts

```
pnpm install
pnpm verify   # typecheck + test + build
pnpm bench:ab # synthetic medium/large native vs @roobli/md/legacy-micromark
```

## License

MIT © roobli
