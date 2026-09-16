# Diet-trial extension — changing a running trial's window

**Version:** 1.1 (DRAFT — seven decisions open) | Last Updated: 2026-09-16
**Changed at 1.1, same session:** the `adversarial-reviewer` pass returned **FAIL** and falsified draft 1's TE-6.
Coverage is *not* untouched by an extension (§5.4), so TE-6 is now a requirement rather than an assertion,
§5.3 is narrowed to the exposure half that held, §5.4–§5.6 are new, and **D7 is new and is the most serious
decision in the set**. Nothing was quietly corrected: draft 1's claim is named where it stood.
**Linear home:** CUL-156 · **Pairs with:** CUL-367 (the GI arithmetic, Dr. Chen ratification), CUL-254, CUL-267
**Spec this amends:** `docs/nyx-diet-trial-requirements.md` §4.3 (the milestone) — this document does not replace it.

---

## 0. Why this exists, and the case that produced it

On 2026-09-16 the PM's own cat was on day 53 of a 56-day elimination trial when the vet directed a move to
**twelve weeks**. The app had nowhere to put that instruction. This is not a hypothetical, and the shape of
the failure is worse than "a missing button":

| What the owner has | What the app offers on day 53 |
|---|---|
| A vet instruction: *continue to 12 weeks* | Nothing. No control on any surface changes the window. |
| Three days until the window ends | Wait. The milestone appears only when `dayCounter >= targetDays`. |
| A card header labelled **Replace** | A flow that **ends** the trial and starts a new one — two rows, two partial windows, and the 53 days of record detached from the 31 that follow. |

And on day 56, when the milestone does appear, the one-tap extension for this trial is
**`Keep going — 2 more weeks`** → a 70-day window. Not 12 weeks. Reaching 84 days takes **two** taps
**two weeks apart**, each of which also presents `This trial is done`.

> **The wedge is "the owner sent home with a diet trial."** A vet instruction about that trial's length is
> the single most consequential thing such an owner is ever told, and it is the one thing the product
> cannot record.

**The live trial that produced this spec** (read 2026-09-16, service-role, scoped to the owner):
`cat · indication 'gi' · started 2026-07-26 · target 56 · day 53 · Royal Canin Selected Protein PR`.
It is used as the worked example throughout; `TE-W` marks a rule it directly produced.

### 0.1 What already exists (verified in the tree, not assumed)

- `extendTrial` (`lib/dietTrialSetup.ts:743`) — a real, working write. One column, `target_duration_days`.
- `nextTargetDays` / `extensionDays` (`lib/dietTrialCompletion.ts:89,118`) — the arithmetic, with the
  "cannot set a target at or below the current day" clamp.
- `handleExtendTrial` (`app/(tabs)/profile.tsx:431`) — the one-tap, no-confirm caller.

**None of it is reachable before the target end date.** `stateFor` (`lib/dietTrialCard.ts:1169`) returns
`milestone` only at `overrunDays === 0` and `overrun` above it; every other route to the decision sheet —
including the ones on the refusal and intake-decline replacement cards — is gated on `overrunDays >= 0`
(`lib/dietTrialCard.ts:1576`, `:1619`, `:1789`). There is no mid-trial path, in any state.

So this is **not a new capability. It is a missing door onto a capability that shipped in PR 6.** That
distinction sets the scope: the write path, the arithmetic and the clamp are already built and tested.

---

## 1. Scope

**In:** a mid-trial way to change a running trial's window; the provenance that change owes the record; the
vet report's rendering of a window that moved; the milestone preset's arithmetic where this spec's case
falsifies it.

**Out:** `paused` (refused at A-2, and nothing here re-opens it — an extension is the *opposite* of a pause);
trial-milestone notifications (CUL-107); the rechallenge/reintroduction phase (CUL-297); changing a trial's
*foods* mid-trial (shipped, B-616); changing its start date.

---

## 2. The spine — seven rules that govern every surface below

**TE-1 · One clinical episode is one row.** An extension is an `UPDATE` to `target_duration_days`. It is
never a second `diet_trials` row. This is not new; it is `extendTrial`'s own stated reason for existing, and
the reason P-2 refused `paused`. The mid-trial door exists **because** the only mid-trial control today
(`Replace`) violates it.

