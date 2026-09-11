# Bench — native scanner vs micromark

Synthetic A/B harness: `pnpm bench:ab` → `scripts/bench-ab.mjs`.

Corpus shape matches Noto’s `PROFILE_OPEN` / `scripts/bench/corpus.mjs` orders of
magnitude (medium ≈ 512 KiB, large ≈ 2 MiB): headings, prose, lists, task lists,
tables, fenced code, display math, HTML blocks, plus frontmatter and a couple of
link/footnote definitions. **No RooB / private vault content** — generator is
deterministic public lorem.

## Results (Linux box, 2026-09-11)

Warm process, median of 7 timed runs after 2 warmups. Coverage checked each run
(`joinSplit` equals source for both backends).

| Corpus | Size | Native spans | Native median | Micromark median | Speedup |
| ------ | ---- | ------------ | ------------- | ---------------- | ------- |
| medium | 513 KiB | 2817 | **4.5 ms** | 303.9 ms | **67×** |
| large | 2048 KiB | 11197 | **14.5 ms** | 1484.5 ms | **103×** |

Raw report also written to `out/bench/ab-report.txt` (gitignored) when the
script runs locally.

Noto’s recorded micromark `parseDocument` on similar sizes was ~570 ms medium /
~2.3 s large (full open path). This harness times **split only** (native
`tryNativeSplit` vs `splitWithMicromark`), which is the Phase 3 engine claim.

## Notes

- Span counts matched micromark on this corpus (2817 / 11197).
- Native path sets `node: null`; micromark still attaches mdast nodes (cost
  included in micromark times).
- Re-run after scanner changes: `pnpm bench:ab`.
