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

Phase 0+ exports a host-agnostic twin. Phase 6 default path is **native only**
(same shapes; mdast `node` is `null` unless the host uses the legacy entry):

- `parseBlocks(text)` ≈ `splitBlocks` (spans + leading/gaps/trailing + nodes)
- `parseDocument(bytes)` ≈ Noto’s `parseDocument` without Noto’s branded IDs /
  crypto hashing details (optional helpers; Noto may keep hashing in-process)
- `BlockKind` aligns 1:1 with `NotoBlockKind` string unions
- `parseSingleBlock(markdown)` for the save check
- `reparseBlocks({ prior, edit?, replacedBlocks? })` for incremental edits
  (Phase 4)
- `serializeDocument` / `joinSplit(split, source?)` / `renderMarkdown` for
  byte-exact saves (Phase 5)

### How Noto would call incremental reparse

Today `NotoEditor.replaceMarkdown` runs `splitBlocks` on the **whole** buffer,
then keeps a common prefix/suffix of equal block markdown. With `@roobli/md`
(Phase 11 helpers):

1. Keep the last accepted `SplitDocument` from open / prior reparse (invalidate
   or rebuild after local typing that is not itself a reparse — host design).
2. Prefer `reparseFromText(prior, newMarkdown, { neighborSlack: 1 })` when the
   host only has the full next buffer; or derive `sourceEditBetween(joinSplit(prior), newMarkdown)` and pass it to `reparseBlocks`.
3. When ordinals are already known, call `reparseBlocks({ prior, text: newMarkdown, replacedBlocks: { from, to }, neighborSlack: 1 })` instead.
4. Single-block save validation can stay on `parseSingleBlock`; when applying
   one accepted unit, use `neighborSlack: 0` with `replacedBlocks: { from: i, to: i }`.

Noto integration path (later):

1. Depend on `@roobli/md`.
2. Implement `splitBlocks` as a thin adapter over `parseBlocks` (map kinds,
   compute `semanticKey` if the engine does not yet).
3. Keep `sha256` and branded IDs in Noto; map `NotoTransaction.units` →
   `SerializeUnit[]` (origin ordinal + markdown) and call `serializeDocument`,
   or keep Noto’s serialize as a wrapper that still slices via engine offsets.
4. Preserve wire `nodes`: open path must still ship top-level nodes so the
   renderer does not reparse.
5. **Serialize adoption steps**
   - ~~Identity / single-block saves~~ → done in Noto [#82](https://github.com/roobli/Noto/pull/82)
     (flagged `serializeDocument`; A/B golden gates under
     `tests/fixtures/markdown-golden/`).
   - Broaden to multi-block inserts/deletes; keep `outputBytes` parity vs micromark.
   - Point edited-block rendering at `renderMarkdown` (Phase 7–8 ported
     hard-break, list-marker, verbatim runs, bare autolink) or keep Noto
     `syntax.ts` render until the flagged path is default-on.
   - Retire duplicate gap/slice logic in Noto `serialize.ts` when the engine path
     matches preserved-range evidence the store expects.
   - Leave `source` mode (full-file replace) in Noto — it is a host escape hatch.

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

## Recommended next step (post Phase 11)

Adapter spike already lands in Noto (flagged). Host adoptions so far:

- **#81** — `replaceMarkdown` → prior-split cache + `reparseFromText`
  (invalidate after typing): https://github.com/roobli/Noto/pull/81
- **#82** — identity / single-block saves → flagged `serializeDocument`
  (`toEngineDocument` / `toSerializeUnits`; multi-block + `source` mode stay
  on Noto): https://github.com/roobli/Noto/pull/82

Remaining:

1. Broaden flagged serialize to multi-block inserts/deletes; keep comparing
   `outputBytes` against Noto's micromark path.
2. Grow Noto option-B golden gates (`tests/fixtures/markdown-golden/` +
   `markdown-golden-gates.test.ts`) before considering default-on; keep
   `semanticKey`, branded IDs, sha256, and wire `nodes` in Noto until the
   engine IR grows. Do **not** flip `NOTO_MARKDOWN_ENGINE` default yet.
3. Open-path / `parseDocument` first measured cut still needs a design pass on
   the Noto side (`docs/performance/measurements.md`).
