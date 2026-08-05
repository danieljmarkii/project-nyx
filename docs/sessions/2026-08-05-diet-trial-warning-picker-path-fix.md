# Diet-trial log-time warning dropped on the picker path — the delayMs/reveal race (B-710)

**Date:** 2026-08-05

**Outcome: shipped via #<PR> — closes B-710** (branch `claude/diet-trial-warning-missing-vo5q1g`). A one-line
timing fix to the wiring that delivers the B-693 / B-351-slice-4 log-time trial heads-up to the meal
completion card. No clinical logic, no copy, no schema changed.

## The bug

The log-time diet-trial warning — both the B-351 "off-diet protein" note and the B-693 "off the trial
list" amber panel — was **silently dropped on `app/log.tsx`, the app's main "Log food → pick a food"
path**. It still fired on the FAB quick-log, which is why the feature looked half-working: it was
correct on the fast path and invisible on the primary one.

The mechanism is a race the two meal-entry paths do NOT share:

1. `app/log.tsx` reveals the completion card behind `showMealMoment(..., { delayMs: 450 })` — a
   deliberate defer so the dismissing `/log` modal doesn't occlude the card at the root layer on iOS.
2. It then fires `applyTrialFlag` fire-and-forget (Principle 1 — the log/card never wait on the flag).
3. `evaluateMealLogTimeFlag` used to make a network round-trip; **B-417 PR 2 (#453) made it an
   all-LOCAL read** ("The network read this used to do is gone" — `lib/trialContaminant.ts`). So it now
   resolves in a few milliseconds — *before* the 450 ms reveal.
4. `store/momentStore.ts`'s `patchTrialFlag` only lands on an **already-visible** card (`if
   (!state.visible) return false` — a correct contract: a not-yet-revealed or dismissed card must never
   be patched). During the 450 ms window the card is not yet revealed, so the patch returned `false`,
   `applyTrialFlag` bailed, and the warning — plus its `noteTrialFlagShown` ledger write — never happened.

The FAB path (`components/log/FAB.tsx`) calls `showMealMoment(...)` with **no `delayMs`**, reveals
synchronously, and its byte-identical `applyTrialFlag` always patched a live card. The only difference
between the working path and the broken one was the 450 ms defer.

**Why no test caught it:** every `patchTrialFlag` test drove `showMeal(...)` with no `delayMs` (the card
was already up), and the leading one's comment even asserts *"the card now shows IMMEDIATELY and the flag
patches in"* — the exact assumption the picker path violates. Nothing exercised the deferred-reveal ×
fast-local-eval interaction. 4561 tests green while the primary path was broken.

## The fix

Preserve the `patchTrialFlag` contract (patch a *visible* card) and the patch-on-arrival architecture
(the log/card never wait on the eval); fix the wiring that was calling the patch too early.

- **`store/momentStore.ts`** — new bounded `whenMealCardVisible(eventId, timeoutMs = 3000)`. Resolves
  `true` the instant the meal card for that `eventId` is on screen (now, or after the deferred reveal),
  `false` if a newer log supersedes it or it never appears within the timeout. Subscribes to the store
  (zustand `subscribe` fires on every `set`, so the deferred `reveal()`'s `set({ visible, payload })`
  wakes it exactly once), self-cleans (`unsub` + `clearTimeout` in an idempotent `finish`), and never
  throws.
- **`app/log.tsx` + `components/log/FAB.tsx`** — `applyTrialFlag` now `await`s `whenMealCardVisible(eventId)`
  before `patchTrialFlag`. The patch lands the instant the card is genuinely visible — immediately on the
  FAB path (no-op wait), ~450 ms later on the picker path. Kept identical across both callers on purpose.

**The ledger invariant is preserved, arguably strengthened.** Rule 3 (a food's one-per-trial heads-up
budget is spent via `noteTrialFlagShown` only when the warning actually renders) still holds: the wait
resolves `false` for a superseded/never-shown card, so the caller skips *both* the patch and the ledger
write — a heads-up nobody saw can't burn the budget. This is the same failure mode the "read/write
split" was written to prevent, now closed on the delayed path too.

## Why this shape, not the alternatives

- **Not "eval before show" (pass the flag into the payload up front).** That couples the card reveal to
  the eval (violates "the card never waits on the flag" — a local SQLite read can still block on a busy
  db) *and* reintroduces the documented "budget spent on a card that never showed" bug: if a second log
  supersedes during the 450 ms defer, the first card never reveals but the budget was already spent.
- **Not "buffer the flag in the store and apply at reveal."** Same budget-timing hazard (the spend would
  precede genuine visibility), and it needs the store to signal back — more surface, worse invariant.
- **Not "drop the `delayMs`."** The defer exists for a real iOS occlusion reason (documented at the call
  site); removing it regresses the card's presentation.

## Tests

Five regression tests in `store/momentStore.test.ts` (`whenMealCardVisible` describe block):
- **reproduces the race** — a `patchTrialFlag` during the `delayMs` window returns `false` (pins the
  drop, so deleting the wait fails a test);
- **resolves true the instant a deferred card reveals** — then the patch lands;
- **resolves true immediately when already visible** (the FAB path);
- **resolves false on supersession** (no hang, no budget spend);
- **resolves false on timeout** (bounded, no leaked promise).

## DoD

- Types clean (`tsc --noEmit`), **4561/4561 jest green** (208 suites), momentStore suite 42/42.
- Anti-patterns: none — no new styles/tokens, no `any`, no magic; helper never throws into the
  fire-and-forget path; Principle 1 intact (the log stays one tap; the card reveal never waits on the eval).
- **Automated tests:** touches a Zustand store (`momentStore`) + two screens — 5 new regression tests
  added; the store change is the extractable logic and is covered.
- Persona sign-off: **Engineer ✓** (preserves the store contract + patch-on-arrival; bounded self-cleaning
  wait) — **Designer ✓** (no visual change; restores the design-locked warning on the primary path;
  Principle 1 held) — **Dr. Chen ✓** (a safety-adjacent heads-up is *restored* where it was missing; the
  clinical predicate/copy/exposure record are untouched, and the ledger invariant that stops alarm
  fatigue is preserved) — Data N/A (no schema/data-model change).
- Adversarial line: this is UI-timing/wiring, not clinical/statistical logic — `evaluateMealLogTimeFlag`,
  `classifyFeeding`, the detection engine, the copy, and the `computeTrialFacts` exposure record are all
  unchanged (the off-diet feeding is still counted in the record regardless of whether the heads-up
  renders). Counterexamples tried and held: wrong-meal patch (eventId-keyed + re-checked in
  `patchTrialFlag`); budget spent on an unshown card (`false` → skip); promise leak/hang (bounded
  timeout); slow eval after auto-dismiss (getState sees not-visible → waits → times out `false`); FAB
  regression (wait resolves immediately, full suite green). `code-reviewer` run on the diff.

## Note for the record

The task arrived as "diet trial warning missing." The obvious reading — the B-693 rung-3 "not on the
trial list" warning — was already built and merged the day before (PRs #590/#592/#593, in this branch's
base). The genuine defect was one layer out: that shipped warning (and the older B-351 contents warning
with it) was being **dropped before render** on the primary logging path by the `delayMs` race above. So
"missing" was accurate from the owner's seat on `app/log.tsx`, just not for the reason the feature's own
tests assumed.
