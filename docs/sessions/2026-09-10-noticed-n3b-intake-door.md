# Noticed N-3b — the intake-first meal sheet, and the *Didn't eat ›* chip

**Date:** 2026-09-10

CUL-870, shipped via #824. No schema, no deploy, no build-phase change.

The Noticed card's intake router and the sheet it lands on, both halves in one PR under the
PM's CUL-863 ruling ((a), sequenced). Three commits: the build, then two rounds of review
findings folded back in. The reviews are the substance of this record — the build was the
easy half.

---

## What the sheet is for

§4.5 describes opening the meal path "at the intake step". The pre-decomposition review's
E-1 found that step is not in the tree: `app/log.tsx`'s `handlePickFood` writes the meal
**the instant a food is picked**, with `intakeRating: null`, and hands the arms to the
root-level `MealCompletionCard`, which auto-dismisses. An owner who came through a door
labelled *Didn't eat*, picked the food, and let the card go would leave an ordinary,
unrated meal row behind — a record saying the bowl went down where she had just said it
came back full.

So the sheet inverts the order: **the food is a pre-filled default, the intake arm is the
commit.** Nothing is written until she names the arm, and the arm tap *is* the save (two
taps from the card to a saved refusal). Nothing is pre-selected — a cat who ate a quarter
is `some`, not `refused` (the B-156 G1 shape). What it writes is a meal row with an
`intake_rating`: the row `intake_decline` and `feline_reduced_intake` already read. One
predicate for intake, no new field, no "declined via the look" provenance.

The pre-fill **fails closed**. Under a running trial the trial diet pre-fills —
`primary_diet` only, membership through the shipped `trialListMembership`, never a second
matcher — because §4.5's named hazard is the wedge user rating *Refused* against a topper.
Every uncertain answer opens the food step instead of reaching for the newest food: an
unhydrated allowed set (`unknown` is not "no trial"), a running trial with no diet in force
today, a failed read, a treat or unclassified food, a pet with no meals ever.

## Where it mounts, and why that is the architecture rather than a workaround

`guards/homeWrites.test.ts` scans Home's **computed import closure** — 128 files — and reds
on any write helper outside the two-class allow-set. A meal write reachable from a Home card
is a third Home write class, which is a Tier-2 amendment to `docs/nyx-med-strip-requirements.md`
§0.1 and, as the AC says outright, not a marker.

That is the guard describing the shape the app already has, not an obstacle to route around:
the sheet is a doorway's destination (§4.5 — "the chip is a doorway in the sense the shipped
TodayZone nudge already is"), and every other surface that writes a meal mounts outside Home
for the same reason. So `LookCard` publishes a request through `store/uiStore.ts`, and
`app/_layout.tsx` owns the sheet beside `<MealCompletionCard/>`.

**Proven by mutation, twice:** importing `IntakeFirstMealSheet` into `LookCard.tsx` reds the
guard on `components/log/IntakeFirstMealSheet.tsx:… — insertMeal( is a THIRD Home write
class`. The `uiStore` indirection is load-bearing, and the second adversarial pass was asked
to re-prove it rather than take the first pass's word.

## Three decisions made in the build

- **`insertMeal` gained an optional `intakeRating`, written in the same transaction.** Today
  the rating is a separate `updateMealIntake` UPDATE. INSERT-then-UPDATE leaves a window in
  which the record holds an ordinary unrated meal for a bowl the owner came through a door to
  refuse, and a throw (or a kill) inside that window makes it permanent. Defaults to `null`,
  so the three pre-door callers are unchanged.
- **E-16: one label, and pet count is the whole fork.** *Didn't eat ›* / *Left his · her ·
  their food ›*, the possessive inflected exactly as `notHerselfLabel` beside it already is
  (E-15: `pets.sex` is NOT NULL with an `unknown` member). Never species, never the bowl — a
  shared bowl is not knowable and no copy may imply it (CUL-222 owns the bowl;
  `lib/feedingArrangements.ts` is inert). "Left her food" over a male dog is what
  `notHerselfLabel` already exists to prevent.
