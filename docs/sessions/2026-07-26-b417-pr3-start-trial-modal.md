# Diet trial PR 3 — the start-a-trial modal (B-417)

**Date:** 2026-07-26

Shipped via **#456**. `diet_trials` has a write path for the first time since migration 001.

## What was actually blocked

Seven surfaces read `diet_trials`. Production holds zero rows. PR 1 gave the table a shape and PR 2 gave it a local mirror, but neither made a row exist — so the wedge stayed unreachable and `generate-report`'s scope-cascade rung 2 stayed unfired. The missing piece was not the schema or the sync; it was that **the Pet tab's diet-trial card only rendered when a trial already existed**, which is a closed loop. The card now always renders, with the mock's state-0 empty state, and it is the only entry point (D5).

## The multi-select, and why it wasn't a prop

§4.1's ruling that the trial diet takes N foods is the one thing in this PR that reached outside its own files. `components/log/FoodPicker.tsx` has been single-select for its whole life, and the cheap build was to open it once per food.

The expensive-and-correct version is a `selectedFoodIds` prop that flips the picker from a one-tap-**LOG** surface to one that builds a **SET**. The part that justified the cost is not the toggle — it is the accessibility contract. A `FoodTile` announces itself as a *button* with the hint **"Logs this food"**. In a picker where a tap adds a food to a trial's allowed set and logs nothing, that hint is a lie told specifically to the users who cannot see the screen. So the tile now announces as a **checkbox carrying its checked state** when, and only when, a boolean `selected` is passed; every existing caller passes `undefined` and is byte-for-byte on the old path. The selected state is a border + tint **and a glyph**, because selection signalled by colour alone is the same failure one layer up.

`"Always available"` steps aside in selection mode: a tap there opens a food detail screen, and navigating away mid-selection from inside a modal would strand the set the owner was building.

## Three things paid for rather than deferred

**1. The write is local-first.** `AddMedicationModal` is the location precedent (D5) and writes straight to PostgREST. This does not — and the difference is not stylistic. PR 2's own acceptance criterion is *"a trial created offline survives reconnect + flush"*, which is unreachable unless the create path writes at `synced = 0`; its push queue would otherwise be dead code. The owner this screen exists for is standing in a clinic car park.

**2. "Ordered" had to be true on the wire, not just in the UI.** Migration 040's UNIQUE partial index means a second active trial is a database refusal. The modal pre-flights against the **local mirror** (so the gate works offline) and runs the mock's screen-D flow, whose reasons are **day-dependent** — at day 23 of 56 "it ran its course" is absent, because offering it would write `completed` over an abandoned trial and destroy the `stopped_reason` a vet prescribes differently from.

That handles the UI. It does not handle the flush: an end and a start queue as two rows in **one** upsert batch, and if the insert is evaluated before the status update the new trial comes back `23505` — which PR 2 classifies as **terminal**, so the owner would be left holding the trial they just ended. `syncPendingDietTrials` now pushes in **two passes, ending trials first**. The cost is one extra request in the rare cycle carrying both; the alternative was depending on how Postgres happens to order rows inside a multi-row upsert, which is not a thing to depend on.

**3. The multi-food guard — a hazard this PR creates, and therefore this PR's bill.** `lib/trialContaminant.ts` derives the trial diet from the single legacy `diet_trials.food_item_id`. That was correct when one food was all a trial could have. PR 3 makes two possible, and a wet+dry of the same diet is the **normal** case — so it would compute the sanctioned protein set from one food and flag the other, **vet-prescribed**, legitimately-allowed trial food as a contaminant, repeatedly, on a food the owner cannot stop feeding. That is C2's alarm-fatigue failure aimed at the worst available target.

`loadTrialProteinContext` now returns **null** whenever the `primary_diet` count is not exactly 1: silence, never an all-clear (B-351 D10). The two non-1 cases are handled differently on purpose — `>1` is a settled fact and is cached; `0` means `diet_trials` hydrated while `diet_trial_foods` (a separate pull) has not, which is transient and must not be cached, the same rule the module's existing trial-food-resolution check already applies. The guard costs a real clinical fact (the standing contamination note goes quiet on multi-food trials) and is a stopgap, so **B-453** says to delete it *and its test* when PR 5 re-bases — leaving it would silently suppress the thing PR 5 builds.

## The question the brief asked: does PR 3 surface the `sync_error` conflict?

**No — it stays with PR 4, and PR 3 buys down the prevention half instead.** The reasoning, recorded so PR 4 does not re-derive it:

- **Timing is decisive.** A 23505 arrives on a *later* sync cycle, on reconnect, potentially hours after the modal unmounted. A modal structurally cannot show it. Anything built here would have to live on the card anyway.
- **The card is the trial-state surface**, and its eleven states were design-locked in round 4. A quarantine state is un-mocked; inventing one would fork a design-locked surface, under Jordan's binding constraint that the abnormal card must not go blank, empty or scary.
- **But the hazard is real and new**, because PR 3 is the first thing that can populate the column. So PR 3 makes it rare (local pre-flight, ordered gate, ordered push) and makes the owner's fix *work*: every local mutation writes `synced = 0, sync_error = NULL` in the same statement, which is the mirror's stated contract for this PR, so ending the other trial re-arms a quarantined push instead of leaving a parked row.

Filed as **B-452**.

## Decisions taken, both flagged rather than buried

- **`transition_started_at` is left null in v1.** The mock flagged it open. The design-locked sheet has no capture affordance, a second date question does not belong on a screen whose whole acceptance criterion is fifteen seconds, and the semantic is already carried in plain language by the start-date helper — back-dating to the first exclusive day is what excludes the transition week, and back-dating works.
- **The two duration cells G3 did not rule** (`other` indication; unknown species) resolve toward the **longer** window. The asymmetry is deliberate: too long costs weeks of a restrictive diet and is editable; too short produces a milestone that reads as **permission to stop** a diet the vet wanted continued, which §4.3 names as the live clinical harm.
- **A permitted extra's role is inferred** from the library's own `food_type` and shown back as the row's sub-label, rather than asked. `supplement` stays in the enum and out of v1 capture — it is not inferable, and both permitted roles behave identically in §5.3 rung 1, so a wrong guess costs a word on the vet report and nothing else.

## Still owed

`nyx-voice`, `pm-feature-review` and the Jordan pass were not run — subagents were out of scope for the session. Every LOCKED string is reproduced verbatim and pinned by test, and a greppable assertion checks that nothing this PR ships makes a negative claim about the world (G2 is a rule, not a threshold). The reviews are owed against the built screens before merge.

**P-1 remains provisional pending Dr. Chen** — four numbers in one lookup object, no schema, no migration.

The 15-second timing criterion is a **physical-device** measurement and is the one acceptance criterion this session could not close.
