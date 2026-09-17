# Trial window PR 3 — the door and the sheet: Manage → Change the window

**Date:** 2026-09-17

CUL-1040, the last build PR of the trial-window track and the one that closes
**CUL-156**. Shipped via **#873** (draft). Three commits: the build, the review
fallout, and a structural fix that came out of review.

A running diet trial's window can now be changed on any day, not only the day it
ends. That is the whole of CUL-156: on day 53 of 56 the PM's own cat was directed to
twelve weeks and the app had nowhere to put the instruction — the only mid-trial
control was `Replace`, which ends the trial and splits one clinical episode into two
partial windows.

---

## What shipped

**The door (§4.1, D6a).** `trialManageVerb` returns `Manage` on every running state.
It opens a two-row sheet whose entire job is that the two acts are never confused:
*Change the window* keeps one continuous episode and is reversible; *Replace the
trial* ends it and is not. `Manage` is deliberately neither act's own verb — a header
naming one would promise the other, which is the failure `Replace` was honest about
and `Change` (its predecessor) caused. Terminal and degenerate cards keep `+ Start`,
and suppression stays keyed on the body's actual actions rather than on `state`,
which would strand the two `abandoned` branches that ship `actions: []`.

The destination is a **paired resolver**, `trialManageTarget`, not a string compare on
the verb — and the guard asserts the biconditional over every state, both directions,
with a non-vacuity floor. That mechanism turned out to matter twice in one session
(see the a11y regression below).

The `trial_refusal` card's `Change or end the trial` action re-points here, which
makes its label true for the first time since B-533 — it could only end.

**The sheet (§4.2, D1a/D3a/D4a).** Denominated in **totals**. A wrapping, accessible
`ChipGroup` of whole weeks (B-146); the current window always present and marked
`· now`; the end date shown and recomputed per chip through the existing
`trialEndDayKey` / `formatTrialEndDate`. Forward-only is an **absence, not a dimmed
chip** — a total the product has ruled out is not a control that exists and is
unavailable (C-7). The vet box is unchecked and never required. `Save` carries no
confirm: the owner has crossed a sheet and picked a number, and the act is fully
reversible, so it earns confirm-XOR-reversal on the reversal side (CUL-645).

Everything the sheet *decides* lives in `lib/trialWindowSheet.ts` as functions over
integers; the component draws it. The forward-only rule is the reason the sheet exists
in this shape, and a rule exercisable only through a renderer is a rule tested by
pressing whichever chips happen to be mounted.

**The card after (§4.3).** One `forward` line for the rest of the local day the window
moved, appended at the one `activeCard` call site because the state machine is
untouched. No cheer, no `!`, no countdown, no coverage beside it.

**The ceiling — 365 days, PM-ruled this session.** CUL-1039's handoff asked for it and
left the number to §4.2 on purpose: `changeTrialWindow` bounds only at the column's
int4 max, because a value the write path invented would be a clinical judgment made by
a predicate. Forward-only makes a typo **un-correctable** — `840` for `84` writes a
2.3-year elimination window the report renders as the prescribed one, and the only path
down is `Replace the trial`, which splits the record. The ceiling is a **typo catcher,
not a clinical limit**, and that distinction governs its copy (it says what Culprit
*records*, never what a trial should be — TE-5/TE-7).

Above the chip ladder the protection is **legibility, not a confirm**: the typed total
echoes back in weeks and as an end date in the line §4.2 already requires. That is how
`Save` stays confirm-free while a fat-fingered `840` becomes visible before it.

---

## What review found, and what it cost

Three reviews ran. Two of the four significant findings were regressions this PR
introduced, and one was a risk it created.

### The blocking one — the header announced "Start a diet trial"

`DietTrialCard.tsx` built its accessibility label as
`manageLabel === 'Replace' ? 'Replace this diet trial' : 'Start a diet trial'`. When
D6a relabelled the verb to `Manage`, the first arm went dead and **every running
card** — day 53 of 56 included — told VoiceOver the control would start a trial.

That is CUL-156's own fear ("will this restart my trial?") spoken aloud, to the owners
least able to check the screen against it. It is also exactly what C-7 means by never
inventing a label that differs from the visible text.

The lesson generalises past the string: **a string compare against a verb was the
wrong mechanism, not just the wrong value.** `guards/trialWindow.test.ts` asserts that
very thing one layer down, about the host's routing — and this file was reading the
verb the same way the guard forbids. Both switch on `trialManageTarget` now. Proven by
restoring the exact pre-fix expression.

Found by `pm-feature-review`, not by a test. The existing component test asserted the
visible `Manage` string and never touched `accessibilityLabel`; the guard asserted the
resolver, one layer below the view. Neither could see it.

### The seventh spelling — a provenance detector blind to its most sensitive column

`guards/dietTrialProvenance.test.ts` (shipped by PR 4) asserts the three window
columns are handled by a registered set of modules and no others. Adding a client read
of `target_duration_set_at` made it red, correctly, and that is the guard working.