- **The arm tap is the save, no Save button.** The round-4 mock draws a dim *Save meal* bar;
  that is the pre-arm state, and a third tap would break the AC's two-tap test.

---

## The reviews — what they found, and what it cost

Three ran. This is the part worth reading.

### `pm-feature-review` — NEEDS-WORK on all four flows

Six findings were real and are fixed:

1. **A failed save said nothing.** The catch block carried a comment claiming *"a failed
   write is always said"* (C-25 / CUL-575) and did not say it — it logged, released the
   re-entrancy guard, and left the sheet unchanged, which on the one surface where the owner
   has just reported a refusal is indistinguishable from "still thinking". The review caught
   it against this feature's own sibling, `LookCard.handleDone`. **A comment is not a
   behaviour**, and the test now asserts both halves because the silent half is what shipped.
2. **The food step shipped without either promise** — the two states that most need them (a
   first-run pet, and the trial owner overriding the pre-fill) had neither.
3. **`Close` → `‹ Back to Noticed`.** The mock is the design authority and carries that label
   for this sheet specifically (`isRouter ? '‹ Back to Noticed' : 'Close'`). The first cut
   reasoned against "Cancel" — the right argument aimed at the wrong alternative.
4. The promises took the mock's teal ink at `textSM`, not tertiary at `textXS`.
5. *Change food ›* became chip-sized, per §4.5's wording and the mock's `chip door`.
6. The loading tier became a skeleton — two local SQLite reads is a content-shaped wait under
   ~1s.

