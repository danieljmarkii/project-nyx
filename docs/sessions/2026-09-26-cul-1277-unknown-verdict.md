# Before the 1.2.0 cut: a read verdict, or a status, this build does not know

**Date:** 2026-09-26 · **Branch:** `claude/nifty-allen-cq6bxm` · shipped via #936 · BUILD, CUL-1277 (Engines v3, Wave 0) · two PM rulings in session; one `code-reviewer` pass (ship-ready) and two `adversarial-reviewer` passes (the second on the fold-in)

## What shipped

Engines v3 (EN-3, CUL-1133) will add verdicts to the per-incident photo read, and a server flag cannot protect a phone that is already installed. On every shipped build an unknown verdict:
* rendered a **blank label on a rose card** on the record
* could fold its facts
* lost the CUL-812 rescue, which protected only the literal `worth_a_call`

Three server guards also protected only that literal. History, the month, Home's spine and the Signal gallery already failed toward the rose through `lib/readState.ts`.

* **One quiet list**, `lib/incidentVerdict.ts`, holding `monitor` and `not_enough_to_say`. Anything off it is an escalation. The module imports nothing and holds no owner copy, so `_shared/incident-analysis.ts` imports it without pulling client words into the Edge Function closure (C-26).
* **Record screen:**
  * `incidentVerdictLabel` gives the shipped words for the three known values and "Worth a call" for anything else (PM, option (a): the words every other surface already uses, no new string).
  * `escalating={isEscalationVerdict(rec)}` means the facts never fold.
  * The rescue, `IncidentReadCard`'s tone and `readState` all read the list.
  * The row type is text, so a map lookup cannot render blank again.
* **Server:** `shouldCollapsePartialRead`, `buildFailureWrite` and the cap path's existing-row check (extracted as the pure `isRealAnalysis`) move onto the list. The Pattern 10 free-text gates stay on the literal, pinned by a Deno test. Behaviour on the shipped three is identical, and the merge redeploys `analyze-vomit` and `analyze-stool`.
* **An unknown status too** (PM, option (a), folded in after the first adversarial pass):
  * The record sections read `status` as a denylist, so a quiet verdict on a status nobody has defined stood as a calm read while History said the photo was not read.
  * `FINISHED_READ_STATUSES` now lives in `lib/incidentReadState.ts`, and `readState` reads it from there.
  * `quietVerdictUnfinished` sends such a row to the frame a row with no verdict already takes.
* **`guards/unknownVerdict.test.tsx`** renders `call_now` and a value that can never be real on every client surface that reads the verdict. It has a status half with a finished-status control for every absence, and a discovery scan that reds on a new reader with no case.
* **`clinical-guardrails` Pattern 1** gains the rule: protect with the list, release on the literal.

## Decisions

| Ruling | By | What it settled |
|---|---|---|
| The label for an unknown verdict is "Worth a call" | PM, option (a) | No new string in the submission binary; the record names it as every other surface does |
| Fold the unknown-status fix into this PR | PM, option (a) | Same class, same files, same cut; a better-than-the-rule call against "file discovered scope separately" |
| Pattern 10 gates stay on the literal | Team default, stated in the plan | A gate that releases model words fails toward withholding; moving it onto "not quiet" would widen a leak |

## Falsification attempts

* **Dr. Chen / Biostatistician**, `adversarial-reviewer`, pass 1:
  * Tried `call_now` and a never-real value at every status, photoless, with facts, through a failed re-read and an owner Hide. Result: rose, "Worth a call", no fold, rescued. Held.
  * Moved each Pattern 10 gate onto the list: red. Held.
  * Confirmed the server is identical on the shipped three. Held.
  * Tried EN-3's `logged` plus a failed re-read of a replaced photo. The 1.2.0 build over-escalates with stale words. That is a false alarm, not reassurance, and became a binding condition on CUL-1133.
  * Tried a failed Re-run trigger over "Worth a call": **broke**, pre-existing. Filed as the sharper variant on CUL-827.
  * Tried an unknown status with `monitor`: **broke**. Folded in.
* **Pass 2**, on the fold-in:
  * A render comparison over 576 shipped combinations. Only a photoless `monitor` at a local `pending` changes, from a stale "Keep an eye out" to nothing. That is the safe direction, and it matches `readState`, where pending outranks calm.
  * A quiet verdict never stands on an unfinished status, and an escalation never takes the neutral frame. Held.
  * Remaining record and History differences are escalations at `capped` or `read_disabled` (unreachable from the shipped server; CUL-1326) and at a photo `pending` (CUL-827).
* **Mutation, 17 of 17 red:**
  * client: seven (label, fold, rescue, card tone, prototype lookup, the list gaining `call_now`, a planted reader)
  * status rule: five
  * server: five (three guards reverted to the literal, two Pattern 10 gates moved onto the list)
  * The reviewer re-ran nine more on a copy, plus six on the fold-in.

## Residuals

* **CUL-827** (High, pre-existing): a failed "Re-run analysis" leaves "Reading the photo…" over a live escalation until the owner leaves the screen. Not marked as gating the cut; that is the PM's call.
* **CUL-1326** (Low, new): the record's `capped` / `read_disabled` frames stand over an escalation. The shipped server never writes either state over one; the fix is one line per branch.
* **CUL-1133** carries the server sites that still know only the shipped three (sanitize and the floor, the status mapping, Ask's raw relay, the Postgres enum) and the binding condition above.

**Lesson:** a promise to an installed build is made per column, not per value. The issue named the verdict, and the same break sat one column over in `status`, which the record read as a denylist while every other surface read it as an allowlist. The discovery scan only covers the field it was written for; the second column was found by an adversarial reader asking what else can move (C-38's question, applied to a forward-compatibility promise).
