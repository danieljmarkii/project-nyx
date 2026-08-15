# Signals v2 PR 5 (CUL-12) — the A2 timing card + expanded states

**Date:** 2026-08-15

Signals v2 (B-755) PR 5 of 10. The D1-ruled combined **timing card** (spec §4.1; mock frames
A2 + A3) — one card for a pet whose vomiting clusters at **both** timing extremes (≤30 min after
eating **and** ≥6h later, empty-stomach). **Client-only**, dark behind its OWN flag `signals_v2`
(not `signal_design_v2` — §0 D6: this track changes *what the engine says*, so a separate
kill-switch + GA call). **No server change, no redeploy** (G10): the server already emits
`timing_story` / `empty_stomach_timing` (CUL-7); this renders-or-safely-ignores them. Blocked-by
CUL-7 (L1 + `timing_story`) and CUL-9 (L3) — both merged. Blocks CUL-15 (PR 10). Shipped via #646.
Gates: Designer + `pm-feature-review` (both run — findings folded in).

## What shipped

**`lib/signal.ts`** — client mirror types `TimingStoryFinding`, `EmptyStomachTimingFinding`,
`PhotoComposition` / `PhotoCompositionField`, added to `InsightType` + `SignalFinding`. Field
names verified against the server payload (`detection.ts`). The mirror carries only what renders
(the ⑤/⑥ convention) — `longEpisodeOnsets` / `associationalOnly` are server-only and omitted.

