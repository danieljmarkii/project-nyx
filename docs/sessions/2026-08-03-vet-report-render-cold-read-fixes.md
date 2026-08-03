# Vet report — five cold-read dead-ends (B-444, B-499, B-500, B-503, B-450)

**Date:** 2026-08-03

Closed five `vet-report-cold-read` / `adversarial-reviewer` findings against
`supabase/functions/generate-report/render.ts` (and one data-layer fix in `report.ts`), the
Step-9 / B-417 PR 7 territory. **Merge-only, no redeploy** — the B-494 deploy hold still stands,
as on the sibling symptom-chart-render fixes (B-497/B-498). Shipped via #576.

Every claim below was verified against the **rendered artifacts**, not the code — the five sample
reports from `scripts/render-trial-report-sample.deno.ts` (Cooper clean / Mira refused / Rosie
completed / Juno truncated / Tama past-window) — and gated in isolated context by both
`adversarial-reviewer` and `vet-report-cold-read`.

## What shipped

- **B-444 — the protein chart now reads in black & white.** `proteinPattern`'s `case 0` emitted an
  empty (solid) fill, so the LARGEST protein band and the solid "no recorded protein" band (`ptc-u`)
  were both flat fills separated only by lightness — false on the caption's "every protein also
  carries a texture, so this reads in black & white", and against §5.8 (every datum carried by a
  shape/texture, not colour). Case 0 now emits a ring; solid is reserved for the no-protein band
  alone. This is the "small fix (texture index 0)" the B-444 row sanctioned over a redraw of the
  design-ratified §5.8 colour-carve. **Residual filed as B-685** (found by `adversarial-reviewer`):
  both colour and texture cycle mod 8 over an uncapped protein list, so ≥9 distinct off-diet proteins
  still repeat a texture+colour pair — a deeper, pre-existing limit that wants the Designer nod §5.8
  requires; not this fix's to redesign.

- **B-499 — two dead-end appendix pointers removed.** (1) The "Timing vs symptoms" correlation line
  (`timingLine`, both the established and null branch) ended "Detail in appendix C" — appendix C is
  the off-diet exposure table, holds no correlation content on any report and is empty on a
  clean/refused one; the stats are already inline. (2) The diet-history treats line ended "Dates in
  appendix C" unconditionally, but on a trial report appendix C lists OFF-DIET exposures only, so a
  permitted treat has no dated row there (64 of 65 on the reviewed artifact). Now conditional on
  appendix C actually being the treats table (`!(snap.trial && !snap.trial.allowedSetUnavailable)` —
  non-trial or dark-permit report). The third pointer B-499 named — the refused-cat Record row's
  "feedings in appendix C" — was already fixed in shipped code; verified still fixed.

- **B-500 — the one not-fully-eaten meal is now itemised WITH ITS DATE.** This one was a real bug I
  first mis-read as resolved; the cold read caught it. Page 1 counts "fully eaten" as `=== 'all'`
  (`report.ts` `finishedMeals`), so an "ate most" meal is the "1" in "86 of 87", and appendix E's
  itemisation copy says "meals … the owner did not record as fully eaten" / "rated below 'ate it
  all'" — but B-532 had filtered the itemisation on `feedingWasFinished` (`most`/`all`), which
  EXCLUDES `most`. So the one meal page 1 singled out had no dated row anywhere, and the surfaces
  disagreed on the threshold. Fix: the no-flag itemisation population is now `intakeRating !== 'all'`,
  matching page 1 and the table's own copy. The "ate most" row is dated but **plain** (`intakeLogRow`
  still bolds only below-`most` ratings), so it is traceable without becoming a false alarm; the
  grouped breakdown still carries it too. Confirmed on Cooper (Jun 24), Juno (Jun 30), Tama (May 4);
  Rosie's two "ate some" still bold+dated; Mira's flag/refusal path is untouched. `feedingWasFinished`
  is now unused in `report.ts` and its import was removed.