**One finding did not hold**, and checking it was worth the two minutes: the review called
*Snap a new food* broken for writing an unrated meal, citing `food-capture.tsx`'s
`showMealMoment`. That call sits inside `if (cameFromMealLog && pet)`, and this sheet pushes
`/food-capture` with no `fromLog` — the add-only path, which writes no meal. Read the branch,
not the line (C-7's lesson, in a review this time).

### `adversarial-reviewer` — FAIL, five breaks

Three were mine:

- **The trial fallback bypassed the food-type filter.** `lib/intakeFirstMeal.ts`'s docstring
  claimed a treat, an `other` and an unclassified food were all ineligible; the recents branch
  enforced it and the fallback did not, because `AllowedFood` carries no `food_type`. A
  `primary_diet` row pointing at a food cached `food_type: null` — nullable with no default
  since migration 010, *"legacy rows, or user skipped"* — arrived pre-filled and **named as
  the trial diet**. The refusal she then records is invisible to `intake_decline`, to the
  report and to analytics (all filter `foodType === 'meal'`), and the completion card renders
  no intake row for an unclassified food, so there is no correction affordance and no cue. A
  silent drop, in the direction that loses a refusal.

  The sharpest part of the finding was about the test, not the code: the sibling case
  **named both filters in its comment and asserted only the decision** — one function short
  of where the rule was being dropped. The new cases live at the loader, and cover `treat`,
  `null` and `other` plus the positive direction.

- **The food line asserted a fact nothing had checked.** `onPickFood` hardcoded
  `source: 'recent_meal'`, so the sheet printed "her most recent food" under a bag
  `getRecentFoods` was never asked about and the pet may never have eaten — and in the same
  line dropped §4.5's trial naming at the one moment it does any work: when she changes
  *away* from the trial diet. Now derived through `trialListMembership` (`pickedFoodSource`),
  with a third source, `'picked'`, that renders the label alone. The honest answer to "why is
  this food showing" is "you chose it".

- **One sentence in the confidence registration was false.** It claimed *"Change time"*
  restates the confidence honestly through `sourceAfterPointEdit`. That helper corrects the
  SOURCE; the confidence is re-asserted as `witnessed` unconditionally at
  `MealCompletionCard.tsx:244`, exactly as `app/edit-event.tsx` does. A found-later refusal
  can be re-dated but never re-graded. Corrected in place, with why it costs the record
  nothing today (no surface reads a meal's `occurred_at_confidence`).

The fourth was **not in this diff, and was fixed here anyway**:

- **The card erased her answer in one tap.** `MealCompletionCard` reveals with the chip lit —
  this PR is the first caller in the repo that produces that state — and `IntakeChipRow` reads
  a tap on an active chip as CLEAR. So the natural "yes, that's right" gesture on a
  highlighted answer ran `updateMealIntake(eventId, null)`: no confirm, no way back, card gone
  1500 ms later, and her refusal turned into the unrated meal row this door exists to prevent.
  The pass executed it and printed the call.

  Ordinarily out-of-scope work is filed, not folded (CLAUDE.md § Backlog Protocol). This was
  folded because the alternative was knowingly shipping a one-tap silent path to this PR's own
  defect class, and because the fix needs no design ruling: it is C-21 compliance ("a
  destructive action carries a confirm before or a way back after", and this had neither). A
  clear is now honoured only when the card itself set the value; changing to a different arm
  is untouched, and every pre-door path keeps its toggle exactly, because on those the
  presented rating is null. Proven by mutation.

The fifth and the shared-bowl break are PM decisions and stay filed (below).

### `code-reviewer` — fix-before-merge, test-coverage only

No correctness bugs. Two coverage gaps, both closed: a direct test for the `uiStore` slice and
the host's lifecycle (which is the assumption the panel's one-shot pre-fill read rests on),
and a **value-level** assertion for `intake_rating`'s column position in `lib/meals.test.ts` —
the pre-existing count guard cannot see two adjacent params swapping, which the mutation
proved. Both nits taken: the chips' `hitSlop` is derived from `CHIP_VERTICAL_REACH` (both
wrappers, so they cannot drift from the row gap that depends on it), and the host's comment no
longer credits `key` for what `if (!request) return null` actually delivers.

---

## What generalises

- **A comment claiming a behaviour is not the behaviour.** Two of this session's findings were
  a docstring and a catch block each asserting a rule the code beside them did not follow, and
  in both cases a test existed that would have caught it if it had been pointed one layer
  lower. The `pm-feature-review` found the first against the feature's own sibling; the
  adversarial pass found the second by running the loader the test stopped short of.
- **A test that names a rule in its comment and asserts a layer above it is worse than no
  test**, because it reads as coverage. Twice, in one session, in the same file family:
  `intakeFirstMeal.test.ts` said "Both filters have to hold at once" and asserted the
  decision, where only one of the two filters lived; and the double-tap test named the
  batched hazard and asserted the sequential one, which passes on the broken guard. **The
  second one was written after the first was diagnosed**, which is the part worth keeping:
  knowing the failure mode did not stop me reproducing it an hour later. The check that
  would have caught both is mechanical — run the test against the thing it claims to
  forbid, not just against the fixed code.
- **A correction can be wrong in the same direction as the thing it corrects.** The
  confidence registration was rewritten once and was still one notch stronger than the
  evidence; it took a sweep of the actual readers to get a sentence that holds. This is
  CLAUDE.md's frozen-brief lesson — "six attributions stated one notch stronger than their
  source" — arriving in live code rather than in a research doc.
- **A fix can invalidate another fix's citation.** Fix 3 inserted 28 lines above the literal
  fix 4 cited, in the same commit, and neither noticed.
- **The first caller of a state is where a shared surface's assumptions get audited.**
  `momentStore.ts:559` justifies the meal card's success register with *"Meal and dose cards
  are routine commits by construction — there is no symptom path through them"*. N-3b is that
  path. A premise written when it was true does not announce itself when it stops being true;
  what surfaced it was being the first caller to produce the new input.
- **Check a review's finding at file:line before acting on it.** One of eleven did not hold,
  and the fix would have been real work on a path that is already correct.

### `adversarial-reviewer`, second pass — FAIL again, and the best finding of the session

C-19 says the falsification pass re-runs after every correction on a safety surface. It did,
on the corrected tree, and it was worth it twice over.

**It found a defect the FIRST pass had passed, and that I shipped.** `onArm`'s re-entrancy
latch was the `saving` React **state** flag. `IntakeChipRow` renders five independent
touchables, so two fingers landing together arrive in ONE React batch with no commit between
— both handlers read `saving === false` and both write. Executed: **two meal rows for one
bowl with contradictory ratings** (`['refused','all']`), of which only the second raises a
card, leaving the first invisible and unreversible from the completion surface. Downstream
that is pseudoreplication in the literal sense — `classifyRatedMeals` counts both.

The repo had already ruled this exact shape: `hooks/useSubmitGuard.ts` (B-336, "two dose
events for one pill"), a **ref** latch, used by `app/log.tsx` and `SimpleEventConfirm` for
"the tile IS the write". This sheet's own header says *the arm tap IS the save*. Same rule,
same latch — now used.

**And the reason it slipped past both my test and the first pass is the lesson this session
had already written down, applied to itself.** The shipped test was called *"a double tap
cannot write two meals for one bowl"* and passed on the broken guard, because RTL's
`fireEvent.press` flushes `act` per call — it only ever exercised the SEQUENTIAL case. A test
that names the batched hazard and asserts the serial one reads as coverage it does not have.
Both directions are now proven by mutation against the state-flag version:

| | state flag | ref latch |
|---|---|---|
| sequential double-tap | **passes** | passes |
| both presses in one batch | **fails, 2 calls** | passes |

The other findings, all fixed:

- **The first fix's residual.** `loadIntakePrefill` had learned to refuse an unclassified
  `primary_diet` food; `pickedFoodSource`, twenty lines away, still named that same bag "the
  trial diet" when the owner picked it out of the picker one tap later. One predicate cannot
  have two answers depending on which door the food came through.
- **The confidence registration was wrong a second time, in the same direction.** The rewrite
  claimed *no surface reads a meal's `occurred_at_confidence`*. False: `EventRow`,
  `lib/dayEvents`, `app/event/[id].tsx`, `patternsTiming`'s feeding read, and — the one the
  enumeration omitted — **the correlation engine itself**, which carries it as
  `FeedingInput.confidence` from both `generate-signal` (`index.ts:534`) and
  `generate-report`. The defensible statement is about their BEHAVIOUR: every reader treats
  `witnessed` and `null` identically for a feeding (the engine says so in its own comment),
  except `confidenceWord`, which no meal reaches today. Rewritten against a verified sweep
  rather than an assumption.
- **A fix moved the line another fix cited.** `MealCompletionCard.tsx:244` → `:273`, in the
  same commit, because fix 3 inserted 28 lines above it.
- **`loadIntakeDoor` read the trial set twice** under a docstring saying "in ONE read pass".
- Minor: *"her most recent food"* for a food a more recent treat outranked (now "most recent
  meal", which is what the predicate checks); and the clear guard was one condition too
  strict — it blocked every clear for the card's life, so a chip she had changed *here* was
  silently inert.

**Two things it correctly did NOT ask me to change:** the shared-bowl unrated state stays
CUL-895 (a PM decision, and it says so), and the missing trial heads-up stays CUL-893.

---

## Residuals — filed, not fixed

| Issue | What |
|---|---|
| **CUL-894** (Urgent, `Waiting on PM`) | The meal completion card celebrates a refusal — gold check, "Logged · <food>", the success double-tap. The food-side twin of the med strip's N3 rule. A shared surface with four other callers; the register is a Designer/PM call. Also carries the "the card re-asks the identical question" finding. |
| **CUL-895** (`Waiting on PM`) | §4.5 names the shared-bowl answer as the meal path's unrated state, and this sheet cannot produce one — the arm is the only commit. The household whose label was rewritten for it is the one with no honest exit. |
| **CUL-893** | The log-time trial heads-up (`applyTrialFlag`) is on the picker and FAB paths and not this one. The fix is extracting it to `lib/` rather than copying it a third time. |
| **CUL-896** | The look's pinned Done bar and the meal card can share a corner — newly reachable, because the router renders with the grid open. Device pass first. |

Two things the adversarial pass raised that are pre-existing and are **not** filed as this
track's: `detectIntakeDecline` keys days on UTC (so two refusals on one local day at a large
offset can print "the last two days"), and neither detector ① nor `classifyFeeding` reads
`intake_rating`, so a refused meal is a full protein exposure. Both are engine-side and
predate this door; this door makes them easier to reach, which is worth knowing when the
engine is next opened.