**`lib/signalCopy.ts`** — the pure A2 geometry + copy:
- `timingStoryBandRows` — the three-band Shape-C compare (≤rapid / in between / ≥long, **every
  count printed** — S2). Time-ordered (§4.1). The band that is a *pattern* wears the symptom hue;
  on the combined story BOTH ends do (⑤ + L1 fired), on a **lone empty-stomach card ONLY the long
  band** does (⑤ never fired — a rose rapid band there would assert a pattern the card didn't find).
- `timingStorySampleLine` — the meta "N timed of M episodes · D days".
- `timingStoryMealLaneModel` — the meal-relative dot lane (`ate · 30m · 2h · 6h+`), rapid + long
  bands highlighted for the story, long-only for a lone empty-stomach card. Ternary independent
  clamp (three payload counts, not dotLaneModel's binary subtraction).
- `timingStoryClockLaneModel` — the early-morning clock lane (null when no clock band — never a
  guessed timezone, §4.2). Normalized `clockOf`/`longCountOf` read `.long` on the story vs
  top-level on empty-stomach, so nothing branches on the type past those accessors.
- `timingStoryControlDisclosure` — the un-timeable remainder (S2).
- `photoCompositionLines` — the L3 lines (retained food / hair / bile), **present-only + cache-
  defended** (`count >= 1 && denominator >= count`, so a corrupt row never renders "0 of N" — G4).
- `timingStoryVetLine` — the for-your-vet relay; LEADS with the fact the face hasn't shown (the
  early-morning clustering), never a re-count (S10).
- `evidenceText` / `sampleLine` / `medContextOf` branches for both types.
- `DotLaneModel.axis` relaxed `[string,string,string]` → `string[]` (the four-tick meal axis;
  backward-compatible — a 3-tuple is a valid `string[]`, shipped ⑤/⑥ lanes unchanged).

**`components/home/InsightCard.tsx`** — `TimingStoryBody` (face) + `TimingStoryExpanded`
(A3's tap-through: the two dot lanes, the control box, the §5.4 med line, the L3 lines, the
for-your-vet relay). A `signalsV2` prop gates it: a `timing_story` / `empty_stomach_timing`
finding renders **nothing** when off (before the rail/a11y are computed) — byte-identical to
before the type had a renderer (the G10 contract). The expand's dot lanes cap at `DOT_LANE_MAX`
(a dense lane blobs → omitted; the face compare + vet line carry the facts). Registry entries.

**`components/home/SignalZone.tsx`** — resolves `signals_v2` (`eligible && optedIn`, both hooks
called unconditionally — Rules of Hooks) and threads it; `LiveStack` filters story types from the
stack when off, so dividers/lead-indexing stay correct once the payload deploys.

## Decisions made

- **`signals_v2` is a second, independent flag** (not `signal_design_v2`). The A2 card renders on
  `signals_v2` alone; the two expand paths (`TimingStoryExpanded` vs SR-1's `ExpandedReceipts`) are
  a strict either/or.
- **Faithful-to-spec deviations from the round-1 mock frame**, each following the ratified §4.1 /
  D10 that post-date it: bands **time-ordered** (not the mock's concern-grouped rapid/long/mid);
  **6h+ not 4h+** (D10); the for-your-vet line is **mechanism-free** (the mock's "empty stomach" is
  barred on owner copy by `MECHANISM_RE` — the syndrome is the vet's inference, the timing is what
  the owner relays).
- **L3 renders on the A2 types only** (per §4.1), though the server computes it for standalone ⑤/⑥
  too — the ⑤/⑥ client mirrors carry no `photoComposition` field (mirror only what renders). This
  is deliberate v1 scoping, not a gap.

## Gates + findings

- **`pm-feature-review`** — face + expand NEEDS-WORK; safety register SHIP-SHAPED. Four findings
  folded into the build: (1) the lone empty-stomach face toned its rapid band as a pattern it never
  fired on — now muted, matching the expand + lead; (2) the middle band label was a bare "In
  between" — now anchored "30 min–6h after eating"; (3) the for-your-vet relay reprinted the count —
  now leads with the clustering; (4) "The other side of it" over-promised a base-rate
  counterbalance — retitled "What we couldn't time" (the un-timeable remainder it actually holds).
- **`code-reviewer`** — fix-before-merge. Two fixes folded in: (1) **G4** — `photoCompositionLines`
  guarded on object-presence, now on `count >= 1 && denominator >= count` (it reads a cache; a
  malformed count-0 row would have rendered "Hair: 0 of N" — reassurance-on-absence); (2) the A2
  expand's dot lanes had no legibility cap — now capped at `DOT_LANE_MAX` (a chronic patient's 20+
  dots blob in a 22px lane). Plus the SignalZone coverage gap (new filter + known-edge tests) and
  two nits. Flag separation, Rules of Hooks, flag-off byte-identical, theme-tokens — all confirmed
  clean.
- **Adversarial / clinical-guardrails (G4)** — falsification applied to the client L3 guard:
  `{hair:{count:0,denominator:9}}` → dropped (count<1); `{bile:{count:3,denominator:2}}` → dropped
  (denom<count); all-absent → `[]`. No path to "0 of N" / reassurance-on-absence; present-only by
  construction. The end-to-end present-only computation (server) was adversarially reviewed in
  CUL-9; the full end-to-end pass is **owed at PR 10's redeploy** (per the code-reviewer), when L3
  first reaches a real account.

## Tests

- `lib/signalCopy.test.ts` — the A2 copy/geometry: `isTimingStory`, band rows (tone-by-type,
  anchored labels, S2 zero-band), sample line, both lane models, control disclosure, the L3
  present-only + **cache-defended (count-0 / count>denominator) G4** paths, the vet line
  (clock-lead / no-clock relay), evidenceText, the guardrail sweep (mechanism/food/cause/
  reassurance/glyph/percent/"!").
- `components/home/InsightCard.test.tsx` — flag gating both directions, the three-band face,
  a11y-label folding, the expand content, **the DOT_LANE_MAX cap** (meal omitted at 40, both
  omitted + box dropped at very-dense, clustering survives in the vet line), the lone-empty-stomach
  card, the no-clock case; the G10 unknown-type contract migrated off `timing_story` (now
  `gap_shortening`).
- `components/home/SignalZone.test.tsx` — the `signals_v2` LiveStack filter (drops story flag-off,
  keeps others, renders flag-on) + the documented only-story-cache live-but-empty edge.
- `tsc --noEmit` clean; **4955 tests / 220 suites green**; 11 snapshots (flag-off byte-identical).

## DoD

- [x] AC (spec §9): flag-off byte-identical (snapshot); denominators printed wherever a count
  renders; no banned vocabulary (regex sweep); new constants anchored (meal-lane zones schematic;
  `longGapHours` reads the payload); property/render sweeps in CI.
- [x] Types pass, lint clean, no `any`.
- [x] Tests: store/lib/component logic covered; 4955 green.
- [x] Persona sign-off: **Designer** ✓ (S1/S2/S10 — plain safety register untouched; every count
  printed; receipts earn their place) — **Engineer** ✓ (client-only, no server/deploy; flag
  separation; Rules of Hooks) — **Data/Dr. Chen** ✓ (G4 present-only defended; timing-only copy;
  no reassurance) — **`pm-feature-review`** folded in — **`code-reviewer`** folded in.
- [x] No new secret.
- [ ] On-device pass — **owed at PR 10** (dark behind the flag; needs a dogfood build with the uid
  allowlisted in `app_config.signals_v2`). Specific screenshot checks: band-label truncation at
  ~375pt; whether the rose/grey coloring reads as "pattern vs not" (not "danger vs safe").

## Open questions / PM decisions surfaced (from the review)

- **Band order** — spec time-ordered (as-built) vs the round-1 mock's concern-grouped. Designer +
  screenshot call. As-built is defensible (reads as a timeline; the muted middle shows the bimodal
  dip). An as-built visual renders both side by side for the ruling.
- **Rose/grey coloring** — does the symptom-hue-ends / muted-middle read as "the pattern" or as a
  severity gradient? Designer + screenshot.
- **Restore the mock's "two kinds of time" lead framing** — the card's central insight (it clusters
  at *both* extremes) is carried by the coloring, not the words; the server lead just lists two
  counts. Restoring it is a **server-template** copy change → PR 10 (CUL-15), PM-vetoable.

## Backlog filed

- **B-76x** — the base-rate counterbalance control ("mornings with a meal and no episode: N of M",
  spec §4.1 / mock A3). Needs a new engine payload field CUL-7 doesn't emit; the A2 control box
  renders only the un-timeable remainder until then. **Next** (a real two-sided-control upgrade).
- **B-76x** — a jittered/taller dense-timing lane (the Patterns-surface treatment) so a chronic
  patient sees the distribution instead of an omitted lane. **Later** (gated on per-episode times
  in the payload — Option-A geometry, B-753/B-754). Pairs with PR 9's Patterns Timing panel.
