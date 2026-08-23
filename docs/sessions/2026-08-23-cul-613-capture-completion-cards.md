# CUL-613 — capture paths through the real completion cards

**Date:** 2026-08-23

PR 4 of 5 in the completion-system chain (CUL-603). No schema, no deploy, no flag.
Spec: `docs/nyx-app-polish-requirements.md` §5. Closes CUL-368.

## What was wrong

Both capture screens wrote a **real record** and then played their own hand-rolled
`✓` over the bare word "Logged", held it 900ms, and dismissed. The completion card
never fired — and with it, the follow-up question that only that card asks:

- **`food-capture?fromLog=1`** writes a meal (`insertMeal`), and the owner never saw
  the WSAVA **intake chip row** or **Change time**. That is CUL-368, filed in
  February and open since.
- **`medication-capture?fromLog=1`** writes a dose at `adherence: 'given'`, and the
  owner never saw the **adherence chips**. So on that path the affirmative was the
  only thing the record could ever say: no downgrade affordance, no vehicle row, no
  Change time — all three of which every other dose path has offered since B-117 PR 3.

Both files already carried, in a comment, the rule they were breaking:

> "every meal-entry path must route through `showMeal` — if a non-picker meal flow is
> ever added (e.g. a manual quick-add), it must fire `showMeal` too, or the intake
> capture surface vanishes for that path." — `app/log.tsx`, `components/log/FAB.tsx`

The comment was true, prominent, in two places, and did not work.

## What shipped

Both log paths now hand off to the real card at commit — `exitCapture()` /
`router.dismissAll()` first, then `showMeal` / `showMedication` behind `delayMs: 450`,
which is the picker path's shape (`app/log.tsx`): the card is store-driven from the
root layout, so it outlives the screen and lands at the root layer instead of being
occluded by the still-presented modal on iOS.

Presentation is contained in its own `try/catch` at both sites. That is not
defensiveness for its own sake — it is the B-336 rule applied here. The submit guard
releases on a throw, and a released guard means a second tap writes a **second meal
for the same bowl** or a second dose for the same pill. A broken card is cosmetic;
a duplicate dose reaches the vet report as a real double-dose.

### The comment became a build failure

`guards/completionCard.test.ts` — a source scan in the shape of
`guards/haptics.test.ts`. Every file calling `insertMeal(` / `insertMedicationDose(`
must also reach for `showMeal` / `showMedication`, with a mandatory
`// completion-card-ok: <reason>` hatch. `components/home/MedStrip.tsx` takes the
hatch and says why: it is deliberately the **R2 in-place beat** (§5), and its
sentence/mark/haptic upgrade is CUL-614's.

The scan is deliberately scoped to these two helpers. They are the write paths whose
card carries a **follow-up question the record cannot answer on its own** — intake
for a meal, adherence + vehicle for a dose — so skipping the card does not cost
warmth, it costs a column that is only capturable at peak recall. Symptom and weight
commits go through `showNamed`, whose card asks nothing; a path that skipped it would
lose a beat, not data.

### The guard shipped with a hole on the exact bug it was written for

Worth recording, because reading the file would not have caught it. The first version
tested `src.includes('showMeal')`. Run against the **pre-fix tree** it flagged
`medication-capture` and **passed `food-capture`** — because that file declares
`const [showMealTimePicker, setShowMealTimePicker] = useState(false)` for its
meal-time override. A date picker satisfied the guard while the completion card was
nowhere in the file. The guard would have shipped green over CUL-368.

Fixed with word boundaries (`\bshowMeal\b`), which rejects `showMealTimePicker` and
`showMealMoment` alike while matching every shape the wiring actually takes
(`s.showMeal`, `{ showMeal }`, `showMeal(`). Rejecting the local alias is fine: every
call site assigns it *from* the bounded form.

The same run also forced comment-stripping, in both directions. `app/(tabs)/foods.tsx`
was flagged as an unwired meal writer on the strength of the prose *"skips insertMeal
(the capture screen already branches on that)"*. And the costlier direction: `log.tsx`
and `FAB.tsx` both contain the word `showMeal` **inside the warning comment this guard
replaced**, so matching raw source would have let a future path satisfy the rule by
pasting the comment along with the code — which is precisely how the rule failed the
first time. Both directions now have detector tests.

