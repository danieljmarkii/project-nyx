# Vet visits VV-4 — the visit: "At the vet", "How did it go?", the saved moment, Edit

**Date:** 2026-09-11 · **Issue:** CUL-902 (+ CUL-945, closed inside it) · shipped via #836

---

## What shipped

The visit itself, behind the `vet_visits` rollout flag. Three screens and the model
behind them.

**"At the vet"** (`app/vet-visits/at-the-vet.tsx`, mock C1) — one plain-text field
debounced into `vet_appointments.notes_draft`, the prepared questions as ticks
(`questions[].asked_at`), and one door for the paperwork. No toolbar, no mic. The
draft flushes on the way out as well as on the timer, so backing out mid-sentence
costs nothing.

**"How did it go?"** (`app/vet-visits/after.tsx`, mocks D1 + D2) — a pushed route
hosting at most one `Modal`. Every field prefilled from the appointment; `pet_id`
from the appointment; saving with nothing typed allowed. The plan rows read the
record before they ask: an active course renders *Keep · Changed · Stopped*, a
running trial *Keep · Ended · Switched*, and *Add* appears only for something the
record does not hold. Then the saved moment, and *Done* lands on the visit as
written.

**Edit** (`app/vet-visits/edit.tsx`, D3's ⋯) — the visit's own fields. The plan is
deliberately not editable here: those rows are live links, and a course is corrected
on the course.

Flag-on, `app/vet-visit.tsx` returns a `<Redirect>` to the new capture, so the Pet
tab, the rundown's `log-visit` tile and any deep link all follow one gate.

## The four calls taken on the fly

Beyond the issue's *Decide on the fly* list, whose four defaults were all taken as
marked (pushed route · *Changed* opens the course edit · *Switched* = end + start in
one flow · a date picker seeded at +6 weeks).

**1. Flat routes with an `?appointment=` param**, not the issue's
`app/vet-visits/[id]/at-the-vet.tsx`. `app/vet-visits/[id].tsx` already owns that
segment for a **visit** id, and these two screens are about an **appointment** — two
entities under one dynamic name is a route that reads wrong from the URL up. The
after-visit screen must also work with no appointment at all, since it replaces
`app/vet-visit.tsx`, and an optional entity is a param rather than a path segment.

**2. The visit row is created on the FIRST PLAN ACTION, not at Save.** §5.1 is
explicit that a new course or trial carries its visit link in its own INSERT, "never
a follow-up UPDATE a crash can lose" — so *Add* needs a real visit id at the moment
`startRegimen` writes. This is not the phantom row §5.1 forbids: that one is a visit
minted to hold **typing**, with nobody having said the visit happened. Here the owner
has answered a question about what the vet decided, and if the app dies next the
visit is on the record with what they had entered rather than lost.

**3. The questions stay on the appointment**, read back through
`vet_appointments.vet_visit_id`. `vet_visits` has no column for them, and a copy
would be the second store §5.1 forbids for the photo. `readVetVisitDetail` gains one
indexed read rather than a duplicated column.

**4. The in-room paperwork pointer is a device-local one-key store**
(`lib/visitPaperwork.ts`, the `lib/signalFold.ts` shape, wiped by name in
`wipeLocalSession`). At C1 the visit row does not exist, so `vet_documents.vet_visit_id`
has nothing to point at; the link is made at the D1 save and something has to remember
which documents to link. It is honest as a device-local store precisely because it is a
CONVENIENCE and never the record — the document is already a real `vet_documents` row
under the right pet, and losing the pointer costs the automatic link, which the owner
can still set from the document's own detail screen.

A fifth, smaller one: **the visit's *Edit* is an inline header action, not the mock's
⋯**. `components/ui/Header`'s own rule (B-075, a PM call) is that a single secondary
action belongs inline rather than behind a tap-to-reveal menu. *Delete* is VV-6's and
gated on CUL-19; that is the PR where the pair becomes a menu.

## CUL-945, closed inside this build

Its three clauses, as the issue required:

- The link and `pet_id` come from **one source** — the appointment row, passed whole
  to `logVisitFromAppointment`, so a caller cannot supply a pet and an appointment
  that disagree.
- `startRegimen` and `startDietTrial` **refuse** a link that fails a local same-pet
  check, before they write anything. The blast radius is why: migration 067 raises
  `23514`, which is TERMINAL, so the first push quarantines the whole prescription —
  drug, dose, schedule, indication — while it goes on rendering locally on Home, the
  widget and the rundown.
- `repairRefusedVisitLinks` is the way **out**: it clears `vet_visit_id` on this pet's
  courses and trials that are BOTH quarantined on `23514` AND carrying a link this
  device cannot resolve, then re-arms them. Both conditions, and the first is what
  makes it safe — "the link does not resolve locally" is also true of a good link on a
  device that has not hydrated the visit yet.

## What the guards caught, and the one thing that stayed caught

**`guards/homeWrites.test.ts` reddened on the first `npm test`, and it was right.**
Importing the visit model from `startRegimen` (for the same-pet check) pulled
`lib/vetVisits.ts` into **Home's** transitive import closure — the guard's closure
walker follows type-only imports, and `lib/dietTrialCard.ts` reaches `dietTrialSetup`
through one. Three raw-SQL mutations suddenly sat inside the set it scans for a third
Home write class.

The fix was not a marker. Nothing in that file is a Home write; the CLOSURE was the
problem, so the check moved into `lib/vetVisitLink.ts` — one SELECT, no mutation,
small enough to sit in any bundle graph and narrow enough that its presence in one
says nothing about what that graph can write. C-33's rule arrived at from the other
side: scope by measurement.

Three guards gained one registered entry each, and the new routing rule was proven by
mutation rather than by reading it:

- `guards/completionCard.test.ts` — `logVisitFromAppointment` → `VisitSavedMoment`.
  The odd one out in that list (a component rather than a `momentStore` handle,
  because the moment is a full screen at the end of a flow), but the same rule: a
  write whose completion surface carries something the record cannot say on its own.
  `logVetVisit` is deliberately NOT registered beside it — it is also VV-2's
  one-sheet historic entry, where the list is the confirmation. **CUL-947** is whether
  that sheet should say the same thing.
- `guards/visitReaders.test.ts` — `lib/vetVisitLink.ts`, and the two write paths'
  reason strings updated to say they now read a visit (a boolean, never a value).
- `guards/vetVisitsFlagOff.test.tsx` — `app/vet-visit.tsx` in `DRAWS_ELSEWHERE_OK`:
  it reads the flag to REDIRECT and draws nothing flag-on.

## The defect this session found in its own diff

`busyRow` guards every plan handler, and it is **state** — so two presses landing in
one tick both read `null` and both proceed. Both then called `ensureVisit`, both found
`visitIdRef.current` null, and both created a visit. Two `vet_visits` rows for one
visit is the worst outcome this screen can produce: the appointment points at one of
them, the plan links split across both, and the report window anchors on whichever
sorts first.

Fixed with an in-flight **promise** in a ref, parked synchronously before the first
`await` so a caller one tick later finds it there rather than after it resolves, and
cleared in a `finally` so a failed create can be retried rather than re-awaited.
Driven by a test that presses two rows inside one `act`, and mutation-proven: removing
the guard reds it.

## The haptic that was wrong until it was read

The first cut fired `commitRoutine()` on the save, with a comment claiming it was
"a soft impact, never a success chime". It is not: `commitRoutine` plays the system
**SUCCESS notification** — it is the verb a meal or a dose uses, and the issue's
review line says the visit gets "a soft haptic from `lib/haptics.ts`, never a
success." A comment asserting what a helper does is a claim the build must check
(C-34), and this one was wrong in the direction the rule exists to stop.

Fixed with `commitVisit()`, its own verb rather than a second caller of
`commitSymptom`. Same value, different question (C-34): `commitSymptom` is soft
because the phone must not celebrate a worrying event; `commitVisit` is soft because
the owner has just come out of a vet's room, which is the one moment in this app
where congratulating them on tracking would land worst — whatever they were told in
there. The pinned export list in `lib/haptics.test.ts` goes from seven verbs to
eight, which is the pin working rather than loosening.

## VV-5 landed mid-session, and the two PRs had built the same thing twice

VV-5 (CUL-903, #835) merged onto `main` while this was in review — the lane this
session had called parallel-safe. It was, on files: no screen, no route and no test of
VV-5's was touched here. It was **not**, on the model: both PRs independently built a
model over `vet_appointments.questions`.

- VV-4: `VisitQuestion` · `parseQuestions` · `serializeQuestions`, and `questions` +
  `notes_draft` widened onto `LocalVetAppointment`.
- VV-5: `AppointmentQuestion` · `parseAppointmentQuestions` · `saveAppointmentQuestions`,
  with those two columns kept OFF the shared row type and on `AppointmentDetail`.

Keeping both would have shipped two parsers and two writers over one column — the
"second, staler home" VV-5's own header refuses, and the shape §5.1 forbids for the
photo. **VV-5's model won, and it had been written for this**: *"`asked_at` is VV-4's
— the tick in the exam room. Carried through this module untouched so an edit here can
never erase one."* So VV-4's question types were deleted and `setQuestionAsked` now
rides VV-5's reader and writer rather than a second UPDATE of its own, inheriting that
writer's entry bound, its zero-row throw and its quarantine-clearing write for free.

VV-5's narrow/wide split won too, for the reason it states: *"a column on the shared
row type that half the reads do not populate is a field every caller has to remember
is sometimes a lie."* `LocalVetAppointment` went back to narrow and `AppointmentDetail`
gained `notes_draft`; `readAppointmentById` replaced VV-4's `readAppointment`.

`AppointmentView` keeps **both** new fields, because they answer different questions
and the comment now says which: VV-5's five-day `resolveStripPhase` decides whether
Home CARRIES an appointment; VV-4's `isToday` decides whether the visit's own doors
are live. Naming that distinction in the type is the part worth keeping.

**The lesson worth generalising:** "parallel-safe" was assessed on FILES and the
collision was in the MODEL. Two PRs on one track, touching disjoint screens, can still
converge on one column from two directions — and the second one merged is the one that
discovers it. The check that would have caught it earlier is not a file-overlap scan
but a question: *what row does the other PR in this track write?*

## Reviews

- **`adversarial-reviewer` returned FAIL with three findings, all real, all fixed.**
  It drove the shipped code rather than reading it — `readVisitConsequence` against a
  real `node:sqlite` DB built from the app's own schema constants, the after-visit
  screen under RTL, and `resolveScope` extracted verbatim from
  `generate-report/report.ts` and compiled.

  1. **The report sentence was false for a future-dated visit, reachable in two taps.**
     `app/vet-visits/index.tsx` renders *How did it go?* for `home.next` with no date
     gate, and the after-visit screen seeded its date from `appt.scheduled_at` with no
     clamp — so an owner who books a six-week recheck, taps it and just saves wrote
     `visited_at` 42 days out **without opening the picker**. The moment then promised
     "From tomorrow, your vet report starts from this visit" while the real
     `resolveScope` returned `fallback_90d` for all 47 days. `maximumDate={new Date()}`
     sat one line below the seed and could not see it: it constrains a PICK, never a
     value already in state — which `BookVisitSheet` already writes down for its own
     mode transition. **VV-2 clamped the transition and VV-4 re-opened the hole at the
     seed.**

     Worse, the root cause was in the TYPE: `VisitConsequence` held two booleans for a
     three-state fact, and `isBeforeToday: false` conflated *dated today* (the claim is
     true tomorrow) with *dated after today* (it is not). The docblock said "the
     underlying fact has three [forms]"; it has four, and the test enumerated exactly
     the three that pass. Fixed both sides: `clampVisitDate` at both seeds, and
     `VisitDayRelation` so the copy cannot make the claim even if a future row arrives
     by sync. The Home line is gated too, and that half matters more: it would have been
     *literally true*, and the rundown would then have rendered
     `"No new foods or meds logged · Since Oct 28"` — an absence over a window that
     cannot contain anything, on the screen an owner reads in the exam room.

  2. **`repairRefusedVisitLinks` could clear a VALID link.** Its predicate matched
     `sync_error LIKE '23514:%'`, and **`23514` is `check_violation` — not a link code**.
     `medications` carries two more named CHECKs from migration 049, and
     `lib/medications.ts` says outright that the local mirror does not enforce the
     mutual-exclusion one, so a locally-representable row produces a non-link `23514`.
     Paired with the second arm (true for any visit a household's second phone has not
     hydrated), it destroyed real provenance, re-armed the row, and it re-quarantined on
     the actual constraint with the link unrecoverable. Now matched against the
     trigger's own sentence, which C-31 keeps safe to match: it names only `NEW.*`.

  3. **`Keep` relocated an earlier visit's provenance.** `linkCourseToVisit` wrote the
     column unconditionally, so confirming a course prescribed at March's visit moved
     the link to September's — and March's visit silently stopped listing Cerenia in its
     plan. The diff's own argument for *Stopped* ("`vet_visit_id` is where a course CAME
     FROM, and a course stopped here started somewhere else") was already the argument
     for this. Both link writers are now first-wins (`AND vet_visit_id IS NULL`) and
     return whether they wrote, so the moment's line says *still on it* rather than
     claiming a link it did not make.

  All three fixes were mutation-proven: reverting each one reds the test written for it.

- **`code-reviewer` returned fix-before-merge.** It reviewed the committed tree while
  the adversarial fixes were still in the working tree, so three of its findings are
  the same ones (the future-dated visit, the repair predicate, the haptic) and it
  confirmed the fixes independently. It found **one the adversarial pass did not**:

  **`handleSave` never joined the `busyRow` mutex that every plan handler takes.** It
  checked only `saving`, and the Save button was only ever disabled by `loading`. The
  in-flight promise closed the two-visits half, but the remaining half is real: the
  moment's `linked` list is built from the row handlers' own `note()` calls, so a Save
  landing before a row's write returned would show the owner a list missing that row's
  line. Save now takes the same mutex and the button shows it — a control that refuses
  behind the scenes and looks live reads as broken.

  It also pushed back on the reachability half of the future-date finding, and it was
  right that a clamp alone is not the whole answer: **the door itself was wrong.**
  "How did it go?" rendered for `home.next`, which reaches weeks into the future, and
  answering it marks the appointment attended — so a mis-tap on a six-week recheck
  CONSUMED the booking, with no way back before VV-6's delete (CUL-939). Both in-visit
  doors now render only on the appointment's own day (`AppointmentView.isToday`); a
  future appointment's door is *Get ready*, and that is VV-5's.

  Everything else it checked came back clean: AC 11's pet identity traced through every
  write path, the C-29/C-40 date handling, `logVisitFromAppointment`'s rollback, the
  `visitId`-before-Modal ordering, CUL-945's refuse-before-write, error copy (C-25),
  and the theme/ChipGroup/hitSlop pass.

  One note worth keeping about the Save-mutex test: it measures the BEHAVIOUR, not
  either layer. Removing the button's `disabled` or the handler's guard leaves it
  green, because each is sufficient alone; removing both reds it. That is the right
  shape for "this control is inert" — a test pinned to one layer would go red on a
  refactor that moved the gate — but it is surprising enough that the test says so.
- **`nyx-voice`** — two fixes. The draft-save failure alert said *"Not saving just
  now / Your notes are on screen. Try leaving and coming back"*, which names a weak
  recovery for a health note; it now says to copy the text somewhere safe first. And
  two `disabled` states were TRUE claims (the control exists and is busy) without a
  label saying why, which is the half of C-7 that is easy to skip — both now announce
  "Saving".
- **`clinical-guardrails`** — the saved moment asserts no wellness in any branch, and
  Pattern 8's discipline (the invariant is an assertion, never a comment) is now a
  test over every string it can emit. It also turned up one asserted claim: the new
  course's linked line said *"linked to this visit"* unconditionally. `startRegimen`
  throws when the link is refused, so it should be true — and "should" is the word
  CUL-825 exists to delete, so the line now asks the record.

## The mock frame this build deliberately contradicts

`docs/culprit-vet-visits-mockups.html`'s **D2 frame reads "Your next vet report starts
from today"**, and the spec bans exactly that string twice (§4.1 D2, AC 8/AC 9): the
report's rung 1 is strictly before today, so a report built in the car park still runs
to yesterday. The moment's copy is derived from the record in three branches instead —
the visit is the latest and dated today (the window moves **tomorrow**, and the line
says the same-day report still covers up to yesterday); the latest and dated earlier
(it is the anchor already); or behind one already on file, where it says **nothing**
about the report, because a hardcoded sentence there would be false.

The mock is stale on this one frame rather than wrong about the design; flagged for
the VV-6 finish pass.
