# After the visit PR-04: the trial's Extended on the plan row

**Date:** 2026-11-15
**One thing:** T6 L1 — The report: one stored number feeds the trial screen, the milestone and the report, so changing it once moves all three · check: pending

Shipped via #1545 ([CUL-2758](https://linear.app/projectnyx/issue/CUL-2758)). A dispatched BUILD row, plan-gated; the PM typed the go in the session.

## What shipped

- **Extended on the trial row** (§4.4 R6, mock §C). A running trial's chips are *Keep · Extended · Ended · Switched*. *Extended* opens an inline panel: *10 weeks · 12 weeks · Pick a date*, a live line naming the new and old end and saying it is recorded as the vet's call, then *Extend the trial*. Nothing is written before that press.
- **One write.** The press links the trial to the visit if unlinked, then calls `extendTrial({ vetDirected: true })`, which delegates to `changeTrialWindow`. The trial screen, the milestone and the vet report all read the stored window, so no reader was edited.
- **Totals, not deltas.** Every choice is the trial's whole length from its start. A recheck logged three weeks late still records what the vet said. A length the trial has already passed is absent, never dimmed.

## What broke, and how

The adversarial reviewer passed it on the first commit: a refusing cat stays led by the refusal, coverage stays frozen on the original window, all three write refusals leave nothing settled, and the date inverse round-trips in four non-UTC zones. The code reviewer found five UI defects, all fixed with tests: the spinner's opening day did not count as picked, Android had no way back to its date dialog, the button looked live while another row saved, a settled row could outlive its trial, and a choice the floor moved past stayed chosen. The provenance guard caught the after-visit screen as a new place that writes the vet's call; it is registered.

Filed, both parked and tagged neither: [CUL-2795](https://linear.app/projectnyx/issue/CUL-2795) (the report's *last moved* is the logging day) and [CUL-2796](https://linear.app/projectnyx/issue/CUL-2796) (a vet-directed change after an owner change reads as the vet asking for the whole span).

## Teach

**The report: one stored number feeds three surfaces, so changing it once moves all three** (T6, L1)

The trial's length lives in exactly one place: a single number on the trial's row. The trial screen counts days against it, the milestone asks "has the trial reached its end?" against it, and the vet report prints the window from it. None of the three keeps its own copy. So to make an extended trial count to its new end everywhere, this PR touched none of the three. It changed the number.

**Like:** a family calendar on the fridge. Move the dentist appointment on the fridge and everyone who checks the fridge sees the new day. Nobody has to be told separately, because nobody wrote it down anywhere else.

**In today's work:** `lib/dietTrialSetup.ts:1190`

```sql
SET target_duration_days = ?,
```

This is the line that moves the number on the fridge. The `?` is filled with the new total the owner chose, say 84 days. Every surface that reads `target_duration_days` sees 84 the next time it looks.

**Why it matters to you as PM:** when a spec says a fact must be right "everywhere", the first question is whether everywhere reads one stored value or keeps its own copy. One value is one change; copies are one change per surface, and the one somebody forgets is the bug.

**Check:** the report also prints the date the window *last moved*, which is stamped when the owner presses the button, not when the vet visit happened. An owner logs a recheck three weeks late. What date does the report show, and why can't a change to the report alone fix that?