What the `rls-privacy-reviewer` then found is that the guard had a hole, and it was on
the column its own header calls the most sensitive. `PROVENANCE` held six spellings;
`changeTrialWindow`'s parameter is **`vetDirected`**, a seventh. So every caller that
*mints* the third-party attribution spells it that way and none spell
`targetDurationVetDirected`. Measured: this PR's sheet and its host both carried that
claim with **zero detector hits**, and a planted `vetDirected` handler in
`lib/daySummary.ts` passed all six tests.

**The rule:** a detector's spelling list needs the name used at the **boundary**, not
only the column's qualified name. A column's qualified name survives as far as the row
mapper; past that, every module that *decides* something with the value uses the field
name — and a guard about modules that decide must scan what they call it.

Adding it also exposed `supabase/functions/generate-report/render.ts`, which the
registry's preamble had filed as a prose mention. It reads `wc.vetDirected` in code,
and that read is the one decision in this whole feature about whether the document
prints a claim about a third party. **The registry had singled out the most
consequential reader in the set as a mere mention**, and it escaped only because the
detector was blind to its spelling. The correction is kept beside the wrong note.

Two of my own registry entries argued the wrong thing and now say what actually holds:
the App Group is closed by **three field-by-field interfaces**, not by the publisher's
discipline (the reviewer's correction, and it is a stronger guarantee than I claimed);
and the card's line does disclose one bit — *that the window moved today* — which the
entry concedes and bounds rather than denying outright.

### The C-14 modal swap — a risk I could not settle without a device

Tapping a door row closed one Modal and presented a sibling in the **same React
commit**. C-14 is the account of that shape, from one presenter on iOS, wedging the
beta log sheet until the app was force-quit for every multi-pet account.

I could not resolve it statically, so I put it to `code-reviewer` rather than guess.
It settled the question by **measuring the tree**: this was the only site in the repo
flipping two independently state-held sibling Modals in one handler; the two apparent
precedents (`PetSwitcherSheet`, `EventTypeSheet`) hand off to `router.push`, which is
the already-solved `onNavigateAway` case; and every multi-`<Modal>` file is a
step-switch where only one is ever live. **There was no precedent for a safe swap
because the codebase does not do one.**

The fix is the shape the sibling file already ships. `TrialCompletionSheet`, in the
same directory, holds one unconditional Modal and switches a `step` between its
decision rows and the forms behind them. So `TrialWindowSheet` became
`TrialWindowPanel` — the same content with no presentation of its own — and the door
swaps it in for its rows. That is also C-14's own prescribed split
(`PetSwitcherPanel` / `PetSwitcherSheet`). Both components were new in this PR, so
nothing outside it had to change.

`Replace the trial` still crosses to `StartTrialModal`, which cannot fold in: it is
reached independently from a terminal card's header and keeps a half-filled form alive
across dismissals. That one hand-off is **sequenced** — the row arms a ref and only
closes; the host presents on the Modal's own `onDismiss`, which is iOS-only and fires
after the dismissal animation, exactly the window in which a second present is
unreliable. Android has no such event and no UIViewController presentation to collide
with, so the row calls it directly there. No timer either way. A **ref, not state**,
per C-22: held in state, an already-scheduled passive effect re-enters with the
pre-clear closure and presents the form twice.

**And the guard I shipped was necessary but not sufficient.** `TrialManageSheet.test.tsx`
already asserted "exactly ONE Modal, open or closed" — and it stayed green while the
host mounted two individually clean components that overlapped for a commit. A
per-component assertion cannot see a composition. It now also runs on the window step,
and the step transition itself is asserted: the door leaves, no close fires, one Modal
throughout.

My own new test then caught the refactor dropping `onReplaceTrial()`, which would have
left that row doing nothing at all.

### Two more real bugs from the same review

**A naive `startedAt.slice(0, 10)`, in two places, under a comment claiming it mirrored
`dietTrialFacts.startKeyOf`** — which *branches*, where the slice does not. On an
ISO-instant `started_at` the slice yields the UTC day while `localDayIndexOf` (what the
card's own `Ends <date>` line uses) yields the local one. For
`2026-09-18T03:00:00.000Z` read at UTC-4 those are 18 Sep and 17 Sep, so **one card
printed two different end dates for one window**, on the sentence §4.2 calls the thing
the owner plans around. The branch is lifted to `trialStartDayKey` in
`lib/trialWindowDates.ts` and `startKeyOf` delegates to it — one implementation rather
than the three a second inline copy would have made.

The comment is the tell, and it is C-38's shape again: it *named* the function it was
supposed to mirror, which is what made it read as verified.

**The field and the Save button disagreed about one number.** `customError` called
`windowRefusalLine` directly, bypassing `saveStateFor`'s equality check, and the two
orders diverge in overrun: at target 56 on day 61, a typed `56` — the value the
owner's own marked chip shows, so the likeliest thing to type — read *"already on day
61"* on the field and *"That is the window you have now"* beside Save. The field reads
`save.reason` now: one precedence rule, not two (C-4).

Chasing that surfaced a third: **equality was rendered as shortness.** A typed total
equal to the current window fell into the *"That is shorter than the 56-day window you
set"* arm, over a 56. `saveStateFor` caught equality first, so the Save path was right
and only the typed path was wrong. Found by a test whose **own premise was wrong** — it
asserted every ladder total is "settled", and 28 is legitimately a prefix of 280. The
predicate was right; the assertion was not, and correcting it is what exposed the copy.

### Sam's pass — the field accused her mid-number

`customError` recomputed on every keystroke, so typing `84` reddened the field at `8`
with *"Nyx is already on day 53."*, and `112` did it at `1` and again at `11`.
`TextField` renders that in the destructive colour **and** calls
`announceForAccessibility` on each change on iOS — so a VoiceOver owner was told twice
that her cat is already past a number she is halfway through typing. An owner carrying
a vet instruction, corrected mid-digit, is the opposite of the register the sheet's own
intro line establishes.

`windowEntryIsSettled` withholds the refusal while another digit could still rescue the
value. It bounds the refusal's **timing** only — `saveStateFor` is unchanged, so a
prefix still cannot be saved and the reason still sits under the button. Silence means
"not yet", never "fine".

Four more from the same pass: a new selection reports the last write's refusal stale
(it won the `??` and suppressed the live reason for the total now chosen); the
exhausted-ladder line names the `Something else` chip instead of pointing "below" at a
field that only mounts once that chip is tapped; the vet row's label is inside the
target rather than an inert word beside a toggle; and the row is inert while a write is
in flight.

### Two docstrings that were cheques the code does not cash

Both corrected in place, because both sat inside the thing they described.
`saveStateFor` claimed its reason is "always rendered" when the no-selection arm never
has been — that exception is deliberate (the question above the chips *is* the
instruction) and is now stated instead of contradicted. And both sheets' `petName`
docs asserted a C-9 discipline their only call site does not keep: the host passes
`activePet.name`, which is correct here because this screen has no route to another
pet's trial. **A prop doc that asserts a discipline its call site does not keep is
worse than no doc** — the next reader either "fixes" the call site or stops trusting
the comment.

---

## Where I did not take a review's advice

The `rls-privacy-reviewer` recommended moving `targetDurationSetAt` off the shared
`TrialCardTrial` onto "a narrower card-only type", because `lib/daySummary.ts` receives
the whole `TrialCardTrial` and so can hold the field (contained today by a three-field
projection, but unpinned).

Measured before acting: `TrialCardInput` has **six** importers against
`TrialCardTrial`'s **three**. The move would have landed the field on a *wider* type by
the reviewer's own criterion. Took its stated fallback instead — the registry entry now
names what really contains it, and the day-summary projection is what a future widening
would have to get past.

The `code-reviewer`'s own "don't fold `StartTrialModal` in" was taken as given.

---

## Verification

- **8613 tests, 394 suites, all passing.** Touched suites also pass at UTC+14 /
  +12:45 / −10 (`App (jest, non-UTC timezones)`), which this work needed: almost every
  question in it is a local-day question.
- **Proven by mutation, not by reading** (C-18): the three new `trialWindow` guard
  assertions; both provenance containment tests (the widget leak mutant reds two tests
  at once); the a11y label, by restoring the exact pre-fix expression; the day-key
  branch, by restoring the slice under a skewed zone; the precedence fix, by restoring
  the direct call; and the `.lines` detector against **both** leak forms — the
  reviewer measured the destructuring variant green before it was widened.
- `deno test` was not run locally (Deno is absent from this environment). The diff
  touches no `supabase/functions/` file, and CI's Edge Functions job passed.

---

## Residuals — all filed, none blocking

| Issue | What |
|---|---|
| **CUL-1052** | `StartTrialModal`'s duration field has the same unbounded entry, and forward-only makes *that* typo permanent too. The constant and copy this PR ships are the fix. |
| **CUL-1054** | The card says the end date twice after a change, and nothing owns the countdown jumping from "3 days to go" to "4 weeks to go". The mock's §4 frame omitted the sibling line, so the composition was never reviewed. |
| **CUL-1055** | Three design-authority misses (the current chip's `.chip.cur` treatment, switch-vs-checkbox) plus the real gap: the vet toggle writes a vet-report clause the owner cannot know about. |
| **CUL-1056** | Two composition questions for the next mock round — the door's identical rows / naming the 53 days, and what the sheet should acknowledge over a live refusal. |
| **CUL-1038** | Commented, not filed: PR 1b is `In Progress` at Urgent, and the door is now the most discoverable route to the flip D7 repairs. AC 5b remains unmet and this PR's body says so. |

**Two lessons here want a home in `docs/engineering-lessons.md`** under existing
conventions rather than as new rules — proposed, not written, pending PM confirmation:
the boundary-spelling rule under §C-32 (a discovery guard's registry), and the
per-component-guard-cannot-see-a-composition half under §C-14.
