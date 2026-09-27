# TS-8 — Get ready answers the recheck

**Date:** 2026-09-27
**Issue:** CUL-1304 · project *Diet trial — its own screen*, milestone C · The doors, the safety face, the recheck
**Outcome:** shipped via #951, dark behind `trial_screen`. Flag-off, Get ready is byte-identical.

## What shipped

- **`lib/trialRecheck.ts`** (new, pure): projects the trial screen's own model (`buildTrialScreenModel`) onto Dr. Chen's recheck questions, in his order: by mouth · eating · symptoms · other meds · weight.
  - Every answer is quoted. The trial answers are the screen's lines. The medication and weight answers are the rundown's tiles, including the past-12-months courses with their dates.
  - A question with nothing to quote is left out.
  - Active trials only.
- **`lib/getReady.ts`**: with the gate live, the recheck row replaces the strip's row.
  - The weight row folds into the recheck row.
  - A trial row carrying a safety line joins the safety band above the cap.
  - A decline headline the list already states is not repeated.
  - The recheck's symptoms question drops only when a printed Signal `trial_response` row is the same snapshot as the device's counts.
- **`components/trialScreen/RecheckQuestions.tsx`** (new): the drawing, in the namespace. `WorthRaisingList` gains a `renderRecheck` slot, and a row carrying questions stops collapsing into one accessibility element.
- **`app/rundown.tsx`**: builds the screen model over the page's existing trial read, so no read is added.
  - It reads the gate through a ref, so a flag that hydrates later does not reload the page.
  - The drawing is keyed on the row, so a revocation mid-view keeps a built refusal row whole.
- **Guards:**
  - `trialScreenFlagOff`: Get ready is registered as a surface and a consumer.
  - `worthRaising`: the quoted recheck row is exempt from the preference screen, and its copy files are scanned.
  - Every new guard and fix was proven by mutation.
- **Docs:**
  - `docs/nyx-vet-visits-requirements.md` v1.2 (the T-3 edit, the four rulings, two build rules).
  - Trial-screen mock round 2 gains the Get ready frames, republished to the same URL.

## Decisions

- **PM, in session (2026-09-27), all four as recommended:**
  - D1: a question the record can't answer is left out.
  - D2: the weight is said once.
  - D3: active trials only; the finished-trial recheck is CUL-1340.
  - D4: gated behind `trial_screen`.
- **Build reading of D1, flagged to the PM:** the rundown's own record statements ("None active", "No weigh-ins logged") are quoted as answers. The ruling governs withheld or unrecorded answers.
- **Heading changed from the issue text:** "…chewable medicine included" was dropped, because the answer counts feedings only. The chewable lane is CUL-1342.

## What broke, and how

The adversarial reviewer failed the first build on four points and the corrections on one. The third pass returned PASS.

1. **"None active" over an in-trial antiemetic.** A dose-derived course is never an active regimen, so a falling vomiting count sat above "nothing else on". Fixed by quoting the past courses with their dates.
2. **Two vomiting comparisons on one page.** The strip's device sentence and the Signal's cached `trial_response` row could both print.
3. **A heading promising chewables** that its feedings-only answer could not hold.
4. **"None active" / "No weigh-ins logged" against ruling D1.** Resolved as the build reading above.
5. **The first fix for (2) broke S7.** Always keeping the Signal row let a stale falling cache replace a fresh rising device count. Now both stay unless they are provably one snapshot.

The code reviewer caught a whole-page reload when the gate hydrated after mount. It was fixed with a ref, and a flip test was added.

**Lesson:** a dedupe between two sources of one fact must ask whether they are the SAME fact, never which one is more authoritative. "Keep the engine's, it may be the escalating one" was one-sided, because the fresher source may be the escalating one too.

## DoD

- Types clean; full suite green (pre-push hook).
- Adversarial (the row states a vomiting count):
  - Biostatistician: tried a stale falling cache against a fresh rising device count → held after the fix; tried equal counts where only the device's density gate cut its comparison → held.
  - Dr. Chen: tried the antiemetic dog → held after the fix (Cerenia with its dates under "What else is Rex on?"); tried the refusing cat → held (vomiting withheld, the refusal leads above the cap).
- Persona sign-off: Designer ✓ (Principle 3 safety leads; the vomiting line stays at the strip's quiet size). Data ✓ (quote never recount; one population per sentence). Dr. Chen ✓ (the checklist order; the confounder visible). Engineer ✓ (flag-off byte-identical, no read added). QA ✓ (the TS-8 AC).

## Follow-ups

- CUL-1340: the recheck after the trial ends.
- CUL-1342: chewables under the by-mouth question.
- CUL-967: unchanged; the rundown tiles still duplicate Worth raising.
