# Signals v2 PR 4 (CUL-9) — L3 photo-record composition fields

**Date:** 2026-08-15

Signals v2 (B-755) PR 4 of 10. Adds **L3 photo-record composition** — additive EVIDENCE fields
(`retainedFood`, `hair`, `bile`) joined from `event_ai_analysis` onto the vomit timing findings.
Server-only change to `generate-signal`, **no redeploy** (G10 — inert until PR 10's single gated
deploy behind the `signals_v2` client flag). Blocked-by CUL-6 (primitives, shipped #639); blocks
CUL-12 (PR 5 — the A2 card that renders these) and CUL-19 (the report-side deploy). Gate:
`clinical-guardrails`.

## What shipped

The load-bearing decision: **L3 is evidence, not a finding type.** It never fires, never ranks, is
never read by a detector — it decorates an already-true timing finding exactly as `medContext.ts`
decorates one with the med-on-board line. So it lives in a pure module wired by `decorateFinding`,
and the engine's fire/rank behaviour is provably unchanged (the diff-scoped "detectors emit no
photoComposition" test).

- **`photoComposition.ts` (new, pure)** — `computePhotoComposition(finding, analyses, nowMs)`:
  - Reads `event_ai_analysis` rows (status `completed` + `incident_type='vomit'` only), re-windowed
    to the finding's own `windowDays` (the analyses query pulls 180d; the timing window is 60d).
  - Collapses the photographed reads into 3h episodes (the engine's `episodeGapHours`, from
    `lib/mealTiming` — G9) with **present-wins** aggregation, so a bout photographed twice counts
    once and a marker seen in any member counts for the bout (never drops a sighting under collapse).
  - `retainedFood` (recognizable/partially-digested food) over the **long-band** episodes only —
    matched by exact onset ms to the finding's `longEpisodeOnsets`; `hair` + `bile` over every
    photographed episode.
  - **Tristate discipline** (§2 L3): only a `yes` read enters a numerator; `unsure`/illegible/absent
    are out of numerator AND (for unsure/illegible) the denominator. Bile keys on the **authoritative
    `bile_present` tristate** (migration 013), with a `contents`-listed bile folded in present-wins —
    matching `report.ts`'s `classifyVomitContents` so the descriptor agrees with the vet report.
  - **Present-only** (G4): each `{count, denominator}` field is attached ONLY when `count ≥ 1`, so a
    zero is silence, never "0 of N" — the structural never-reassure guarantee, most pointedly for
    **hair** (Cannon: frequent hairballs are themselves a disease marker). `numerator ⊆ denominator`
    by construction.
- **`detection.ts`** — new `PhotoComposition` / `PhotoCompositionField` types; `photoComposition?`
  field on the four vomit timing findings (⑤ `postprandial_timing`, L1 `empty_stomach_timing`, the
  merged `timing_story`, ⑥ `timeofday_clustering`); `longEpisodeOnsets?` added to `timing_story`'s
  `long` block (the retained-food join key), copied verbatim by `composeTimingStory` from the merged
  L1 finding. ⑤/⑥ have no long band → no `retainedFood`, hair/bile only. Correlation/reflection/
  safety findings carry no composition.
- **`medContext.ts`** — `decorateFinding` gains a 4th `photoComposition` param (defaults null →
  byte-identical). The four vomit timing findings receive it; the correlation card never does (photo
  contents are not a food↔symptom association).
- **`index.ts`** — the shared `event_ai_analysis` SELECT gains `status, contents, bile_present`
  (the red-flag lane ignores them; L3 filters on them). New `mapPhotoAnalyses`; per-finding
  `computePhotoComposition` inside the decoration map (per-finding because each timing finding has
  its own window + long-onset set, unlike the once-per-regen density/medContext).

### Clinical-guardrails compliance (the named gate)
- **PATTERN 9** (the load-bearing one): derive from the owner-editable **structured fields**
  (`contents`, `bile_present`), NEVER the cached `visual_flags`/`recommendation`/`read_text`. An
  owner edit that clears a false "hair" clears the L3 count by construction — same override-aware
  posture as the B-340 red-flag lane.
- **PATTERN 1 + 8** (never-reassure, test-asserted): enforced **structurally** — present-only makes
  "0 of N" unrepresentable, and that is the first two tests. L3 emits no owner-facing string; the
  string-level G4 regex screen lands with the client copy in CUL-12/PR 5.

## What is NOT in this PR (scope)

The **report regurgitation-descriptor bundle** (§2 L3 / §4.6 — per-phenotype timing + digestion
state + effort, determination deferred to the vet). It is **specced**, not built here:
- Its `generate-report` code + deploy is **CUL-19** (rides the B-494 chain), per the issue ("its
  `generate-report` deploy … tracked in its own issue") and §4.6 ("Ships with the next B-494-gated
  `generate-report` redeploy, never its own").
- "Effort where logged" is **not a captured field** anywhere in the schema yet, so the bundle cannot
  be built in full until that capture exists — another reason it stays spec-only. No `report.ts`
  change in this PR.

## Review finding → fix (the seam the strip cut)

`adversarial-reviewer` returned **FAIL on one behaviour** (every reassurance/tristate/present-only/
collapse/window probe HELD — no reassurance inversion, so not the blocking class; a correctness +
test-coverage defect): **retained food was dead on the lone empty-stomach card in production.**
`stripInternalOnsets` ran *inside* `detectSignals` and deleted `empty_stomach_timing.longEpisodeOnsets`
before the shell's L3 join could read them — so on the pure empty-stomach cat (L1 fires, no ⑤, no
`timing_story` merge — exactly the phenotype L3 exists for), `retainedFood` never rendered. It failed
*safe* (silence, not "no retained food"), but the spec's first-named L3 field was green in CI and dead
in prod, and no test crossed the `detectSignals → decorate → strip` seam (the pipeline test checked
type only; the retained-food unit tests hand-built findings, bypassing the strip). The reviewer also
caught the **pair-hazard I introduced**: `composeTimingStory` copies L1's onsets to the merged card's
`long` block, and the strip's base-type branches never saw a `timing_story`, so those onsets rode to
the cache uncaught.

**Fix (correct layering):** the onset arrays feed TWO post-detection consumers — the episode-set-aware
suppression (inside `detectSignals`) and L3's retained-food join (in the I/O shell). So the strip is no
longer `detectSignals`'s last step; it is the **shell's final decoration step** (`index.ts`), run once
BOTH consumers have read the onsets. `stripInternalOnsets` is exported + extended to also strip
`timing_story.long.longEpisodeOnsets` (immutably — it clones `long`). Cache hygiene (CUL-7 finding ②)
is preserved: the onsets still never reach phrasing/cache/HTTP. Two regression tests added:
- **the seam** — a lone empty-stomach card through the real `detectSignals` pipeline renders
  `retainedFood {2 of 2}`, and the strip then removes the onsets;
- **the pair-hazard** — `stripInternalOnsets` removes a merged `timing_story`'s `long.longEpisodeOnsets`
  without mutating the input.

## Tests / gates

- `photoComposition.test.ts` — 19 tests: present-only/never-reassure (all-"no" reads → null; hair
  emitted only when seen), tristate (hair + the authoritative bile), the retained-food long-band
  join (⑤/⑥ carry none; `timing_story.long.longEpisodeOnsets` path), present-wins collapse (safe
  direction — an illegible sibling never buries a hair sighting), the 60d window filter, the
  completed-vomit-only source filter, non-timing findings → null, and the `decorateFinding` wiring.
- `detection.test.ts` — the SR-4 diff-scoped test extended → **SR-4 + L3** (detectors emit no
  `photoComposition`); **+2 seam/pair-hazard regression tests** (above).
- Full edge suite CI-mode (`--lock --cached-only`): **1279 passed, 0 failed**; `deno cache --lock`
  clean (no lockfile change — no new dependency). App side untouched (all changes under
  `supabase/functions/generate-signal/`; `tsconfig.json` excludes that path, jest ignores it).
- Gates: `clinical-guardrails` ✓ (self-verified above) · `adversarial-reviewer` ✓ (FAIL → fixed +
  regression-locked; DoD counterexample: a lone empty-stomach cat, 2 long episodes photographed with
  partially-digested food, run through the real `detectSignals`→strip→decorate pipeline → retained food
  was dead because the strip deleted the onsets first; now renders `{2 of 2}` and the onsets still strip
  before cache) · `code-reviewer` **SHIP-READY** (independently traced the strip relocation — no cache
  leak, order-safe, no other `detectSignals` caller relies on it [checked `generate-report`], immutable
  `timing_story` strip; re-ran 444/432/1279 green). Its 3 non-blocking items handled: the doc typo
  (`composePhotoComposition`→`computePhotoComposition`) fixed; the window docstring over-claim resolved
  by switching to **collapse-then-window** (the engine's own order — a boundary bout is decided once by
  its onset, matching the detectors, so there is no window-order discrepancy to caveat); the shared
  `readFlags`/`classifyVomitContents` predicate duplication → **B-759** (Later; the "one predicate"
  doctrine, non-blocking since the two return different shapes).

## Shipped via the CUL-9 draft PR (Signals v2 PR 4)