The lesson generalizes: **run a new guard against the tree it was written for, before
trusting it.** A guard that has only ever been green has not been tested.

## Two defects found while wiring this

Neither was in scope; both are one-line consequences of the routing change, so they
ride here rather than becoming their own issues.

1. **The trial heads-up ledger was spent on a heads-up nobody saw.** `food-capture`
   wrote `noteTrialFlagShown` unconditionally at commit. Rule 3 grants one heads-up
   per food per trial, so a card that never rendered still burned that budget — and
   the *picker* path would then stay silent about that food forever. "Counted in
   heads-ups given" has to mean given. It is now spent only once
   `whenMealCardVisible` confirms the card is on screen, matching what `log.tsx`
   already does.

2. **"Logged" over a record that was never written.** Both screens gate the write on
   an active pet (`if (cameFromMealLog && pet)`). With no active pet they wrote
   nothing and still showed "Logged". The meal/dose branches now `return` on the
   card, so that case falls through to the honest add-only copy.

## The add-only paths keep their beat

PM-ruled this session (Option A). A library save writes **no event**: there is no
`LoggedRecord` to speak, no `deleted_at` for Undo, no `occurred_at` for Change time.
Generalizing R1 onto it would be three dead affordances around one noun. The residual
copy strings (`"Saved to your foods"` / `"Added"`) are already inside CUL-614's pass
over every beat string.

So §5's "both hand-rolled ✓ glyphs retire" is satisfied *as a completion register for
a logged record* — which is what §5 is converging — and one library-save beat remains,
now unambiguous because it is the only thing those code paths render.

## Deliberately not done

**No double-dose check on the capture dose path**, in contrast to `app/log.tsx` which
fires `getDoubleDoseFlag` on its dose path. That detector keys on
`medication_item_id`, and `medication-capture` mints a fresh `uuid()` for the catalog
row it is creating — a drug that did not exist a moment ago has no prior doses to
repeat, so the check could only ever return nothing. Written down in the file rather
than left looking forgotten; it becomes live the day capture can resolve onto an
existing library item.

## Falsification attempts

- **clinical-guardrails Pattern 2 / B-156 G1 — does the card create a new path to an
  affirmative?** No. The write is byte-identical (`adherence: 'given'`, the owner's
  own "Save and log dose" tap); the card only *adds* the downgrade. An ignored card
  auto-dismisses to exactly the state the pre-fix beat left behind. And the fail-safe
  it might have collided with is unreachable here: `isComboDoseInDoubt` requires
  `isCombo`, which is `!!pairedFoodName` — absent on this path — so nothing pre-lights
  or sharpens. **Held, and strictly safer than before.**
- **Could the ledger change suppress a heads-up?** No, and the asymmetry is the point:
  if the card does not reveal, nothing was shown and nothing is spent, so the picker
  path shows it next time. The failure direction is one *extra* heads-up, never a
  missing one — the same direction `readHeadsUpLedger` already fails in.
- **Wrong-pet on the card?** `petId` is `usePetStore.getState().activePet` read at
  *write* time, the same read the record itself uses, so a queue-then-switch cannot
  print another animal's name on a card about this one.
- **Does the dose card actually render the three affordances on this payload?**
  Verified in `MedicationCompletionCard`: `isCombo = !!payload.pairedFoodName` is
  false → **Change time renders** (it is standalone-scoped), `AdherenceChipRow`
  renders unconditionally, `inDoubt` is correctly false.

## Persona sign-off

Designer ✓ (Principles 1, 2, 5 — the follow-up question returns to both paths; no
decision added at moment of event, the record is written before the card appears) —
Engineer ✓ (one presentation path per record type; the routing rule is now enforced
rather than commented) — QA ✓ (guard red on the pre-fix tree, green on the fix;
254 suites / 5588 tests) — Data N/A (no detector, threshold or query changed) —
Dr. Chen ✓ (the `given`-only dose record from capture becomes downgradeable; the
write itself is unchanged).

## Files

- `app/food-capture.tsx` — meal path → `showMeal`; `exitCapture()` extracted; trial
  flag passed in the payload (resolved synchronously here, so no patch race) and the
  ledger spent on reveal; `loggedTrialFlag` state + its three styles retired.
- `app/medication-capture.tsx` — first-dose path → `showMedication`.
- `guards/completionCard.test.ts` — new.
