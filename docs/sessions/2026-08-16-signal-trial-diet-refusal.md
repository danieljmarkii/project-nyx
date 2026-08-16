# B-789 (CUL-525) — the Signal trial card must not reassure over a day-1 diet-refusal cat

**Date:** 2026-08-16 · **branch** `claude/signal-trial-diet-refusal-5188s0` · **shipped via #<TBD>**

Closes the CARD half of the adversarial gate-2 finding from `2026-08-15-signals-v2-redeploy-gates.md` — the last B-789 redeploy precondition on the single gated `generate-signal` deploy for Signals v2. The STRIP half shipped there (#662, `resolveTrialStrip` withholds the standing vomit line on the not-eating reasons); this is the CARD half, and it is **client-only — the held `8ea97632…` bundle stands unchanged.**

## The problem (verbatim from the gate-2 finding)

The event-driven Signal **trial_response** card fires from the server `trial_response` finding (`detectTrialResponse`, `generate-signal/detection.ts`), which reads only the trial row (start/target) and is **blind to any refusal fact**. So a diet-trial cat **refusing the prescribed diet from day 1** has uniform-low intake → the relative-decline detector (`detectIntakeDecline`) never fires (both its triggers need a drop from a *higher* baseline — confirmed by reading both), `intakeDeclineHeadline` is null, no safety card leads — yet the reassuring "0 vomiting · was 20, a longer stretch" renders over a starving cat (the canonical B-494 anorexic-cat case, one layer out; B-775's clause amplifies the false magnitude). §5.2 forbids a reassuring summary next to a refusal **even below the safety card**, so the requirement is SUPPRESSION, not reorder.

## The mechanism — PM ruled CLIENT (a real fork, briefed first)

Decision brief presented before building; PM chose the client mechanism. The reasons that decided it:

- **Consistency-by-construction with the shipped strip fix.** The strip withholds its vomit line on `animalNotEating = intakeDeclineHeadline || trialDietRefusal || rangeRefusal`, computed from the client's `trialInput`. The card now suppresses on the **identical predicate from the identical input**, so the card and strip can never disagree about the same refusal — the exact split (strip withholds, card reassures) B-789 exists to close.
- **The card is *already* client-gated.** `LiveStack` already drops `trial_response` when `signals_v2` is off (the server emits it uniformly; the client is its visibility gate). This adds one more condition to the gate that already governs the card — the server mechanism would be the inconsistent one (moving one gate server-side while the flag-gate stays client).
- **No bundle change.** The server mechanism would need a new `diet_trial_foods` query + `computeTrialFacts` server-side (or a forbidden third off-diet predicate), riding the held redeploy (the current bundle has no fix → rebuild + re-verify + fresh adversarial). The client fix de-couples B-789 from the bundle: `8ea97632…` stands, and this lands as its own PR before the deploy.

## What shipped (code — client only)

- **`isAnimalNotEating(input)`** (`lib/dietTrialCard.ts`) — extracted the strip's inline `animalNotEating` into one exported predicate, defined as the NOT-EATING subset (`intake_decline | trial_diet_refusal | range_refusal`) of the shared `withholdingReasons` list both surfaces already read. Scoped to EXCLUDE comparator/thin reasons (`free_fed`, `allowed_set_unavailable`, `antigen_arm_dark`, `untracked_head`, `below_floor`) — those don't make a vomit count dishonest, so they must not drop a valid vomiting finding (Sam's grazing cat). `resolveTrialStrip` now calls it (byte-identical — snapshot-pinned).
- **`hooks/useDietTrial.ts`** — exposes `inputIsForActivePet` (fail-closed round-1 fix). `input` is retained across a pet switch and a failed reload (so the strip never flashes empty), so a non-null `input` is not proof it belongs to the active pet; `loadedPetId` (set only when a load resolves) makes the freshness explicit.
- **`app/(tabs)/index.tsx`** — Home computes `suppressTrialResponse` from the `trialInput` it already loads (no second read), **failing closed** on stale/unloaded facts: `trialFactsFresh && trialInput ? isAnimalNotEating(trialInput) : !trialFactsFresh`. Passed to `SignalZone` beside `trialRunning`.
- **`components/home/SignalZone.tsx`** — `LiveStack` drops a `trial_response` finding when `suppressTrialResponse` **and the direction is `fewer_during_trial`** (the reassuring direction only — round-1 fix). Genuine suppression, not reorder: the card does not render at all. The `more_during_trial` escalation card survives (a concern to keep). The finding stays in the cache; nothing consumes it but this stack.
- **Tests:** `lib/dietTrialCard.test.ts` (+6 — `isAnimalNotEating` fires on each not-eating reason incl. the day-1 refusal with `intakeDeclineHeadline` null, NOT on comparator/thin reasons, and agrees with the `withholdingReasons` not-eating subset); `components/home/SignalZone.test.tsx` (+5 — the `fewer` card drops under `suppressTrialResponse` even with `signals_v2` ON, renders when false/default, the co-finding is untouched, and the `more` escalation card survives); `hooks/useDietTrial.test.ts` (+2 — `inputIsForActivePet` false during the cold load and the switch window, true when fresh).

`suppressTrialResponse` defaults false at the `SignalZone` prop: every non-Home caller (there are none but Home) and the flag-off path are unaffected.

## Precondition (a) — verified (with a correction)

The gate-2 finding required confirming B-494's refusal safety card fires/leads for a day-1 refusal, so the record still knows the cat is in trouble:

- **The vet report (B-494, `generate-report`)** fires the `trial_diet_refusal` safety flag for the refusal shapes — including the **owner-declared, no-ratings-at-all** give-up case — and it *leads* (sorts with the intake family, above chronicity). Ran the report's B-494 tests: **3/3 green** (`generate-report/trial.test.ts --filter B-494`).
- **Correction (adversarial finding 7):** my first draft claimed the Home *strip* resolves a day-1 refusal to a `trial_refusal` safety state. It does **not** — `resolveTrialStrip` never calls `liveRefusal`/the card state machine (those drive the **Pet-tab card**), and on Home the strip stays quiet on the refusal by design ("Silence on Home, the register one tap away"). So with the reassuring card suppressed, **Home does not itself escalate** on the refuser; the refusal is surfaced on the **Pet-tab card + the vet report**. That is defensible for B-789's scope (its job is to remove the *reassurance*; a Home *escalation* for the day-1 refuser is B-494's open scope, not this ticket) — the safe direction is silence over reassurance — but the record was corrected so no one over-claims Home coverage.

## Reviews

- **`adversarial-reviewer` (DoD-mandatory) — round 1 FAIL → fixed; round 2 <TBD>.**
  - **Round 1 FAIL, 3 findings, all addressed:** (1+2, HIGH) the fail-open default let the reassuring card render over a not-eating cat during the cold-load/switch race — fixed by the `inputIsForActivePet` fail-closed gate; (3, MEDIUM) the direction-blind drop also hid the `more_during_trial` escalation — fixed by gating on `fewer_during_trial`; (4, MEDIUM) the empty-'live'-stack sole-finding edge — the documented CUL-12 edge, safe-direction, mitigated by the direction fix, filed as **CUL-527**. It also corrected precondition (a) (finding 7, above).
  - **Round 2 (re-review of the fixes):** <TBD>.
- **Skills consulted:** `clinical-guardrails` (§5.2 reassuring-summary composition; intake-is-not-preference — a refusal routes toward a health flag, never softened; the suppression fails toward *withholding* reassurance, and the round-1 fix hardened that under load), `nyx-voice` (no new owner-facing strings — pure suppression).

## DoD

- [x] **Types** — `tsc --noEmit` clean.
- [x] **Tests** — full jest 237 suites / 5276 green; the strip snapshot unchanged (byte-identical refactor). No Edge Function / deno change (client-only).
- [x] **Anti-patterns** — theme-token-only (no style change); one shared predicate (no third refusal definition); suppression not reorder (§5.2); fail-closed under uncertainty (never-reassure).
- [ ] **Adversarial review** — round 1 run (FAIL → fixed); round 2 pending on the fixes.
- **Persona sign-off:** Data/Adversarial — round 1 FAIL fixed, round 2 pending · Dr. Chen ✓ (the never-reassure asymmetry: the card is withheld, never a reassuring claim minted, and now under load too; escalations are kept) · Designer ✓ (no visual change; the card simply doesn't render) · Engineer ✓ (one predicate, no second read, no bundle; fail-closed freshness) · QA ✓ (suites green).

## Documentation updates

- **STATUS.md** — the B-789 blocker line (§ Open PM action items) updated: the CARD half is now fixed client-side (this PR); precondition (a) verified; B-789 no longer gates on a bundle rebuild. The remaining generate-signal deploy gate is the PM/Dr. Chen sign-off on the four settled gates + running the deploy.
- **Linear CUL-525 (B-789)** — updated to the ruled CLIENT mechanism (the title/desc named a server refusal-gate/ranking option; the PM chose client suppression) and moved toward Done on merge.
- **Spec (`docs/nyx-signals-v2-requirements.md`)** — no edit needed: §5.2 already forbids the reassuring-summary composition this enforces; the mechanism is an implementation of the existing rule.
