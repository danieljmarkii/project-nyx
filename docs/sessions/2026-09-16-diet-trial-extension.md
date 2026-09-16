# Diet-trial extension — the window a vet moves mid-trial

**Date:** 2026-09-16
**Mode:** DISCOVERY · **Issue:** CUL-156 (re-scoped, promoted) · **Also touched:** CUL-367
**Outcome:** spec + mock round 1, shipped via #865. Nothing built; six decisions on `Waiting on PM`.

---

## How it started

Not from a Linear issue. The PM came back from the vet: his cat is on day 53 of a 56-day elimination
trial, the vet has directed **twelve weeks**, and he could not find a way to say so in the app. He asked
for a check — *maybe I am wrong and it is there* — and, if it was not, for a spec.

He was not wrong. But the shape of the gap was not the shape either of us assumed at the start, in both
directions, so the first half of the session was verification rather than design.

## What the tree actually says

**The capability ships. The door does not.** `extendTrial` (`lib/dietTrialSetup.ts:743`) is a real,
working, tested write, with its arithmetic in `nextTargetDays` and a clamp that guarantees a target
strictly above the current day. B-417 PR 6 built all of it.

Then `stateFor` (`lib/dietTrialCard.ts:1169`) returns `milestone` only at `overrunDays === 0` and
`overrun` above it — and the three other routes to the decision sheet, on the `trial_refusal` and
`intake_decline` replacement cards (`:1576`, `:1619`, `:1789`), are each gated on `overrunDays >= 0` too.
So there is no mid-trial path in **any** state, including the two states whose whole subject is that the
trial may need to change.

That reframed the work. This is not a feature to build; it is a **door onto a capability that already
shipped**, which is why the PR plan is five PRs and not fifteen.

Three more things fell out of the verification, none of which were in CUL-156 as filed:

1. **The only mid-trial control does clinical damage.** The header's `Replace` ends the trial and starts a
   new one — the two-row split `extendTrial`'s own docstring exists to prevent, and the same reasoning
   that refused `paused` at A-2. An owner following the app's own affordance to honour a twelve-week
   instruction gets the worst available outcome.
2. **`target_duration_days` is overwritten in place.** So an 8-week trial extended on day 56 is
   byte-identical, everywhere including the vet report, to a 12-week trial started on day 1. *That the
   signs had not resolved at eight weeks* is a finding, and the extension is the evidence of it — and the
   record keeps none of it. The same table already ruled this question once for the protein
   (`target_protein_set_at`, TP-3), which is why D2's recommendation is the three columns rather than a
   child table.
3. **The worked trial is `indication = 'gi'`.** Read service-role, owner-scoped (C-27):
   `cat · started 2026-07-26 · target 56 · day 53`. So `extensionDays` returns **14**, one tap at the
   milestone lands on **70 days**, and twelve weeks takes **two taps two weeks apart** — each past a
   `This trial is done` button — while the note rendered directly beside that button already says
   *"for gut problems, diets are often continued for around three months."* That is CUL-367's filed
   arithmetic exactly, and it had been waiting since 2026-07-26 for an observed case.

## The finding that governs the spec

The one that was executed rather than argued. `render.ts:3948` computes the completed-trial line against
the **current** `target_duration_days`:

```
const short = t.targetDurationDays - t.trialDaysElapsed
if (short > 0) return `Marked complete at day … — ${short} days short of the ${…}-day window.`
return 'Ran its course — the full window was completed.'
```

A 56-day trial, shortened to 28 on day 28, then marked done: `short = 0`, and the report prints **"Ran its
course — the full window was completed."** An eight-week trial abandoned at four weeks, rendered to the
clinician as one that completed its full course, with nothing on the document to contradict it.

This matters because CUL-156 was filed as a *duration correction* gap, and a correction is directionally
symmetric. The extension is not: forward is ordinary, backward is a laundering path. So the spec's spine
splits them (TE-3), D3 recommends forward-only for v1, and the original-window record (D2) is what makes
the report safe whichever way D3 is ruled.

## What was produced

- **`docs/nyx-trial-extension-requirements.md`** v1.0 DRAFT — a seven-rule spine (TE-1…TE-7), the
  surfaces, the record and report work, six decision briefs, a five-PR plan, draft acceptance criteria,
  and the persona positions on record.
- **`docs/culprit-trial-extension-mockups.html`** round 1 — every option whose difference is *visual*
  drawn side by side, per the 2026-08-07 directive; current frames tagged, live alternatives in labelled
  option boxes, §0 the ledger. One frame is drawn **to be rejected** (the cheerful post-extension card):
  it is the obvious thing to write there, and TE-7 plus the voice rule forbid all three of its moves.
- **CUL-156** — re-titled, re-scoped, Low → High, `Waiting on PM`, with D1–D6 as its first comment.
- **CUL-367** — commented with the observed case; deliberately *not* advanced. The numbers are Dr. Chen's
  ratification, so D5 is the one brief in the set that carries **no recommendation**.

## Decisions taken in-session (not PM calls)

- **The milestone is not touched.** Its delta-denominated one-tap (`Keep going — N more weeks`) is correct
  *there*: the owner has not been handed a number, and Jordan's review said the named default is what
  stops her tapping `done` at day 56. Totals are for the mid-trial sheet, where the owner *has* been
  handed a number. Two moments, two registers, one write.
- **No attachment on either Linear issue.** An attachment is a commitment that merging the PR finishes the
  issue (CUL-803, measured), and merging this finishes neither.
- **No CLAUDE.md Read-These row.** `guards/claudeMdBudget.test.ts` makes an addition there cost a
  deletion, and a DRAFT spec with six open decisions and nothing buildable has not earned one. The row
  lands when the rulings do.

## What is still out

The `adversarial-reviewer` pass on the shipped extension logic was dispatched and its findings are folded
in where they landed before the push; anything arriving after is an amendment to the spec, not a new
document.

## For the next session

**PR 0 is the only ruling-independent piece** and can start immediately: guards pinning today's behaviour —
no mid-trial route to `trial_extend` in any state, the `nextTargetDays` clamp, and §5.2's shortening render
as a *failing* test that documents the hazard. Everything else waits on D1–D6.
