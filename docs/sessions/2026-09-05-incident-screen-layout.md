# Incident screen PR 2 — the read leads under the hero, observations grid + fold, the viewer caption (CUL-803)

**Date:** 2026-09-05

Shipped via **#806** (draft). Mode: BUILD. Second of the three build sub-issues
under **CUL-800**; follows **CUL-802** (#805, the route).

**It does not land CUL-660, and the spec was wrong to say it would** — see §4 below.

## What this was for

PR 1 landed a photographed vomit on its own record. The screen then had to earn
the trip: the read was a teal-bordered card three sections down a scroll, the
observations were a full-width label-left/value-right list that pushed a
four-finding read past the fold on a small phone, and the lightbox — the frame an
owner turns around to show a vet, which is the entire reason D3 kept the photo as
the hero — named nobody and no time.

## What shipped

Against `docs/nyx-incident-screen-requirements.md` §5 and mock round 2 (S-A, S-A2,
V1):

- **`components/event/IncidentReadCard.tsx`** — the rail-led read card. 3pt rail,
  `colorEventSymptom` on `worth_a_call` and `colorBorderStrong` otherwise; verdict
  in `colorEventSymptomInk` on the rose-light ground (C-1, 6.68:1); the disclaimer
  on the card; `Hide this note` where the shipped bare `✕` was. The pending state
  is the 16pt rail tick + whorl + "Reading the photo…" — the tick PR 3 grows into
  the rail, so the read arrives from a mark that was already standing there.
- **`components/event/ObservationGrid.tsx`** + **`observationStrip.ts`** — the
  two-column grid and the fold. `Keep it compact` collapses it to
  `What's visible · Yellow, foamy, bile · 4 findings`; the strip re-opens it.
- **`lib/observationFold.ts`** — the store, in `lib/signalFold.ts`'s shape: one
  key, epoch-guarded read-modify-write, sanitize-on-read, wiped by name in
  `wipeLocalSession`.
- **`app/event/[id].tsx`** — `{pet}'s record` and the two-line `PhotoViewer`
  caption, both off the record's own row.

## Three things worth keeping

### 1. Extracting the two components was a safety change, not only a tidy one

The vomit and stool sections were ~90% identical presentation. Sharing them is
obvious on maintenance grounds and doubly so on §7's: PR 3 hangs the arrival
motion off the rail, and a motion that must look the same on both surfaces
belongs where both render it.

**The part that was not obvious:** moving the rendering took the surface that
paints a `worth_a_call` *out of scope of `guards/haptics.test.ts`*. That guard
finds safety surfaces by a marker heuristic over source text — `event_ai_analysis`,
`safetyFlag`, `priorityClass` — and the two new components contain none of them.
A haptic added to `IncidentReadCard.tsx` would have fired on the escalation with
the guard green. Both files joined `ALWAYS_SCANNED`, proven by mutation.

The generalisation: **`ALWAYS_SCANNED` is not belt-and-braces for renames, it is
the list that survives a refactor that moves a safety render into a file the
heuristic has never heard of.** Any future extraction out of a scanned safety
surface owes the same check — the guard stays green through exactly the change
that removes its coverage.

### 1a. The adversarial pass returned FAIL, and four of its findings were the build's

Worth recording in full, because the pattern in them is more useful than any one:

- **The C-3 defect an example list could never catch.** A row's value can itself be a
  list — vomit `contents` joins its labels with ", " — and joining values with ", " on top
  of that flattened two nesting levels into one: four rows rendering
  `Yellow, foamy, bile, Foam, Hair · 4 findings`, five comma-separated items beside a
  count of four, with a casing seam as the only tell. Every example anyone writes by hand
  uses single-label values, which is exactly why the fix ships with a **property** (the
  commas in the named half are always `namedRows - 1`, over six value shapes) rather than
  another example.
- **The named slots go to the least clinical rows, by construction.** Every builder pushes
  the descriptive rows first, so on a full read Blood / Mucus / Foreign material are
  *always* the ones a fold compresses. On a `worth_a_call` that leaves the verdict on
  screen and every fact justifying it behind a tap — on the surface D3 exists for. The fix
  is not a clinical ranking (a second symptom predicate, forbidden) but the Signal fold's
  own DF-2 shape: **an escalation's facts do not fold.**
- **The design premise in my own comment was false.** I argued no re-open rule was needed
  because "the only thing that moves these facts is the owner editing them, and an owner
  editing is already looking at the open grid." `Re-run analysis` renders *in* the folded
  state — it is the control directly under the strip — and a re-analysis lands new
  observations into a folded grid. The verdict was never folded; the *fact* was. The fix
  is the fold spec's rule verbatim: the record re-opens a fold, the calendar never.
- **A grey rail is a positive claim.** `verdict === 'worth_a_call'` sent every unknown
  recommendation to the calm rail — absence of a *known* escalation rendered as calm, which
  is Pattern 1's failure mode wearing a colour. Now an allowlist: only `monitor` and
  `not_enough_to_say` may render grey, and anything else fails toward the rose.

**The generalisation:** three of those four are the same mistake — *a rule justified by an
argument about what can happen, where the counterexample is on the same screen.* The fold
control and `Re-run analysis` are eight points apart; the clinical rows are the ones the
row order guarantees get cut; the unknown verdict is one server deploy away. An adversarial
pass is worth its cost precisely because it reads the argument and then goes looking for
the thing standing next to it.

### 2. The strip names some and counts all, and the pairing is the thing tested

`observationStripLine` names the first three values and counts every row. That is
a partial enumeration beside a completeness count, which is the C-3 shape — honest
only while both halves draw on the same population. So the property, not the
example, is the test: six rows in, three named, six counted, and a blank value is
dropped from *both* halves rather than counted where it can never be named.

The rule was chosen because it reproduces the mock's line exactly (`Yellow, foamy,
bile · 4 findings` from four rows) with nothing keyed to measured width — a rule
that names "as many as fit" is a rule no test can pin.

**Two residuals, stated rather than closed.** With only a blood row present the
strip reads `What's visible · None visible · 1 finding` — a value whose referent
is dropped (`Unclear, unclear, unclear · 4 findings` is the same shape). And an
owner-corrected value renders identically to an AI one under the fold, since the
`Edited` markers go with the grid. Both are bounded by the escalation gate: the
case where either costs anything is a `worth_a_call`, which no longer folds at
all. Recorded for a later pass to decide whether an absence finding should carry
its label into the strip.

### 3. This fold is not the Signal's fold, and its hint had to say so

The Signal fold comes back on its own when the record changes; its control hint
says so. This one has no material-change rule at all, because the only thing that
moves an incident's observations is the owner editing them — and an owner editing
is already looking at the open grid. Borrowing the Signal's hint would have been
a promise the surface cannot keep, so the vocabulary is shared (`Keep it compact`)
and the hint is not.

The other half of that: **only the facts fold; the read never does.** An
escalation and its sentence are on screen at every fold state, which is what makes
folding a safety-adjacent surface defensible at all.

### 4. A spec sentence claimed to close an issue it had not read

§5.1 said the record-block line "lands CUL-660". I built it and attached the PR to
that issue before reading it. Both wrong:

- **CUL-660 settled the placement, and it is not this one.** The name goes in the
  **header bar**, on B-550's reasoning — the bar sits outside the `ScrollView`, so
  it survives the scroll and is still on screen *when the phone is turned around*.
  My line is inside the scroll. The two answer different questions: mine says whose
  record this is while you read it; the header says whose it is while you show it.
  The clinic hand-over is the whole reason that issue exists, and it is the half
  #806 does not touch.
- **It has an open R1 decision** (three header forms), its own mock and its own
  draft PR #784, plus a standing claim comment from that session. An open PR already
  referencing an issue is *work in review, not a claim* — the ritual says surface
  before touching it, and attaching a second PR to it was exactly the thing not to do.

**And the interesting part: #806 moves a premise of R1's argument.** That brief
chose pet-first word order on CUL-726's rule — which half yields to the ellipsis is
decided by how many times the surface states each half — because "the pet is stated
nowhere else on the screen." After this PR it is: the body names it too. The tally is
now tied, so the recommendation has to rest on the gesture (the turned-around phone,
where the body line is scrolled away) rather than on the count. A re-raised brief is
on the issue.

**The generalisation:** *a spec sentence asserting that one track closes another
track's issue is a claim about a document nobody in this session had opened.* The
incident spec's other cross-references were to its own frames and rulings and were
fine; this one reached across a track boundary, and reaching across is the case that
needs the other issue read first. CUL-803's §5.1a now carries the correction, in the
additive shape the frozen-doc rule prescribes — the original wording stays, with a
pointer to what corrects it.

## Copy

Every new string through `nyx-voice`. `Hide this note` is one string beyond §5.5's
enumerated list — taken from the design authority (S-A draws it) and it fixes an
unlabelled control; flagged on the PR rather than slipped in.

`{pet}'s record` renders **nothing** when the name will not resolve, rather than
falling back to `your pet`. Pattern 1's fallback governs a sentence with a hole in
it; this line is optional chrome whose only job is the name, and on a multi-pet
account "your pet's record" disambiguates nothing (C-9: correct-but-anonymous
beats confidently wrong).

The caption's confidence token comes off the stored `occurred_at_confidence`, not
off `describeOccurredAt`'s tag: a legacy row with no confidence reports the same
"exact" shape as a witnessed one, and labelling it `witnessed` would put a claim on
the photo nobody ever made (C-10).

## DoD

`tsc --noEmit` clean. 6771 tests pass, including under UTC+14 and UTC−10. Two new
guards proven by mutation (the fold store's clear epoch; the wipe assertion), plus
the haptics `ALWAYS_SCANNED` addition. `code-reviewer` and `adversarial-reviewer` both
run; the adversarial pass returned **FAIL** on the first cut and six of its findings
were fixed in-session (see 1a), two were filed as CUL-826 / CUL-827, and two are
recorded as bounded residuals above. Findings and dispositions on the PR.

## Follow-ups

- **CUL-660** is NOT closed by this. R1 is still the PM's, #784 is still its PR, and
  the premise change above is on the issue.

- **CUL-804** (PR 3, the arrival) is next, sequenced after CUL-788 so `foldMotion`
  is one shared module. The rail and its tick are already the two constants it
  animates.
- The two residuals above.
- **CUL-826** — `lib/signalFold.ts` carries the clear-epoch hole this module inherited
  and then fixed; the sibling still has it, and its comment says it does not.
- **CUL-827** — `Re-run analysis` over a live `worth_a_call` replaces the escalation with
  the pending frame. Pre-existing and the CUL-812 shape one status over; the fold makes
  that control more prominent, which is how it surfaced.