**TE-2 · The owner states a TOTAL; the app never asks for a delta. (TE-W)** A vet says *"take it to twelve
weeks"*, never *"add twenty-eight days"*. The mid-trial sheet is denominated in the total length of the
trial, with its end date shown, and the app does the subtraction. The milestone's existing `Keep going — N
more weeks` one-tap is **unchanged** — there, the owner has not been handed a number and a named default is
the correct affordance (§4.3, and Jordan's review of it). Two moments, two registers, one write.

**TE-3 · The window may move forward freely. Moving it backward is a different act.** Extending is
ordinary. Shortening can convert a trial that was stopped early into one that "ran its course" on the vet
report — see §5.2, which is a laundering path, not a cosmetic issue. **D3 rules how shortening is handled;
until it is ruled, the sheet offers extension only.**

**TE-4 · A window that moved is a clinical fact, and the record must keep it.** `target_duration_days` is
overwritten in place, so today an 8-week trial extended on day 56 is byte-identical, everywhere, to a
12-week trial started on day 1. *That the signs had not resolved at eight weeks* is a finding — and it is
the finding the extension is evidence of. The precedent is already on this table: `target_protein_set_at`
exists so the report can say *"protein confirmed day N"* (TP-3). The window owes the same. **D2 rules the
mechanism.**

**TE-5 · Culprit never proposes an extension.** The app may present the milestone decision — the owner must
resolve it — but it may never raise "should this trial be longer?" on its own. Trial length is a clinical
judgment; the product's job is to *record* the vet's, not to issue one. The mid-trial control is therefore
a **door the owner opens**, never a prompt, a badge, or a nudge (Principles 3 and 4).

**TE-6 · An extension may not move a claim about the record that the record did not change.** This is a
**requirement on the build, not a description of today** — stated as an assertion in draft 1 and falsified
by the adversarial pass the same session. On an **un-ended trial past its target**, the B-422 coverage tail
clip bounds the coverage denominator at the *current* target (`lib/dietTrial.ts:2201-2206`), so one
extension tap moves `belowCoverageFloor` and `mayStateRecordClean` **in the reassuring direction, with zero
new evidence, retroactively over days already reported**. §5.4 has the executed case. D7 rules the repair.

What is genuinely untouched, and must stay so: **off-diet exposures and their denominator**. Every
exposure loop bounds on `evidenceEnd` and only `range`/`coverage` use the clipped `endDayIndex`, so
extending can never delete a logged exposure — verified under the tap. That asymmetry is deliberate
(§5.2's floor may only move toward disclosing more) and is the half of the invariant that held.

The progress bar's denominator (`progress.fraction`) also moves. That one is honest and must not be
dressed as a setback. See §4.3.

**TE-7 · The extension is never a verdict, in either direction.** Extending does not mean the trial is
failing; it does not mean it is working. The copy says what was recorded and what the new window is, and
nothing about what it means (§6.1: *Culprit never scores the trial*).

---

## 3. The failure this replaces

`trialManageVerb` (`lib/dietTrialCard.ts`) returns **`Replace`** for every running-trial state. That label
is *honest about current capability* and was a deliberate improvement over `Change`, which "read as an EDIT
and routed an active trial, on `day_one` the card's ONLY control, straight to its own destruction"
(CUL-156's root cause, verbatim from the card's own docstring).

The relabel fixed the lie. **It did not fix the missing capability, and one state still carries the old
wording**: the `trial_refusal` card offers `Change or end the trial` (`lib/dietTrialCard.ts:1608`) — which
can only end it.

Once a real edit exists, the header becomes a door to **two** acts that must never be confused:

| Act | What it does to the record | Reversible? |
|---|---|---|
| **Change the window** | One row, one continuous episode, a longer window | Yes — change it again |
| **Replace the trial** | Ends this trial (`abandoned`/`completed`), starts a new one | No |

---

## 4. The surfaces

### 4.1 The door — the trial card header

The header affordance on a **running** trial becomes **`Manage`**, opening a two-row sheet:

> **Change the window** — the trial keeps running; only its length changes
> **Replace the trial** — end this one and start a new one *(the existing flow, with its existing confirm)*

On a terminal or degenerate card the header is unchanged (`+ Start`). The `trial_refusal` card's
`Change or end the trial` action is re-pointed at this sheet, which makes its existing label true.

**Suppression is unchanged** and stays keyed on the body's actual actions, never on `state`
(`trialManageLabel` — the regression `code-reviewer` caught on 2026-08-06 must not be re-introduced).

### 4.2 The sheet — *Change the window*

Denominated in totals (TE-2). For the worked case, opened on day 53 of 56:

> **How long is this trial now?**
> Nyx is on day 53. Your vet decides the length — this just records it.
>
> `8 weeks` *(current)* · `10 weeks` · **`12 weeks`** · `16 weeks` · `Something else`
>
> **12 weeks — ends 17 October.** That is 28 more days than the window you set.
>
> ☐ My vet asked for this
>
> `Save the new window` · `Cancel`

Rules:

- **Chips are a `ChipGroup`**, wrapping and accessible — never a horizontal scroll (house rule, B-146).
  Closed set of whole weeks; `Something else` opens a numeric day entry.
- **The current window is always present and marked**, so the owner can see what they are changing from,
  and so "leave it alone" is an explicit option rather than the Cancel button (filter-UX rule: defaults are
  explicit options).
- **The end date is shown, always**, and recomputed as the chip changes. `trialEndDayKey` /
  `formatTrialEndDate` already exist (`lib/dietTrialSetup.ts:156,165`) — no new date math.
- **A total at or below the current day is refused in the UI**, not just clamped in the write. The owner
  gets a reason (*"Nyx is already on day 53"*), never a silent correction. The `nextTargetDays` clamp stays
  as the belt-and-braces guarantee behind it.
- **The vet checkbox is unchecked by default and never required.** Checking it records the owner's
  statement, which is exactly how the report must attribute it (§5.1). It is one optional question on a
  deliberate, non-event surface — Principle 1 governs the moment of the event, and this is not one.
- **This write takes a confirm-free `Save`, but is not one-tap from the card.** The milestone's no-confirm
  extension is correct *there* (the named default is the whole affordance). Here the owner has already
  crossed a sheet and picked a number, so the sheet's own `Save` is the confirmation. It is reversible in
  full — re-open and change it again — so it earns confirm-XOR-reversal on the reversal side (CUL-645).

### 4.3 The card after the change

The card re-reads immediately (`notifyTrialChanged` already does this). For the worked case it goes from
`Day 53 of 56` to `Day 53 of 84`, and the progress bar retreats from 95% to 63%.

**That retreat must not be dressed as a setback (TE-6).** It is the truth: the window is longer. The card
adds one line for the rest of the day the window changed, and no longer:

> The window now runs to 17 October.

No celebration, no `!`, no "great — keep going", no restatement of coverage next to it. The state machine is
untouched: the card is in whatever state §4.2 of the trial spec says it is in, with one extra `forward` line.

### 4.4 The milestone — unchanged, except its arithmetic

The three-way decision row, its weighting, and the one-tap `Keep going` all stay exactly as §4.3 specifies.
**What this spec's case falsifies is `extensionDays`' GI value** — see D5. That is CUL-367's open Dr. Chen
ratification, which this case moves from theoretical to observed, and it is ruled there, not here.

---

## 5. The record and the vet report

### 5.1 What the report must be able to say

Today the report can render, for the worked case after an extension, only:

> `Elimination diet trial — day 60 of 84.`

A clinician reading that has no way to learn that the window was eight weeks until day 56. What it owes:

> `Elimination diet trial — day 60 of 84. Window extended from 56 days on 19 Sep (day 56), owner reports
> at the vet's direction.`

