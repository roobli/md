# Roadmap — @roobli/md

Phases are ordered for Noto’s bridge (`docs/design/noto-bridge.md`): keep
`parseBlocks` / `parseDocument` stable, grow the native scanner behind them,
and only then drop micromark from the hot path.

| Phase | Status | Deliverable |
| ----- | ------ | ----------- |
| **0** | **Done** | Package scaffold, design docs, public API. Micromark + mdast dialect behind `// replace` in `src/backend/micromark-backend.ts`. Coverage + BOM tests. |
| **1** | **Done (vertical slice)** | Own **block splitter** with exact offsets that beats a blank-line-naive split (fences keep internal blanks; loose lists stay one block). Native recognition: ATX/setext heading, paragraph, bullet/ordered list, fenced code, quote, thematic break. **Fall back to micromark** for unknown constructs. Bench vs micromark deferred. |
| **2** | **Done** | Native **GFM tables** + **task lists** (strikethrough stays inline inside paragraphs). Micromark fallback shrinks to math / frontmatter / HTML / definitions. |
| **3** | **Done** | Native **display math** (`$$`), **YAML frontmatter**, HTML blocks, link/footnote definitions with exact offsets. Whole-doc micromark fallback no longer triggered for those constructs. Synthetic corpus A/B bench vs micromark recorded in `docs/design/bench.md`. |
| **4** | **Done** | **Incremental / block-local reparse** (`reparseBlocks` + edit range / replaced ordinals). Streaming / first-paint remains a host concern (parse a prefix with `parseBlocks`). |
| **5** | **Done** | **Serialize** dialect aligned with Noto’s byte-exact save rules (untouched spans sliced, not re-emitted). |
| **6** | Planned | Quarantine or remove micromark from the hot path; mdast `node` becomes optional / successor IR. |

## Phase 1 acceptance (this slice)

- [x] `tryNativeSplit(text)` in `src/backend/native-scanner.ts`
- [x] `parseBlocks` prefers native, falls back to micromark
- [x] Fence-with-internal-blank stays **one** `fenced-code` span (naive split fails)
- [x] Loose lists stay one span; math/frontmatter/HTML/definitions still parse via micromark
- [x] Bench vs micromark on a public medium corpus (completed in Phase 3; no private vault files)

## Phase 2 acceptance

- [x] Native **GFM tables** (header + delimiter + body) with exact offsets; `node: null`
- [x] Native **task lists** (bullet/ordered, loose, mixed checkbox → `task-list`)
- [x] Documents that are only Phase 1+2 constructs no longer hit micromark
- [x] Micromark remains for display math, YAML frontmatter, HTML blocks, link/footnote defs (until Phase 3)
- [x] Bench vs micromark on a public medium corpus (completed in Phase 3)

## Phase 3 acceptance

- [x] Native **YAML frontmatter** at doc start with exact offsets; `node: null`
- [x] Native **display math** `$$` fences (same-line `$$…$$` stays paragraph / inline)
- [x] Native **HTML blocks** (CommonMark types 1–7 subset used by Noto’s dialect)
- [x] Native **link-definition** + **footnote-definition** (incl. indented continuations)
- [x] Whole-doc micromark fallback no longer fires for Phase 3 constructs
- [x] `scripts/bench-ab.mjs` synthetic medium/large A/B vs micromark; numbers in `docs/design/bench.md`

Phase 3 **shipped** on `main`. `// replace` path in `micromark-backend.ts` / `parse.ts` remains for the full swap (Phase 6).

### What still falls back / remaining gaps

- **Whole-doc micromark fallback**: not triggered for Phase 1–3 dialect documents (`tryNativeSplit` returns a split). Compatibility path remains if native ever returns `null`.
- **Indented code**: still labeled `paragraph` natively (micromark would say `indented-code`); no whole-doc bounce.
- **Line-prefix offsets**: native spans include up to three leading spaces on the opening line; micromark often starts at the marker — coverage invariant still holds.
- **CJK emphasis / `semanticKey`**: block split is kind+offset only; inline CJK flanking stays a micromark/host concern until a later IR phase.
- **Phase 4 done**: `reparseBlocks` stitches local native reparses; see contract.
- **Phase 5 done**: `serializeDocument` / hardened `joinSplit`; see contract.

## Phase 4 acceptance

- [x] `reparseBlocks({ prior, edit?, replacedBlocks?, neighborSlack? })` in `src/reparse.ts`
- [x] Reparse only dirty window (+ neighbors); stitch spans/gaps with absolute offsets
- [x] Tests: edit middle paragraph, edit fence, insert/delete block boundary; contiguous offsets; untouched markdown identity
- [x] Contract + roadmap document the API; micromark stays out of the hot path
- [x] Noto bridge note: `replaceMarkdown` / single-block path can call `reparseBlocks`

Phase 4 **shipped** on `main`. Streaming first-paint hooks stay with the host
(open can still `parseBlocks` a growing prefix); no separate streaming API in
this package yet.


## Phase 5 acceptance

- [x] Untouched spans emitted by slicing original source offsets (never re-stringify)
- [x] Gaps between adjacent pristine / blank-line neighbours reused from prior split
- [x] Edited spans via host markdown or `renderMarkdown` dialect path (Noto-compatible defaults)
- [x] `joinSplit(split, source?)` hardened; `serializeDocument` + `replaceBlock` + identity round-trips
- [x] Tests: open → touch one block → file equals except that block; long rule / aligned table preserved
- [x] Contract + roadmap + Noto bridge adoption notes

Phase 5 **shipped** on `main`. Full Noto transaction versioning / sha256 /
preserved-range store checks stay in Noto until the bridge adopts this API.

## Noto hand-off checkpoints

After Phase 2+: adapter can map `parseBlocks` → `splitBlocks` while Noto keeps
branded IDs and hashing. After Phase 5: Noto can call `serializeDocument` /
`replaceBlock` (or keep its richer `NotoTransaction` wrapper). Wire `nodes`
remain a host concern until the engine’s IR is stable.

### Phase 6 next

Quarantine or remove micromark from the hot path; make mdast `node` optional /
successor IR. Compatibility `// replace` boundary in `micromark-backend.ts`
stays until native covers every construct the fallback still might see.
