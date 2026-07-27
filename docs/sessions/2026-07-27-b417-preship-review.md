# 2026-07-27 — B-417 pre-ship review: five chairs, eight rulings, mock round 5

**Type:** review + rulings session (docs-only PR) · **Branch:** `claude/diet-trial-feature-review-blpvjh` · **Outcome:** shipped via #491

## What happened

The PM asked for a full pre-ship pressure test of the merged diet-trial lifecycle (PRs 1–7, #450–#481) — "imagine we're demoing to the product team, personas, pet owners, vets." Five isolated review chairs ran in parallel:

- **`pm-feature-review`** (Jordan/Sam end-to-end walk) — flows 1/2/3/5 NEEDS-WORK, flow 4 INSUFFICIENT. Headline: B-474 is worse than filed — `dietTrialFacts.ts:218` hard-nulls `exposures`, so card states 3/4 and the record-and-continue copy are structurally unreachable; `trialDietRefusal` has zero client consumers (the refusing cat gets a clean card); the start-modal food-capture round trip strands the owner; a completed trial vanishes from card AND report at day 15.
- **`adversarial-reviewer`** — FAIL, six counterexamples **executed** against `main` (all green-on-CI): the refusal lane dies silent on any food-identity miss and re-renders prescribed-diet refusals as owner-blamed exposures; the C2 antigen breach on an undesignated primary (×56); the G2 negative claim reachable via `allowedSetUnavailable`; the outcome sheet's fabricated "0 of N before"; a fifth unpinned day-math path in `ask`; the free-fed forbidden claim locked in by a green test (`dietTrialCard.test.ts:843`).
- **`code-reviewer`** — two fix-before-ship seam bugs (just-ended-trial report race; Home strip staleness); StartTrialModal (the sole write path, 843 lines) has no tests; clinical logic itself clean.
- **`rls-privacy-reviewer`** — **PASS**, attacks executed as real JWT roles against a Postgres replica of migrations 001–043; two hardening items filed (B-541).
- **`vet-report-cold-read`** — two artifacts rendered through the real `assembleReport → renderReport` pipeline (fixtures in the session scratchpad; artifacts delivered to the PM). Biscuit NOT READY (narrow); **Miso NOT READY (blocking) — the false trial-diet self-contamination (mixed hydrolyzed/intact keys) inverted the clinical conclusion.**

Main-session verification: 2,593 jest + 987 Deno green, clean `tsc`; the one-predicate rule confirmed literal (Deno imports `lib/dietTrial.ts` itself).

**Synthesis:** the clinical core held every attack; the breaks concentrate in (1) food-identity resolution feeding the predicate and (2) computation-to-surface wiring. Full record: **`docs/diet-trial-preship-review-2026-07.md`**.

## Rulings

The PM ruled all eight surfaced decisions in one sitting — **R1–R8**, recorded verbatim in the review doc §1. The two that change the ship plan: **R1** — the refusing-pet card gates the TestFlight cut (the build now holds on B-533/B-474 + B-534–B-538, not only the redeploy), with the PM's own addition of the intake-rating teach line; **R7** — the hydrolyzed↔intact derived-from relation is team-delegated, must be robust, own PR (B-529). R4 pauses the qualitative outcome approach (data leads; question optional everywhere; §6.1 untouched — the app never computes a verdict; B-508 closed). R5 sets grace windows 90/30. R2 scopes G2 to trial reports + renames the no-trial section. R3 promotes the start date to the default path. R6 punts the widget (revamp filed, B-542). R8 hands the vet sitting to the team.

## Shipped in this PR

- `docs/diet-trial-preship-review-2026-07.md` — the review record + R1–R8 ledger + gate buckets (new).
- `docs/nyx-diet-trial-mockups.html` — **mock round 5**: the refusal/viability state (never drawn before), the intake-rating teach line, the free-fed all-claim deleted + forward line restored, the start date promoted to screen A (screen B drops its copy; the open start-date anno resolved), outcome-optional copy + captions (R4), state 7a's verdict line conditional, the round-5 changelog.
- `docs/backlog.md` — **B-529–B-544** filed (report gates, card wiring, freshness pair, ask parity, RLS hardening, widget revamp, test coverage); B-474 head updated (round 5 drawn; wiring pairs B-533); **B-508 closed by R4**.
- `STATUS.md` + `CLAUDE.md` — the B-417 state, both holds, and the Read-These row brought current.

## Gates as of this session

- **`generate-report` redeploy:** B-494 + B-529–B-532, then a fresh `vet-report-cold-read` on re-rendered artifacts.
- **TestFlight build cut (R1):** B-533/B-474 wiring + B-534, B-535, B-536, B-537, B-538.
- **Vet sitting (R8):** durations (cat cells), GI extension + B-510, B-456 (rec: allow back-dating, cap at trial start, disclose on the report), refusal-lane semantics, cold-read clinical asks.

## Open / unresolved

**B-509** (Save ends a medical intervention with no confirm/undo — not covered by R4, which ruled the question, not the irreversibility) — fold into B-533's design pass or rule separately. Live-DB verification for a next cloud session: pg_policies + trigger `tgenabled` on `diet_trial_foods`; 041's pre-existing-row count; the PostgREST embed-filter check on a soft-deleted allowed-set row.

## Next session kickoff (recommended order; report train ∥ client train are disjoint)

1. **B-529** (protein relation, own robust PR — report train opener)
2. **B-530 → B-531 → B-532** (report train; then fresh cold read; then redeploy)
3. **B-534 + B-535 + B-536 + B-538** (client mechanical PRs — parallel to the report train)
4. **B-533 wiring** (after PM eyeballs mock round 5)