Three things are load-bearing in that sentence:

1. **The original window**, because the trial was designed against it.
2. **The day it moved**, because *when* an extension was decided is the clinical signal — a window extended
   at day 56 says the signs had not resolved at eight weeks.
3. **"owner reports"**, because the app cannot verify a vet instruction and must never assert one (the same
   attribution discipline §4.3 applies to the owner's outcome verdict).

If the vet checkbox is unchecked, the clause is simply absent. **The absence is never rendered as "the
owner did this on their own"** — an unchecked box is silence, not a claim (the two-sided rule the trial
spec applies to off-diet marking: *a mark's absence is never a verdict*).

### 5.2 The laundering path a backward move opens — the reason D3 exists

`render.ts:3948` renders a completed trial's stop-reason line against the **current** `target_duration_days`:

```
const short = t.targetDurationDays - t.trialDaysElapsed
if (short > 0) return `Marked complete at day ${…} — ${short} days short of the ${…}-day window.`
return 'Ran its course — the full window was completed.'
```

**Executed:** a 56-day trial, owner shortens the window to 28 on day 28, then taps `This trial is done`.
`short = 0`, and the report prints **"Ran its course — the full window was completed."** An eight-week
trial abandoned at four weeks is rendered to the clinician as one that completed its full course. Nothing
on the document contradicts it.

This is not an argument against ever shortening — an owner who typed 56 when the vet said 28 has a real
correction to make, and CUL-156 was filed for exactly that direction. It is the argument that **shortening
cannot ride the same path as extending**, and that whatever D3 rules, §5.1's original-window record is the
thing that makes the report safe either way.

### 5.3 What does *not* change

Off-diet exposures, **their** denominator, the §5.3 rung order, `classifyFeeding`, and the allowed set.
Every exposure loop bounds on `evidenceEnd`, and only `range`/`coverage` use the clipped `endDayIndex`
(`lib/dietTrial.ts`'s own comment: letting the clip bound the feeding loop *"would silently DROP a treat
fed on day 2 … which is the one direction a floor may never move"*). **Verified under the tap:** two real
off-diet feedings inside the clipped tail survive an extension with identical counts.

> **Draft 1 said coverage was in this list. It is not.** See §5.4 — the correction is load-bearing, and it
> is the reason D7 exists.

### 5.4 The finding the adversarial pass returned — one tap moves a reassurance gate

**Executed** (`adversarial-reviewer`, 2026-09-16, against the shipped modules). A dog·gi trial on the
shipped 28-day default; the owner logs 10 of days 1–28, then every day from 29 to 50; the report is pulled
on trial day 50:

| | coverage | interpretability | `belowCoverageFloor` | `mayStateRecordClean` |
|---|---|---|---|---|
| before the tap | 10 / 28 (36%) | `does_not_support` | **true** | **false** |
| after one `Keep going` (target → 64) | 32 / 50 (64%) | `partially_supports` | **false** | **true** |

What the vet report prints across that tap:

> *"The record is too sparse to read that as a clean elimination"* → **"32 feedings — all 32 matched the
> trial diet or a permitted food."**

The mechanism: the tail clip applies only while `overrunUnended` (`!endedAt && evidenceEnd > targetEnd`).
Extending pushes `targetEnd` past the evidence, the clip stops applying, and the denominator jumps from
the old window to the full elapsed range. It runs both ways — on a trial logged daily to day 28 then
silent to day 90, one tap moves `supports` → `does_not_support` and *withdraws* a clean claim.

**Three things make this the session's most serious finding.** The gate is §5.2's protection against the
app reassuring an owner off a record it cannot read; it is now movable by an owner action that carries no
information about the record; and **nothing on any surface says the window moved.**

**And the disclosure the clip's own justification cites does not exist.** `lib/dietTrial.ts:2223` says the
tail clip is fine because *"`closedByOverrun` discloses it"*. Repo-wide, `closedByOverrun` is read by
**nothing in production** — its definition, one comment, and its own test file. C-38's *"a comment writing
a cheque the code does not cash"*, sitting inside the clip whose whole justification is the disclosure.

**The precedent that settles what to do.** The report already discloses the *other* mid-trial change to
the comparator (`render.ts:2721`):

> **"The allowed list changed after the trial started"** — the dates above are when each food was
> permitted, and feedings are scored against the list in force on the day.

A mid-trial change to the **window** is the larger claim and has no equivalent anywhere. §5.1's sentence is
that equivalent.

### 5.5 Three more, from the same pass

- **The value diverges from the owner's intent, without bound, in overrun.** `nextTargetDays` extends from
  `max(currentTarget, dayCounter)`, which is right for the owner-facing promise ("4 more weeks" means four
  weeks from today) and wrong for the report, which reads the same integer as *the prescribed window*. A
  56-day trial tapped on day 140 writes **168** — rendered to a clinician as a 24-week elimination
  prescription, which is not a thing. One integer, two meanings.
- **The extension resurrects a retired trial, unbounded and unlabelled.** Past
  `TRIAL_OVERRUN_GRACE_DAYS`, `isTrialRunning` is false; the `overrun` card's one action —
  **"Tell Culprit what's next"**, a label that says nothing about a window — reaches the decision sheet and
  one tap re-arms the widget projection, three Signal suppressions, the L2 trial-response lane, the report
  anchor and the allowed-set belief gate. The mechanism is intended (the constant's own docstring calls the
  tap *"the sanctioned way to move the window"*); the unbounded, unlabelled reach is not.
- **The extension ladder cannot land on the clinically named total.** On the shipped **cat·gi default of
  42 days**, an owner told "twelve weeks" on day 53 walks 42 → 67 → 81 → 95. **84 is never reachable** —
  they stop three days short of the ACVIM window or overshoot it by eleven. §4.3 names that window as the
  live clinical harm. (The worked trial escapes this only because its target was set to 56 by hand.)

### 5.6 What held

Stated because a list of only failures is not a falsification pass:

- `nextTargetDays`' acceptance criterion — 1,280 degenerate input combinations, **zero** violations of
  "target strictly above the current day"; NaN degrades to "one more day" rather than throwing.
- The exposure floor survives the tap (§5.3).
- The decline and refusal replacements still outrank the milestone, so a cat that has stopped eating is
  never offered a bare `Keep going` with the safety fact stripped.
- `detectTrialResponse`'s rate denominators are target-independent — an extension cannot move a rate.
- LWW cannot strand an extension: `synced = 0` in the same statement, and `hydrateDietTrials`' `synced = 1`
  backstop means a pull cannot clobber an unpushed one.

**Not tested, and owed:** no live Deno render (two report strings were transcribed, not executed — a
`deno test` over `render.test.ts` with a mutated `targetDurationDays` closes it, and is the right guard to
add with PR 4); and **concurrent extension from two devices**, which is an LWW column write where both
owners believe theirs landed. The mid-trial door makes that far likelier than a once-per-milestone path
does — it belongs in PR 2's test plan.

---

## 6. Decisions the PM owes

Each is a decision brief: what changes, the options with a recommendation, what it unblocks.

### D1 — Totals or deltas on the mid-trial sheet

**Deciding:** whether the sheet asks *"how long is this trial now?"* (8/10/**12**/16 weeks) or *"how much
longer?"* (+2/+4/+8 weeks).
**Options:**
- **(a) Totals — recommended.** Matches the sentence the owner carries out of the clinic ("twelve weeks");
  the app does the subtraction. Mock frame 4a.
- (b) Deltas. Consistent with the milestone's `Keep going — 4 more weeks`, but requires the owner to do
  arithmetic against a day counter to honour a vet instruction. Mock frame 4b.
**Why (a):** the one input the owner actually possesses is the total. (b) makes them convert it, at the
exact moment an error costs four weeks of a restrictive diet — **and before the milestone, (b) is
ambiguous on its face.** `nextTargetDays` extends from `max(currentTarget, dayCounter)`, so on day 53 of a
56-day trial *"4 more weeks"* writes **84** (four weeks past the window's end) while the owner reads it as
day 81 (four weeks past today). At the milestone the two coincide, which is why the milestone can keep its
delta; mid-trial they never do, and a sheet cannot be honest about which it means without naming the
total anyway.
**Consequence:** rules the sheet's copy and chips; does not touch the milestone, which keeps its delta.

### D2 — How the record keeps the fact that the window moved

**Deciding:** the mechanism behind §5.1's report sentence.
**Options:**
- **(a) Three columns on `diet_trials` — recommended.** `target_duration_days_initial INTEGER`,
  `target_duration_set_at TIMESTAMPTZ`, `target_duration_vet_directed BOOLEAN`. One migration, additive,
  nullable, no new table, no new RLS surface, no local-mirror table, no wipe-list entry.
- (b) A `diet_trial_window_changes` child table — full history of every change.
- (c) Nothing; the report renders only the current window.
**Why (a):** this table has already ruled this exact question once — `target_protein_set_at`'s contract is
*"an edit is disclosed here, never versioned — one value, whole-trial"* (TP-3, migration 053). (b) buys the
middle steps of a multi-step extension, which is marginal, at the cost of a table, its RLS, its SQLite
mirror, its `LOCAL_WIPE_TABLES` entry and its sync pass. (c) is what ships today and is what §5.1 rejects.
**Consequence:** (a) or (b) gate the report work; (c) closes §5.1 and leaves the vet report unable to
distinguish a 12-week trial from an extended 8-week one, permanently.

### D3 — May the window move backward at all?

**Deciding:** whether *Change the window* offers totals below the current one.
**Options:**
- **(a) Forward-only in v1 — recommended.** Shortening routes to `Replace the trial`, which already ends
  the trial honestly and records a `stopped_reason`.
- (b) Allow it, gated on D2(a)/(b) so the original window is always on the report beside it.
- (c) Allow it freely.
**Why (a):** §5.2 is executed, not theoretical, and (a) closes it with no new render logic. CUL-156's
"entered 28, vet meant 56" case is forward and is fully served. The "entered 56, vet meant 28" case is
rarer and has an honest existing path.
**Consequence:** (a) halves the build and defers nothing the worked case needs. (c) ships §5.2's laundering
path.

### D4 — Does the app ask whether the vet directed it?

**Deciding:** the §4.2 checkbox.
**Options:**
- **(a) One optional, unchecked checkbox — recommended.** Renders §5.1's attribution clause when checked;
  silence when not.
- (b) No question; the report says only that the window moved and when.
**Why (a):** *"owner reports the vet extended this to twelve weeks"* and *"the owner extended this"* are
different clinical facts, and Dr. Chen reads the report to decide what to do next. It is one optional tap on
a deliberate surface.
**Consequence:** (a) adds one boolean to D2's column set and one clause to the report. (b) drops both.

### D5 — The GI extension arithmetic (CUL-367, now observed)

**Deciding:** whether `extensionDays('gi') = 14` survives, given that the worked case needs **two** taps
**two weeks apart** — and two more exposures of `This trial is done` — to honour a single vet instruction.
**Options:**
- **(a) Ratify as-is**, and let the new mid-trial sheet carry any non-preset length.
- **(b) Make the GI preset reach the clinically named total** (→ 84 where the current target is below it),
  mirroring what `+28` already does for skin's 8wk→12wk.
- (c) Raise GI to `+28` flat.
**Recommendation withheld — this is Dr. Chen's ratification, not the team's call** (CUL-367 has said so
since 2026-07-26; this spec supplies the observed case it was waiting for).
**Consequence:** (b)/(c) change one constant and its tests. (a) leans the whole GI path on D1's sheet,
which raises D1's priority.

### D6 — Where *Change the window* lives

**Deciding:** the door.
**Options:**
- **(a) Header `Manage` → two-row sheet — recommended.** Mock frame 3.
- (b) A second action on the card body, beside the existing ones.
- (c) A third row inside the existing Replace sheet.
**Why (a):** it resolves CUL-156's actual root — a header verb that promised an edit it could not perform —
and keeps the destructive act behind the same number of taps it has today. (b) puts a settings-shaped
control on an intelligence surface and competes with the card's own actions; (c) hides the safe act inside
the dangerous one's flow.
**Consequence:** (a) touches `trialManageVerb` / `trialManageLabel` and adds one sheet.

### D7 — The coverage gate that one tap can move (§5.4) — **new, and the most serious**

**Deciding:** what happens to the coverage denominator, and to `belowCoverageFloor` / `mayStateRecordClean`,
when the window moves. **This is already reachable today at the milestone; it is not created by this
feature, only multiplied by it.**
**Options:**
- **(a) Disclose it — recommended, and cheapest.** Wire `range.closedByOverrun` to the surfaces that state
  a coverage figure, which is what `lib/dietTrial.ts:2223` already claims happens. The field exists, is
  computed, is tested, and is read by nothing. The report's precedent sentence is written and shipping one
  block away (`allowedSetChangedAfterStart`), so this is a render, not a mechanism.
- (b) Freeze the coverage denominator at the original target (needs D2(a)/(b)), so no owner action can move
  a claim about the record.
- (c) Both: freeze the gate, disclose the window move.
- (d) Nothing. The gate stays movable and undisclosed.
**Why (a):** it closes the falsification — the number and its dependence become visible in the same breath
— at the cost of one wiring, and it pays off a guarded-comment debt (C-38) that predates this track. (b) is
more defensible in principle but changes a shipped clinical gate's arithmetic, which is its own adversarial
pass; (c) is the right eventual answer and the wrong v1 scope.
**Consequence:** (a) or (c) add a PR ahead of PR 3 and make D2 a hard prerequisite rather than a nicety.
**(d) knowingly ships a reassurance flip an owner can trigger with one tap** — and is called out here so
that ruling, if it is the ruling, is made rather than defaulted into.

---

## 7. PR plan — gated on D1–D4, D6 and D7

Five PRs, one per session, in this order. **Nothing here starts before the rulings**; PR 0 is the only one
that is ruling-independent.

| PR | What | Gated on |
|---|---|---|
| **0** | `guards/` + tests pinning today's behaviour: no mid-trial route to `trial_extend` in any state; the `nextTargetDays` clamp; §5.2's shortening render and §5.4's gate flip each as a **failing** test that documents the hazard | — |
| **1** | Migration: D2's columns, additive + nullable + backfill `target_duration_days_initial = target_duration_days` for the 1 live row. Own PR, Migration Safety Pre-flight, `rls-privacy-reviewer` | D2 |
| **1b** | **§5.4's repair** — D7's disclosure and/or freeze. Ahead of the door, because the door multiplies the defect | D7 (+ D2 if (b)/(c)) |
| **2** | The predicate + write path: `changeTrialWindow` beside `extendTrial` (one arithmetic home — `nextTargetDays` is not forked), the paired-null provenance contract, the local mirror, **the concurrent-extension LWW case (§5.6)** | D2, D3 |
| **3** | The door + the sheet: `Manage`, `TrialWindowSheet`, the `trial_refusal` re-point, `ChipGroup`, the end-date line, §4.3's forward line | D1, D3, D4, D6 |
| **4** | The vet report: §5.1's sentence, the attribution clause, **a `deno test` over `render.test.ts` with a mutated `targetDurationDays` (§5.6's untested half)**, `generate-report` redeploy (**note the standing deploy discipline — the function is at v15 and the ledger is `pending`**) | D2, D4, PR 1 |
| **5** | D5's constant, if ruled (a) is rejected | D5 (Dr. Chen) |

**Adversarial review is mandatory on PRs 1b, 2 and 4** — the write moves a denominator the vet report
renders, which is the clinically load-bearing class, and §5.4 is what happens when that is assumed rather
than executed. PR 4 additionally owes a `vet-report-cold-read` once rendered.

---

## 8. Acceptance criteria (draft — the QA persona's list)

1. On day 53 of 56, the trial card's header opens a sheet offering **Change the window**. *(TE-W)*
2. Choosing `12 weeks` writes `target_duration_days = 84` on the **same row**; `diet_trials` row count for
   the pet is unchanged. *(TE-1)*
3. The sheet shows the end date for every option, and the current window is present and marked. *(§4.2)*
4. A total at or below the current day cannot be submitted, and the refusal says why. *(§4.2)*
5. After the change the card reads `Day 53 of 84`; the off-diet count and **its** denominator are
   byte-identical to before. *(§5.3)*
5b. No window change can move `belowCoverageFloor` or `mayStateRecordClean` toward reassurance without
   either a disclosure beside the number or a frozen denominator, per D7 — asserted by driving the real
   `computeTrialFacts` over §5.4's fixture, never by re-deriving the rule in the test. *(TE-6, §5.4)*
6. Nothing anywhere prompts, badges or nudges the owner to extend. *(TE-5)*
7. No copy on any extension surface asserts the trial is working, failing, complete or on track. *(TE-7)*
8. The vet report names the original window and the day it moved; with the box unchecked, no clause
   attributes the change to anyone. *(§5.1)*
9. A shortened window can never render "Ran its course — the full window was completed" over a window that
   was shortened to fit. *(§5.2)*
10. Flag-off / D-ruled-out paths are byte-identical to today (C-36's absence-equivalence shape).

---

## 9. Persona positions on record

- **Dr. Chen (Veterinarian).** Supports, with D2 as the condition: *"A trial that was extended at eight
  weeks tells me the signs had not resolved at eight weeks. If the report shows me an 84-day window and
  nothing else, you have deleted the finding and handed me a number."* Also holds D5 open — ratification
  owed since 2026-07-26.
- **Sam (cat owner, the worked case).** *"My vet told me twelve weeks. I do not want to compute a delta
  against a day counter to tell the app that."* → TE-2, D1(a).
- **Jordan (diet-trial dog owner).** Warns against disturbing the milestone: the named-default one-tap is
  what stops her tapping `done` at day 56. → §4.4 leaves it alone.
- **Sr. Data Scientist.** Held, in draft 1, that the target is not a denominator for coverage or exposures
  and that this merely had to stay true. **Half of that was wrong, and the `adversarial-reviewer` broke it
  the same session** (§5.4): the target *is* the coverage denominator's bound on an un-ended overrun trial,
  and one tap moves a reassurance gate. The exposure half held. Position now: D7 is the condition, D2 is
  its prerequisite, and D3(a) still follows from §5.2.

  > **Adversarial review — DoD line.** *Executed a dog·gi 28-day trial logged 10/28 then daily to day 50 →
  > one tap of "Keep going — 2 more weeks" moves `belowCoverageFloor` true→false and `mayStateRecordClean`
  > false→true with **zero new evidence**, flipping the report from "too sparse to read as a clean
  > elimination" to "all 32 matched" ✗ **BROKE** (`lib/dietTrial.ts:2201-2206`); executed the backward move
  > 56→28 at day 28 → `stoppedReasonLine` prints "Ran its course — the full window was completed" ✗ **BROKE**
  > (`render.ts:3948`); executed the cat·gi default 42 against a vet's 84-day directive → ladder is
  > 42→67→81→95, **84 unreachable** ✗ **BROKE**; swept 1,280 degenerate inputs to `nextTargetDays` → 0
  > violations of "target > dayCounter" ✓ HELD; executed two off-diet feedings inside the clipped tail →
  > counts identical before and after the tap, §5.2's floor survives ✓ HELD.*
- **Sr. Product Designer.** Backs D6(a); requires §4.3's no-setback framing and that nothing added here can
  raise a prompt (Principles 3, 4). Notes the `trial_refusal` label becomes true for the first time.
- **Trust & Safety.** D2(a) adds no new reader, grant or surface; rides the existing pet-ownership cascade.
  The vet-directed boolean is an owner statement, not a clinical record — the report's attribution wording
  is the control.
- **Product Owner.** CUL-156 has sat at **Low** in the Legacy Backlog since 2026-08-15. The worked case is
  its falsification: the app's stated wedge user could not record the single most consequential instruction
  their vet gave them.

**No persona conflict was escalated.** The one genuine tension — Designer's "one door, honest verbs" against
the house preference for not growing the card's control surface — resolves inside D6 rather than above it.

---

## 10. Open, and deliberately not ruled here

- **CUL-267** — `TRIAL_OVERRUN_GRACE_DAYS = 56` ratification. An extension interacts with it (a longer
  window pushes the effective end out by the same amount) but does not change its question.
- **CUL-254** — the overrun card's missing sentence. A mid-trial door reduces how often an owner lands
  there; it does not fix the state.
- **CUL-107** — trial-milestone notifications. TE-5 constrains anything built there: a scheduled
  notification may say the window is up, never that it should be longer.