- **B-503 — the at-a-glance heading no longer claims one denominator for tiles counted over different
  ranges.** It read "counts over the 46-day window" while the coverage tile reads "43 / 43" over the
  trial's overlap range (§5.1) and the off-diet tile over the evidence range — so 43/43 read as 100%
  of 46. The heading now names the window but flags "except coverage & off-diet, over the trial's own
  range"; each tile already names its own span (B-600). Arithmetic unchanged (§5.1 keeps the
  trial-overlap denominator, so a recheck-scoped report never reads "27 / 56").

- **B-450 — VERIFIED already resolved; no code change.** The literal negative claim §5.2 (G2) forbids
  — "No off-diet exposures logged in this window" — is gone from render output (it survives only in a
  prohibition comment). The appendix-C empty states are record-scoped + anti-reassurance ("No feeding
  in this window is listed here. See the diet-trial block on page 1 before reading that as a clean
  elimination"; "No exposure is listed here … a floor, not a total"), the §5.2 two-sided form,
  resolved by the earlier B-531/B-600 rework. Both gates re-confirmed it compliant on the empty-
  appendix-C artifacts (Mira, Rosie). Closed in the shape of B-445/B-449 (resolved-by-prior-work,
  formally closed with a gate record).

## Tests

Four B-444/B-499/B-503 regression tests added to `render.test.ts`; two data-layer tests updated in
`report.test.ts` for the B-500 change (the old "ate most is FINISHED so a calm record itemises
nothing" test now pins the opposite — it is dated; and the B-213 "empty log" test, whose fixture
carries one `most` tuna meal, now asserts that one meal itemises and only it, never a dump).
Full `deno test` over `supabase/functions/`: **396 passed / 0 failed**, type-checked exactly as the
CI `edge-functions` job runs it (`deno test` without `--no-check`; `deno check scripts/*.deno.ts`
clean).

## Gates (DoD adversarial-review line)

- **`vet-report-cold-read` — CLINIC-READY.** All five items pass on the rendered artifacts; the
  B-500 defect from its first pass is resolved (the singled-out meal itemises with its date, page 1
  and appendix E agree on the threshold, the new row is unbolded and no page-1 intake flag is added —
  no over-alarm regression). B-444/B-499/B-503/B-450 re-confirmed READY.
- **`adversarial-reviewer` — PASS.** First pass held B-499/B-503/B-450 on all five artifacts and
  confirmed B-444's filed collision fixed, surfacing the ≥9-protein residual (filed as **B-685**). It
  correctly broke my initial "B-500 already resolved" read (it had only checked the grouped *count*,
  not a *dated* row — there was none), which is what turned B-500 into a real fix. Re-verify of the
  B-500 data change: **PASS** — `unfinishedRated = !== 'all'` gives exact page-1↔appendix-E parity,
  dates the orphaned "ate most" meal (plain, capped at INTAKE_LOG_CAP + disclosed, no `all` leak),
  and breaks no `feedingWasFinished` consumer (refusal lane / analytics untouched). It named two
  pre-merge residuals, both now addressed: (1) the ≥9-protein caption limit → **B-685**; (2) a stale
  render invariant comment ("rows listed = rows bolded; never a second definition") plus the
  "Meals not finished"/"unfinished meal" wording applying "finished" to a `most` meal against the
  shared predicate → **reconciled this session** (comment corrected; retitled "Meals not fully eaten"
  / "not-fully-eaten meal" to match page-1 vocabulary and the table's own gloss).

## Residuals / not in scope

- **B-685** — the ≥9-distinct-protein colour+texture collision on the off-diet chart (pre-existing;
  wants a Designer per §5.8). Filed this session.
- **B-489** — the null correlation branch still owes a denominator/power statement; named in the code
  comment where the B-499 dead-end pointer was removed, folded in when B-489/B-499's overlap is
  picked up.
- Deploy stays held (B-494); this is merge-only.
- **STATUS.md unchanged** by design: this is Step-9 polish that advances no phase and touches no
  tracked STATUS section (the five B-IDs are backlog items, not STATUS state) — keeping the
  conflict-magnet file's diff empty per the `/wrap` guidance.
