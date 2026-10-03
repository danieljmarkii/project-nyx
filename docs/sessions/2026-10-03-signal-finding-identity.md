# Signal findings get one identity each (CUL-1213, PR-20)

**Date:** 2026-10-03
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1017. A `/dispatch` child of *Out of beta — Noticed, Design v2, History v2, the trial screen*, row PR-20.

## What shipped

- **The key.** `lib/findingIdentity.ts`, the one derivation the phone and generate-signal share: a correlation keys `food_symptom_correlation:<symptom>:<cluster>`, an intake decline `intake_decline:<trigger>`. Before, chicken→itch and chicken→vomit were one key, and a consecutive-low decline and a refusal were one key, so folding one card folded its twin (every account), the reconcile judged one card's fold against the other's fields, and under design_v2 one card opened the other's screen.
- **The engine test.** `supabase/functions/generate-signal/findingIdentity.engine.test.ts` drives the real `detectSignals` over records that make the twins coexist (non-vacuity pinned), plus every Signal pipeline corpus case with every Engines v3 key off and on, asserting no served row shares an identity.
- **The floor under a shared key.** `sharedFoldIdentities`; `reconcileFolds` releases a key more than one finding claims; `useSignalFold` renders it open, with no Back-because line, and a fold tap writes nothing; `loadSignalScreen` returns `missing` rather than picking. LiveStack rows key on identity, not `type-rank` (BRK-47).
- **The carry (found in review).** `pipeline.ts`'s `safetyKey`, which keys the incomplete-read carry (CUL-989), was hand-rolled `type:symptom|incident` and merged the two intake triggers: an incomplete read that reproduced only the refusal dropped the prior eating-less card as already shown. It now derives from `findingIdentity` (unchanged for the other four carryable lanes).

## Falsification

- Every new test was run red against the reverted fix: the old key (fold, hook, screen, engine), the reconcile release, the screen's refusal, the hook's guard, the carry key.
- The hook guard's first test survived its mutation: the store's knock re-ran the reconcile and released the stray fold, so the end state was the same. It now asserts the tap writes nothing, which the mutation reds.
- `adversarial-reviewer`: 1,500 random records through `detectSignals` under the default and EN-11 configs, every lane, joint clusters, both intake triggers, red flags in both families: zero collisions. The old stored key on upgrade releases and renders open. It found the `safetyKey` carry defect above, fixed here.
- `code-reviewer`: no blocker; asked that the PR state the one-time fold reset, the shown-log history restart and the shared-key door's `missing` landing. All three are in the PR body.

## Residuals

- Every folded correlation strip reopens once after the update (the old key matches nothing). The harmless direction.
- `signal_shown_log.finding_key` for correlations and intake declines restarts under the new keys at deploy; rows before it are unattributable per finding. Nothing reads the log yet (EN-9 / EN-14).
- The fold spec §5.2 / §5.3 edit is proposed in the PR, not written (Tier 2, PM's confirmation).
- `intake_decline`'s material-change `trigger` entry can no longer fire; commented, kept until the spec edit lands.
