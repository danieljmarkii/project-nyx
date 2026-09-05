# Incident screen PR 2 — the read leads under the hero, observations grid + fold, the viewer caption (CUL-803)

**Date:** 2026-09-05

Shipped via **#806** (draft). Mode: BUILD. Also lands **CUL-660**. Second of the
three build sub-issues under **CUL-800**; follows **CUL-802** (#805, the route).

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
- **`app/event/[id].tsx`** — `{pet}'s record` (CUL-660) and the two-line
  `PhotoViewer` caption, both off the record's own row.

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

### 2. The strip names some and counts all, and the pairing is the thing tested

`observationStripLine` names the first three values and counts every row. That is
a partial enumeration beside a completeness count, which is the C-3 shape — honest
only while both halves draw on the same population. So the property, not the
example, is the test: six rows in, three named, six counted, and a blank value is
dropped from *both* halves rather than counted where it can never be named.

The rule was chosen because it reproduces the mock's line exactly (`Yellow, foamy,
bile · 4 findings` from four rows) with nothing keyed to measured width — a rule
that names "as many as fit" is a rule no test can pin.

**The residual, stated rather than closed:** with only a blood row present the
strip reads `What's visible · None visible · 1 finding` — a value whose referent
is dropped. It is bounded: the verdict card above never folds, and on that input
(two of three descriptive fields unreadable) the floor gives `not_enough_to_say`,
so the strip sits under "Not enough to say yet" and nothing reassuring is
asserted. Recorded on CUL-803 for a later pass to decide whether an absence
finding should carry its label into the strip.

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
the haptics `ALWAYS_SCANNED` addition. `code-reviewer` and `adversarial-reviewer`
both run — findings and dispositions on the PR.

## Follow-ups

- **CUL-804** (PR 3, the arrival) is next, sequenced after CUL-788 so `foldMotion`
  is one shared module. The rail and its tick are already the two constants it
  animates.
- The strip's absence-value residual, above.
