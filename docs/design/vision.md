# Vision — @roobli/md

## Why a new engine

Noto already speaks a careful markdown dialect through micromark + mdast
extensions (`src/shared/markdown/v3/`). That stack is correctness-first and
correct enough to edit a real vault. It is not yet fast enough on mid-sized
files for the open path Noto wants, and it was never designed as a
**WYSIWYG-serving** core: the editor wants stable block identities, exact
source spans, and cheap incremental reparse — habits Typora trained users on.

`@roobli/md` owns that core under the same roof as `@roobli/canvas`: a small
public MIT package Noto (and later other hosts) can depend on.

## Product goals

1. **Surpass Typora for real editing habits**, not for marketing checklists.
   - Byte-exact friendly: untouched blocks and gaps round-trip as sliced source,
     not re-serialized dialect output.
   - Fast open on large vaults: beat Noto’s current micromark medium (~570 ms)
     and large (~2.3 s) Linux corpus numbers; stay honest that Typora itself
     fails to load Noto’s 2 MB+ corpus files.
   - Dialect Noto needs: CommonMark subset + GFM tables / strikethrough /
     task lists + `$`/`$$` math + YAML frontmatter + CJK-friendly emphasis.
2. **Block-first API.** Top-level blocks with `start`/`end`, kind, optional
   mdast (or successor) node, and literal gaps between them — the shape
   `parseDocument` / `splitBlocks` / wire `nodes` already assume.
3. **Replaceable implementation.** Phase 0 wrapped micromark. Phase 1 adds a
   native block scanner with micromark fallback. The public contract must not
   force callers to import micromark types forever.
4. **No vault leakage.** Synthetic and public fixtures only in this repo.
   Never dump RooB private note content here.

## Non-goals (for now)

- Shipping a full WYSIWYG editor UI (that stays in Noto / ProseMirror).
- Pirating or redistributing Typora binaries or proprietary source
  (including macOS `TypeMark/appsrc`).
- Matching every Typora extension or theme quirk.

## Phases (summary)

See [`roadmap.md`](./roadmap.md) for the full table. Short form:

| Phase | Focus |
| ----- | ----- |
| **0** (done) | API + micromark behind `// replace` |
| **1** (done) | Native splitter + offsets (heading/paragraph/list/fence/…) |
| **2** (done) | GFM tables + task lists natively |
| **3** (done) | Math / frontmatter / HTML / defs + synthetic A/B bench |
| **4** (done) | Incremental / block-local reparse |
| **5** (done) | Serialize / byte-exact save |
| **6** | Drop hot-path micromark |

## Success metric

Noto can swap `splitBlocks` / the micromark dialect module for `@roobli/md`
without changing the wire contract (`NotoDocumentWire` spans + origins +
nodes), and measured open on the medium Linux corpus is clearly under today’s
micromark main-parse cost while preserving byte fidelity tests.
