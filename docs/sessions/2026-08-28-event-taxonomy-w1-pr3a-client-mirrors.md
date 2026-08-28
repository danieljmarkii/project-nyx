# Event taxonomy — W1-PR-3a: the client symptom mirrors (CUL-676, first half)

**Date:** 2026-08-28 (session opened 2026-08-27 late)
**Shipped via #730.**

## What this was

The client half of W1-PR-3 (CUL-676), built FIRST and on its own per the HR-2
release-order asymmetry: the mirrors ship at App Store cadence, so they must be in
a live build before the engine (3b) ever emits a cough finding — without them a
cough chronicity card renders literal "recurring undefined" on the cross-pet
safety banner. Scope was set by three things read together: the §13a membership
walk's still-absent PR-3a rows (PR-2's handoff worklist), CUL-676's 3a paragraph,
and the 2026-08-27 product-team review's "PR-3a scope grows" additions.

**On the gates:** the 2026-08-27 review ruled W1's capture half (PR-0/1/2/3a)
independent of the three blocking engine findings and free to proceed on the host
gate; CUL-675 (PR-2, #729) was `Done` before this session launched; the PM
launching the session on CUL-676 is the chain's per-PR kickoff (the PR-0/1/2
convention). **3b was deliberately NOT built** — the review's newest comment
blocks it on four PM rulings (L4 membership · the diagnostics floor · the
logged-day denominator set · ⑦'s one-card displacement), and those briefs were
put to the PM at this session's close. All three findings were spot-verified at
file:line before scoping (⑤/⑥ vomit-only constants; `detectGapShortening` /
`countSymptomEpisodes` iterate the shared list; `detectChronicity` returns
`[chronic[0]]`).

## What shipped

- **The six walk-table flips** (each a visible diff in
  `constants/eventTypes.membership.test.ts`, per the pin-update discipline):
  `SignalSymptomType` + `SYMPTOM_LABEL` (lib/signal.ts / lib/signalCopy.ts) ·
  `SYMPTOM_NOUN` + `SYMPTOM_CHIP_ORDER` (lib/daySummary.ts — respiratory pair
  slots after the GI pair, family order; real plurals so "2 coughs" never reads
  "2 cough") · `WIDGET_SYMPTOM_LABELS` (lib/widgetSnapshot.ts) ·
  `SYMPTOM_EVENT_TYPES` (lib/analytics.ts — Patterns grid, frequency calendar,
  trial outcome deltas, widget tile) · `TREND_SYMPTOM_TYPES` (lib/trendSummary.ts)
  · `TYPE_FILTER_KEYS` (components/history/TypeScopeControl.tsx — un-gated on
  purpose, §12: reads are never flag-gated).
- **The review's 3a scope growth:** `SYMPTOM_METRICS` + `HISTORY_SYMPTOM_TYPES`
  (lib/ask.ts — Ask's G5 audit tap-through now routes a cough count to the
  filtered History list) and `SYMPTOM_OCCURRENCE_LABELS` (lib/metricDetail.ts —
  "Coughing on 5 days", found by this session's own discovery sweep).
- **The "recurring undefined" class closed structurally, not by release order
  alone:** all 12 `SYMPTOM_LABEL[...]` reads in lib/signalCopy.ts now route
  through `symptomWord()`, whose out-of-union fallback is the humanized token
  (the `incidentFlagPhrase` cache-defense precedent). Pinned by
  `lib/signalCopy.symptomWord.test.ts`: a W2-era `labored_breathing` payload
  renders plainly on the banner / evidence text / phone script, passes
  `validateBannerPhrasing`, and never prints "undefined" or a raw enum token.
- **The discovery guard the review mandated** (`guards/symptomLists.test.ts`,
  the completionCard-guard shape): comment-stripped source scan over
  app/components/constants/lib/store/hooks/widgets/supabase-functions; a cluster
  of ≥3 distinct symptom-key literals is a list site and must be registered (or
  carry `// symptom-list-ok: <reason>`). Its first run discovered **two lists no
  review had named** — `generate-report/render.ts`'s `symptomLabel` switch
  (safe humanizing default; proper cough/sneeze labels flagged as 3b report
  co-work) and `analyze-stool`'s concurrent-context set (its own future per-leaf
  call, not W1) — on top of the review's three (ask ×2, dietTrialFacts).
- **The walk table extended 11 → 15 rows**, including two rows deliberately
  registered as OPEN rather than decided: `TRIAL_RESPONSE_LOGGED_DAY_TYPES`
  (lib/dietTrialFacts.ts — the PM logged-day brief; flips at 3b in the same PR
  as the engine's denominator edit, or never, per the (a)/(b) ruling) and the
  `signalWatching` gap row (the W1-greenlight rider). The walk's `scan()` now
  matches Record-key form (`cough:`) as well as quoted members — the first run
  caught three label-map rows reading as absent for exactly that reason.

## Deliberately not touched

`lib/patternsTiming.ts` and `lib/dietTrialFacts.ts` memberships (pooled
logged-day denominators — the open finding-2 brief), `lib/signalWatching.ts`
(open rider), and every server file (3b: the per-lane membership build, the
per-type floor slot, `REPORT_SYMPTOM_TYPES`, phrasing labels, the stale
`detection.ts:5826` comment, the redeploy).

## Verification

- `tsc --noEmit` clean; **full jest suite green: 274 suites / 5,981 tests
  before the daySummary additions, all green after** (5 snapshots unchanged —
  the FL-1 byte-identical claim keeps holding).
- **CUL-613 red-checks, both new guards:** the discovery guard was run with
  `lib/dietTrialFacts.ts` deliberately un-registered and went red on exactly the
  review's scenario before being trusted green (plus durable in-suite synthetic
  red-checks for both literal forms); the walk's extended `scan()` was proven
  against the three rows it had been mis-reading.
- The daySummary interim-fallback pin flipped to the real-noun claim with the
  plural case the fallback got wrong ("2 coughs") plus a chip-order case.
- `code-reviewer` subagent run against the staged diff (verdict recorded in the
  PR thread / below before push).

## Decisions taken in-session (build-level, none reversing a ruling)

- **Chip order:** cough/sneeze slot after the GI pair, before lethargy/itch —
  the ratified family order (Digestion → Breathing) applied to the one ordered
  chip surface; pre-W1 types keep their relative order.
- **History filter placement:** after `stool_normal`, mirroring the picker's
  family order; deliberately un-flag-gated (§12).
- **`symptomWord` stays module-private** — consumers speak through the copy
  functions, so the fallback cannot be bypassed by a new call site reaching for
  the raw map (the map itself is no longer indexed anywhere else).

## For the next sessions

- **3b is blocked on the four PM briefs** (presented at close; CUL-676 carries
  them). Honest sizing per the review: 3b is two sessions — the behaviour-neutral
  per-lane map + per-type floor slot first, then cough joins ⑦.
- 3b's report co-work now includes `render.ts`'s label switch (guard-discovered).
- The next A-Native build cut should carry this PR before `generate-signal`
  ever deploys with cough in its fetch (the 3a-before-3b gate).
