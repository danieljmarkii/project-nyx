# Out of beta PR-25b: a safety finding that reaches a focused Home is spoken (CUL-1566)

**Date:** 2026-10-04
**One thing:** none — dispatched session, not this round's teach row

Dispatched session (`/dispatch`, PR-25b). Mode BUILD. Shipped via #1065 on branch
`claude/out-of-beta-noticed-design-v2-history-v2-the-trial-screen-pr25b-10042110`.

## What shipped

GAP-13, now that PMD-21 is ruled (a). The PM ruled that "safety is silent" means no sound and
no haptic, not no speech. Before this PR, a safety finding reaching Home was never spoken: the
first-insight arrival withholds its tap and its sentence on safety, correctly, and nothing
replaced them. A single photo's verdict, meanwhile, was already spoken.

- `lib/signalSafetySpeech.ts` (new, pure) decides two things:
  - **Which findings speak:** the safety class, never a stand-down line, and never a concern
    whose ask the vet-knows state quieted.
  - **What is said:** the server's phrased sentence verbatim, in rank order. The pet's name
    leads only when no sentence already names the pet.
- `components/home/SignalZone.tsx` adds `useSafetyArrivalSpeech`. Per pet, it holds the set of
  safety identities the owner was told about or found standing when Home first read.
  - The first answered set seeds that set and says nothing.
  - A new identity in a later answered set is spoken once, through `rowSpeech.ts`'s
    `announceQueued`.
  - It speaks only when `useRowSpeech().mayAnnounce()` and `useAppActive()` both say Home is in
    front.
  - An arrival that lands while Home is not in front is not consumed. It is said once when Home
    is back.
  - Identities that leave the set are forgotten, so a concern that clears and fires again is a
    new arrival.
  - It reads the set the stack renders (`visibleFindings`). It adds no haptic and no live region.
- `app/(tabs)/index.tsx` wraps the zone in Home's existing `RowSpeechContext.Provider`.

## Review rounds

- **code-reviewer:** the comment and test claimed a finding that landed while Home was covered
  is never spoken later. Production cannot reach that state, because `useSignal` reads only on
  focus. Fixed by making "held, said on return" the rule and testing it at the moment of
  refocus. Also added a positive control for the haptic mock and the quieted → `raised_again`
  case.
- **adversarial-reviewer (FAIL, narrow).** No path spoke a reassurance, added a claim, or named
  the wrong pet. The failures were silent misses:
  - (b) Seen identities only grew, so a cat whose intake decline cleared and fired again was
    silent for the life of the process. **Fixed:** identities are pruned once an answered set
    drops them.
  - (d) A set that landed in the background was consumed silently. **Fixed:** an arrival
    waits, and `appActive` is a dependency.
  - (5) An ask that firms up under the same identity is not spoken. **Filed as CUL-1590** and
    stated as a scope line in the hook's header.
  - (6) Under Design v2 the spoken server count can trail a re-composed row count, though it
    is never higher. **Stated** in the lib header and folded into CUL-1590.

## Falsification (DoD adversarial line)

Dr. Chen / Data Scientist checks, with the outcome of each:
- **Pet switch**, with pet A's read landing late. No wrong-pet speech, because of the
  synchronous reset plus the cancelled closure. ✓
- **with_vet → raised_again.** Spoken. ✓
- **Spoken → with_vet → raised_again.** Spoken again (after the fix). ✓
- **Intake decline fires, clears and fires again** in one session. Spoken twice (after the
  fix). ✓
- **Regen while backgrounded.** Spoken on the return to the foreground (after the fix). ✓
- **Benign or stood-down arrival.** Silent. ✓
- **Added or softened words.** None: the sentence is verbatim, with only a name lead. ✓
- **Worsening soft → firm under one identity.** Not spoken. A stated scope line, CUL-1590. ✗

Mutation: 9 mutants of the hook (baseline, focus gate, foreground gate, consume-on-speak,
consume-while-unfocused, prune, safety filter, `answered` gate, per-pet reset) each red at
least one test.

## Residuals

- CUL-1590: an escalation inside one identity is not spoken.
- The rendered first-insight line is still its own copy round. A pointer comment is on that
  issue.
