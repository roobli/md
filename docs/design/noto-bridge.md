# Noto bridge — plugging `@roobli/md` into markdown v3

Noto’s contracts live in `Noto/src/shared/markdown/v3/`. Read those before
changing this package’s public API. This doc is the map, not a fork of those
types.

## What Noto expects today

| Entry | Role |
| ----- | ---- |
| `parseDocument(bytes)` | Main-process: UTF-8 + BOM + line endings → `NotoDocument` with blocks, gaps, leading/trailing, `nodes` |
| `splitBlocks(text)` | Shared: top-level spans with `kind`, `start`/`end`, `markdown`, `semanticKey`, mdast `node` |
| `toWire` / `NotoDocumentWire` | IPC: text + origins + spans + optional `nodes` (skip renderer reparse) |
| `docFromSpans` (PM bridge) | Renderer builds ProseMirror from spans/nodes — already cheap (~ms) |
| `parseSingleBlock` | Save validation: edited unit must remain exactly one block |
| Byte-exact gaps | Untouched blocks sliced from original bytes; gaps/leading/trailing preserved |

Block kinds (`NotoBlockKind`): heading, paragraph, bullet/ordered/task list,
quote, fenced/indented code, table, display-math, frontmatter, html,
thematic-break, footnote-definition, link-definition.

Dialect module: `syntax.ts` — GFM (`singleTilde: false`), CJK-friendly
emphasis, math (`singleDollarTextMath: true`), YAML frontmatter.

## How `@roobli/md` maps

Phase 0+ exports a host-agnostic twin (Phase 1 prefers a native splitter, then
falls back to micromark — same shapes):

- `parseBlocks(text)` ≈ `splitBlocks` (spans + leading/gaps/trailing + nodes)
- `parseDocument(bytes)` ≈ Noto’s `parseDocument` without Noto’s branded IDs /
  crypto hashing details (optional helpers; Noto may keep hashing in-process)
- `BlockKind` aligns 1:1 with `NotoBlockKind` string unions
- `parseSingleBlock(markdown)` for the save check
- `reparseBlocks({ prior, edit?, replacedBlocks? })` for incremental edits
  (Phase 4)

### How Noto would call incremental reparse

Today `NotoEditor.replaceMarkdown` runs `splitBlocks` on the **whole** buffer,
then keeps a common prefix/suffix of equal block markdown. With `@roobli/md`:

1. Keep the last accepted `SplitDocument` from open / prior reparse.
2. Diff block markdown arrays to find `prefix` / `suffix` (same as today).
3. Call `reparseBlocks({ prior, text: newMarkdown, replacedBlocks: { from: prefix, to: next.length - suffix - 1 }, neighborSlack: 1 })` instead of a full split.
4. Single-block save validation can stay on `parseSingleBlock`; when applying
   one accepted unit, use `neighborSlack: 0` with `replacedBlocks: { from: i, to: i }`.

Noto integration path (later):

1. Depend on `@roobli/md`.
2. Implement `splitBlocks` as a thin adapter over `parseBlocks` (map kinds,
   compute `semanticKey` if the engine does not yet).
3. Keep `sha256`, branded IDs, and serialize/`NotoTransaction` in Noto until
   the engine grows a serialize story.
4. Preserve wire `nodes`: open path must still ship top-level nodes so the
   renderer does not reparse.

## Byte-exact gaps

The engine’s split MUST cover every character of `text` exactly once across
`leading` + span markdown + `gaps` + `trailing`. That is the serializer’s
foundation. Phase 0 already asserts this in tests.

## Performance hand-off

Noto benches: Linux main `parseDocument` ≈ 124 ms / **570 ms** / **2424 ms**
for 66 KB / 525 KB / 2.1 MB after wire-nodes removed the duplicate renderer
parse. The remaining critical path **is** the full dialect parse.

`@roobli/md` owns making that parse faster (incremental, lazier mdast, or a
purpose-built block scanner) without breaking the bridge above.
