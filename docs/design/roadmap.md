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
| **4** | **Next** | **Incremental / block-local reparse**; streaming / first-paint hooks for large opens. |
| **5** | Planned | **Serialize** dialect aligned with Noto’s byte-exact save rules (untouched spans sliced, not re-emitted). |
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
- **Phase 4 next**: incremental / block-local reparse and streaming first-paint hooks.

## Noto hand-off checkpoints

After Phase 2+: adapter can map `parseBlocks` → `splitBlocks` while Noto keeps
branded IDs, hashing, and serialize. After Phase 5: serialize can move or stay
in Noto. Wire `nodes` remain a host concern until the engine’s IR is stable.
