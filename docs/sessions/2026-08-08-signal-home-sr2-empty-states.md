# Signal / Home uplift SR-2 (B-721) — the E1/E2 empty-state restyle

**Date:** 2026-08-08
**PR:** shipped via #612 (draft)
**Track:** Signal / Home design uplift (B-721), rung 1 · spec `docs/nyx-signal-home-requirements.md` §6/§9/§11 · mock round 2.1 (`docs/culprit-signal-home-mockups.html`)

## What shipped

The two Signal empty states, drawn like the feature they are, gated dark behind
`useAllowlistFlag('signal_design_v2')` (the B-712 allowlist primitive, seeded by SR-0 in
#610). Flag-off renders the shipped surface byte-identical; flag-on renders the round-2.1
designs. **Zero server changes.**

**E1 — building (days 0–~7).** `components/home/SignalZone.tsx` gains `BuildingStateV2`:
- The `We're getting to know {pet}. Day {n} — {k} events so far.` headline. `{n}` is the one
  B-421 local-day counter (`lib/utils` `localDayIndex`/`localDayIndexOf`/`trialDayCounter`),
  day-1-inclusive; `{k}` is pluralised (`1 event`, not `1 events`). Both come from a new
  `buildingDayNumber` + the `dayNumber`/`eventCount` that `useSignal` now derives from the
  same local-SQLite read as the presence-state split — no extra round-trip.
- The three watching-for rows (timing → food → change) as **ghost receipts**: a ghosted
  dot-lane (`GhostLane` — hollow dots, a tinted window band, one pale out-of-window dot as
  the honest exception) and a ghosted stacked-compare (`GhostCompare` — `Last week`/`This
  week` rows whose count column is an em-dash). **No fabricated numbers** anywhere (§6).
- The safety-floor honesty line: `If something needs attention sooner, it won't wait for the
  week.` — the weekly-pattern framing must never read as "nothing urgent surfaces before
  then".

**E1-c colour pass** ships as the default. The one open design decision the spec leaves for
this PR's QA (SD-6 — E1 neutral vs E1-c colour vs "somewhere between") lives in a single
`GHOST` config object at module top: accent/slate washes at ghost opacity + the day counter
in accent ink, with the `GHOST_NEUTRAL` values documented inline so the on-device verdict is
a one-line edit. Rose is deliberately absent (no alarm tone on a state with nothing to
report). The row-2 slate reuses `colorEventMedication` (a slate-blue *world* hue) — at ghost
opacity on a building rail it reads as neutral slate, not a medication cue (mock uses the
same #5B7A9E).

**E2 — mature / nothing established.** `NoPatternStateV2`: the **verbatim B-284 §9
"Signal — empty" copy** (`No established patterns yet. …` headline + the dimmed `That isn't
an all-clear …` sub) plus the top **B-053 coverage diagnostic** (shipped `coverageCopy`
behaviour) restyled into the new quiet rhythm. When there's no diagnostic, the §9 copy stands
alone. Absence is never wellness — the "isn't an all-clear" clause is load-bearing.

## Files

- `lib/signalCopy.ts` — `buildingDayNumber`, `buildingHeadlineLead`/`buildingDayCount`/
  `buildingHeadline` (two-part so the day clause can carry the accent span while the whole
  sentence stays the a11y label), `BUILDING_SUB`/`BUILDING_WATCHING_FOR`/`BUILDING_FLOOR`,
  `NO_PATTERN_HEADLINE`/`NO_PATTERN_SUB`.
- `hooks/useSignal.ts` — `LocalSignalContext` + `SignalState` gain `eventCount` + `dayNumber`,
  computed in the existing focus-effect read.
- `components/home/SignalZone.tsx` — the `GHOST` config, `BuildingStateV2`/`NoPatternStateV2`/
  `WatchingForRow`/`GhostLane`/`GhostCompare`, and the flag gate on the building/no_pattern
  branches only. Shipped `BuildingState`/`NoPatternState`/`stale`/`live` paths untouched.
- Tests: `lib/signalCopy.test.ts` (day-math timezone-honest fixtures, headline pluralisation,
  verbatim §9 pins, guardrail-clean screens) + new `components/home/SignalZone.test.tsx`
  (flag-off byte-identical snapshot + flag-on E1/E2 no-mix assertions).

## Decisions / scope calls made

- **E1-c is the QA starting point, not a hard ship.** Dialing a drawn colour pass *down*
  on-device is easier than imagining colour on a neutral build, so E1-c ships with the neutral
  values one edit away. Recorded for the PM at QA.
- **The footer + section label stay as shipped.** The mock draws E1 with no footer and dims
  the chrome, but "receded chrome" is SR-3's rung-2 work (`§5.2`). SR-2 owns the empty-state
  *body* only, so the §8 footer stays present/undimmed in every state for now. Keeps SR-2
  tightly scoped and parallel-safe.
- **`stale` is out of SR-2's scope.** The mock draws only E1/E2; `stale` renders identically
  in both flag worlds (shipped `staleIntro`). No new copy invented.
- **Headline/label sizes mapped to app tokens** (textMD/textSM) rather than the mock's 13.5/12
  — the app has no 13.5 token and shouldn't grow one; readability holds.

## Verification

- `tsc --noEmit` clean; **full jest suite green — 210 suites / 4638 tests** (4 snapshots).
- Flag-off snapshot pinned and grep-verified: contains the shipped markers, **zero**
  new-surface strings (no leak).
- No changes under `supabase/functions/` (§11 diff-scope AC).
- CI (App typecheck+jest · App non-UTC timezones · Edge Functions deno) triggered on #612.

## Persona sign-off

Designer ✓ (E1/E2 built to the round-2.1 mock; E1-c intensity left as the sanctioned
on-device pick) — Dr. Chen / clinical-guardrails ✓ (verbatim §9 copy; E1 floor + E2 "isn't an
all-clear" keep absence-≠-wellness; test-pinned no-reassurance) — nyx-voice ✓ (no exclamation;
verbatim, specific) — Engineer ✓ (one B-421 day definition reused; registry/branch seam; no
new deps; theme tokens only) — QA ✓ (§11 ACs listed pass; flag on/off both covered) — Data
N/A (no statistics) — adversarial-reviewer N/A (no detection/threshold/AI-read logic; that's
SR-4's mandatory gate).

**`code-reviewer` verdict: ship-ready** — no correctness bugs, no anti-pattern violations,
flag-off verifiably byte-identical, copy/day-math checked under all three CI timezones. Raised
1 CLEANUP + 2 NITs, **all fixed in fast-follow `7bbd185`**: (1) E1 was missing the top hairline
above the first watching-for row (the `first` prop suppressed a divider the mock draws) — now
every row carries it; (2) the `isLoading→building` frame could flash "Day 1 — 0 events" before
the local read landed — the day-count clause is now held back at eventCount 0 (pre-read
sentinel), pinned by a new test; (3) tightened the `dayNumber`/`eventCount` JSDoc.

## Wrap: SR-1 merge

SR-1 (receipts, #613) landed on `main` while this session was building, so the wrap merged
`main` in. It conflicted in exactly two places (as predicted): **STATUS.md** (the parallel-track
block — resolved on meaning, both PRs now shown shipped) and **`SignalZone.tsx`** — SR-1 had
also added `const designV2 = useAllowlistFlag('signal_design_v2')` and threaded it into
`LiveStack`/`InsightCard` for the live receipts, while SR-2 added the same resolve + gated the
empty states. Git auto-merged the render body cleanly (SR-1's `LiveStack designV2={…}` beside
SR-2's building/no_pattern gating); the two conflicts were the shared import block and the
destructure/comment. Resolved to **one `designV2`** feeding both paths, my destructure (keeps
`dayNumber`/`eventCount`), and a combined comment. Full suite green post-merge (211 suites /
4679 tests), tsc clean — the SR-1 ∥ SR-2 "disjoint" claim held except for these mechanical
seams, which is the expected shared-file cost.

## Next

SR-3 (register) ∥ SR-4 (`generate-signal` additive payload — adversarial-reviewer mandatory),
now that SR-1 + SR-2 are both on `main`. SR-3 touches SignalZone's lead canvas + receded chrome
+ the acknowledgment state; SR-4 is the server payload (med-on-board + `densityComparable` +
the falling-comparison gate). Disjoint; the one shared file is STATUS.md at wrap.
