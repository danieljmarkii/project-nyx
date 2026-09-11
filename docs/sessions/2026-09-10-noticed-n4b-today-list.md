# Noticed N-4b — the today list, the receipts, the coverage footer, the withheld state and the note

**Date:** 2026-09-10 (CUL-873; shipped via #825)

> **Merge note.** A sibling session (the vet-visit companion, #818) landed on `main` while
> this branch was open and took `v1.39` in CLAUDE.md's version history first. Resolved on
> meaning rather than by keeping both: theirs keeps 1.39, this session's row became **1.40**,
> and `v1.37` was archived to keep three rows inline. Nothing else in either diff overlapped —
> their change is docs-only, under `docs/nyx-vet-visits-requirements.md` and `docs/research/`.

N-4a shipped the **asking** half of the Noticed card — the question, the chips, the unfold,
Done, and one entry for the completion register's five-second dwell. This session shipped
what an owner sees **afterwards, every day, forever**, and it shipped with the protection
§10 pairs it with rather than after it: a list that *persists* can draw *nothing unusual* on
Home under a pet whose record carries a live intake concern, so `lib/lookWithheld.ts` is in
the same change as the list it protects (floor item 12, Dr. Chen's reassurance-ledger row
15).

Four commits, all this session's, on `claude/nyx-today-list-card-nrijcu`. Three mandatory
reviews ran; two of them changed the build materially, and the adversarial pass returned
**FAIL** on the threshold the spec had put it there to rule.

---

## What shipped

**The today list** (`components/home/LookCard.tsx`) — the day's entries, newest first, each
with its hour and its `›` to the record; the newest carries *Undo* only while the register
says its beat is live, fading for the last half-second so the two controls never swap
silently under a reaching thumb. Two entries, the rest behind *N more today ›*, which opens
History on the look lens (Home holds a day, History holds the log). The question folds to
one line and re-opens the chips **cleared in place**, so a second Done is a second entry and
never an edit of the first.

**Receipts** — `lib/lookReceipts.ts`, pure. Derived at render from the record as it stands,
never stored and never latched, which is what makes an Undo of the first *Off* re-arm the
first-day form and a backdated earlier *Off* move the first day with no code knowing either
happened. Earned by symptom-class words only: the absence earns none because a run of quiet
days is the one thing no surface may count aloud, and an activity word earns none because
*first day Mochi has seemed lively* is a wellness receipt.

**The coverage footer** — `lib/lookCoverage.ts`. The ratio below full coverage · the window
alone at 28 of 28 · nothing below fourteen answered days · and nothing at all until the
window has moved past a withheld period.

**The withheld predicate** — `lib/lookWithheld.ts`. One predicate, four consumers, three
arms, each of them a positive fact the record *says* rather than something it fails to say.
Exporting `qualifyingIntakeMeals` (the review's E-5) also removed the decline calendar's
hand-inlined copy of that same filter, under a property test over the whole cross-product of
food type × rating × free-fed.

**`components/home/LookWithheldEntry.tsx`** — its own file, named in `guards/haptics.test.ts`
`ALWAYS_SCANNED` and proven by mutation. The split from `LookCard` is the enforcement, not
tidiness: the card ticks on every chip tap and must stay unscanned, so the half that renders
beside *Call your vet today* had to leave it.

**The note after the save** — `looks.notes` and never `events.notes`, which Ask's recall
fetch selects with no type filter; the T&S cue; and an Undo that confirms and names the note,
because a look is recreatable in three taps and the sentence she typed at 2am is not.

---

## Decisions

### Three spec gaps found at build, PM-ruled the same day

The build surfaced three things §3.3 had not settled. All three were put to the PM as
decision briefs and ruled — *"let's go w all the recommendations"*.

**1 · The first-day receipt's grammar.** The ruled line, *First day Mochi has seemed **off***,
makes the word a predicate adjective, and that only parses for about a third of the
vocabulary: *"has seemed accident indoors"*, *"has seemed eating grass"*, *"has seemed didn't
want the walk"*. The count form was never affected, because the word leads as a label there.
Ruled to the **label frame** §3.3 already carried on file, which is grammatical for all 54
heads and speaks the act in the same voice as the footer and the report. The per-word receipt
phrase (54 strings, a Dr. Chen + `nyx-voice` pass on the vocabulary) stays available as its
own PR; §3.3 already calls it a vocabulary change rather than the card's.

**2 · One receipt per entry.** `receiptsFor` returns them all so Patterns and the report may
rank differently; the card renders `leadReceipt` — the first-day form before the count form,
ties broken by the entry's own word order, which is the order she chose and the only ranking
the vocabulary does not invent, since it carries no severity.

**3 · The footer's memory of a withheld day.** T-16 holds the footer back until the window
has moved past the withheld days, but withholding is a *live* predicate — the intake finding
and the trial register cannot be re-derived for a day three weeks ago, and there is no
per-day column. A device-local per-pet mark of the last withheld day, the Signal fold's own
shape, wiped by name in `wipeLocalSession`. Its two holes are in the module header rather
than left to be discovered: a day the app was never opened on, and a wiped device. Both fail
toward the footer *returning*, never toward a wrong number.

### Two deliberate departures from the spec's literal text

**Arm 1 reads the local mirror, not the cached server row.** T-20 names it *"the server
`intake_decline` finding on screen"*; the build reads `getIntakeDecline` — the client mirror
whose `DECLINE` config mirrors `detection.ts` so the two "can never drift" — with the med
strip's own liveness predicate. Strictly more protective on three counts: it is **fresher**
(the server finding is a 24-hour-cached row, and T-20 itself names that staleness as the
weakness that made the record-local arm necessary); it works **offline** (`readSignalCache`
is a network read, and a card that quietly stopped protecting on a bad connection would fail
in the reassuring direction); and it is the **shipped precedent** for this exact question, so
Home's med strip and Home's Noticed card cannot disagree about the same pet.

**The recency bound is decoupled from `DECLINE.refusalRecencyDays`.** See the adversarial
ruling below — this one was forced by a measured break rather than chosen.

---

## What the reviews broke, and how

### `adversarial-reviewer` — FAIL, four breaks

T-20 made this pass the gate on the threshold: *"the threshold is provisional and the
adversarial gate rules it."* It ruled:

> **"2 of the last 3" — SOUND. Ships.** Unbroken in either direction the row cap owns:
> treats excluded, `some` excluded, one refusal followed by a full dinner inert, sparse
> raters unreachable, superseded refusals discarded.
>
> **"within 2 days" — NOT SOUND as the sole decay rule.**

The counterexample is the one worth remembering, because it is not exotic. *A cat with a
14-day twice-daily baseline of clean bowls refuses three meals in a row, and her owner —
reasonably — stops putting food down for an animal that has stopped eating. Forty-nine hours
after the last refusal, with no intervening evidence of any kind, the gate flips from
withheld to open.* Home then drew *Nothing unusual · 7:12* with a coverage count over a cat
three days into a hunger strike. Arm 1 carried the identical bound, so nothing else on the
card covered it: `detectIntakeDecline`'s trigger B skips a refusal older than the bound, and
its trigger A skips a day holding no rated meal.

`LOOK_REFUSAL_RECENCY_DAYS` is now **3**, from the pass's own 2/3/4/5/7 sweep, and it no
longer mirrors the detector's constant. **The two numbers answer different questions, which
is why sharing one was the error:** the detector's bound gates a *finding* — "escalate now" —
and a finding may reasonably go quiet as its evidence ages. This one gates a *suppression* —
"do not draw the reassuring thing" — and a suppression must outlast the clinical window it
protects. For a cat that window is hepatic lipidosis, measured in days.

At three, every counterexample the fourth pass used to **strike** the first draft's second
arm stays closed, at three and at every bound through seven: the once-a-week rater, the
fortnightly picky cat, the recovered cat whose refusals are superseded. And this is not the
struck arm returning — that arm fired on *ignorance*, a record with no refusal in it at all;
this one requires the newest qualifying meal on the record to *be* a refusal.

The other three:

- **The emergency door never took `intakeArm`.** My own module header claimed *"one predicate,
  four consumers"*, and the pass checked rather than believed: nothing outside
  `lib/lookWithheld.ts` imported it. The measured cost — a non-trial cat with two refused
  bowls had her card withhold its words while the door one tap away still printed *Not eating
  for a day* as an **unmet** conditional. The card and the door disagreeing about whether one
  animal is eating is the exact split "one predicate" exists to prevent. Wired, with the OR
  inside `withIntakeRefusal` (renamed — it is two registers now) and the arm evaluated at the
  call site, so the lean read module keeps its boundary (C-26) and the card still cannot
  compute the door's refusal differently from its own. **The card test's own mock was
  stubbing that fold to a passthrough**, which is why nothing on the file could see it.

- **The recency bound was unguarded.** Deleting it from the loader left **7,576 of 7,577**
  tests green, because the cadence test re-implemented the bound as a local `inBound()` helper
  and therefore proved a property of itself (C-18: a mutation that does not change behaviour
  has not tested the guard). `loadRecentQualifyingMeals` is now driven against a
  window-honouring DB stub, and every expectation derives from the shipped constant.

- **The footer returned *depressed* after a hospitalisation.** Suppressing only until the
  marked day left the window left the illness's *unanswered* days inside it, so an owner at
  28 of 28 who withheld on day −20, whose cat was in a clinic for a week she never opened the
  app during, and who resumed on day −12, got *Counted across the last 28 days* replaced by
  *Answered 22 of the last 28 days* — a number that fell because her cat was ill, which is
  precisely the reading T-16 exists to refuse. The window must now start at or after the
  first day she *answered* again. No new storage: the record already holds when she came back.

Everything else **held**: the reflex tapper at 28/28, the day-4 worried owner, a backdated
first *Off* on both sides of the record's start, ten same-day looks, the once-a-week rater,
the treat bag, picked-at-every-bowl, and twelve fail-open mutations.

### `pm-feature-review` — six real defects

Two of them were serious. **The withheld arrival shipped with no Undo**: Sam taps *Nothing
unusual* on Pixel, reads a wordless *Saved*, and had no way back — the only completion beat
in the app with neither a confirm nor a reversal, in the state most likely to be answered by
mistake. This state withholds the *words*; it was never the way back. And **a receipt could
be deleted from Home by the two-entry cap** — a receipt attaches to the day's earliest look
(§3.3 rule 5: "a good afternoon never removes a concern the card already said") and a
newest-first cap of two did that removal on the third look, on the day an owner answers three
times, which is the symptomatic day. The cap now governs the entries that earned nothing.

Also fixed: the withheld reason printed once per *entry*, so two quiet looks stacked the same
26-word paragraph verbatim; the entry line had lost its frame (a lowercase `off` beside a
capitalised `Noticed` in the identical slot, whose cold read was "off what?"); the note's cue
promised a vet report that prints no look notes; and the count receipt's floor was 7 while
the footer's was 14, so at nine answered days the card printed a denominator it refused to
print two lines below.

### `code-reviewer` — ship-ready, three cleanups

One Undo-fade constant instead of two coincidentally-equal ones; effects depending on the
primitives they read rather than the `activePet` object, which re-issued three reads on every
unrelated pet mutation; and one derivation of "does this row withhold its words" instead of
two guaranteed to agree today.

---

## Two things found while building, neither asked for

**`guards/homeWrites.test.ts` was blind to `updateLookNote`.** It tracked `updateEvent` under
its own sentence — *"UPDATES COUNT AS WRITES: an edit from a Home row is a Home write in
every sense D1 cares about"* — but not the `looks` child's edit doors, so this PR could have
added a Home control writing a synced table with CI green. Found by reading the guard rather
than the sentence about it (C-32), on the PR that became its first caller, which is the only
moment the omission is cheap. Both doors are tracked now and the allow-set names the note.

Its literal pin fired, which is exactly its job — *"widening it is a spec edit, and this makes
that edit visible in a diff."* The pin's comment now records why this is still **two** write
classes and not three, as the example for whoever widens it next: the classes are the med
confirm and the daily look; what grew is the list of helpers the look's own file may reach,
from one to two; the second writes the look's *own* row on the entry the owner just made; and
T-22 / R16 already ruled it. A widening that cannot say all three of those is a third class,
and a third class is a Tier-2 amendment.

**A TDZ TypeScript cannot see.** `visibleLooks` referenced `receiptTextFor` inside a `.filter`
callback before its `const` declaration. Clean typecheck — TS's use-before-declaration check
is syntactic and does not follow into a callback — and a guaranteed `ReferenceError` on the
first render.

---

## The cadence table (Data's, owed before the threshold is trusted)

The bound is applied to the rows **first** and the last three taken from what survives, which
is what makes the arm honestly unreachable for a sparse rater rather than permanently latched.

| Feeder | Qualifying meals inside the 3-day bound | Arm reachable? |
|---|---|---|
| 3× a day | 9 | yes |
| 2× a day | 6 | yes |
| 1× a day | 3 | yes |
| the cat whose owner stopped offering (3 refusals, then silence) | 3 | **yes — the break that moved the bound from 2 to 3** |
| once a week | 0 | no, by design |
| a bag of training treats | 0 | no — `qualifyingIntakeMeals` drops every treat before the arm sees it |

---

## Residuals, all filed

Six new issues rather than folded-in scope: **CUL-907** (the receipt frame collides with
"ticked off" on *off*, the vocabulary's most likely first word) · **CUL-908** (the coverage
number is shown only to owners who lapsed; the saturation form has no object) · **CUL-909**
(Q-6 re-opened — a persistent quiet row now sits under a non-intake safety card all day
rather than for five seconds, which is new exposure rather than a new argument) ·
**CUL-910** (the withheld state's app-internal vocabulary, and that it only speaks after she
has answered) · **CUL-911** (at saturation the count receipt prints the denominator the footer
refuses) · **CUL-912** (the first-day floor is a count with no density; unclassified foods
fire the arm while the sibling detector ignores them).

Notes on two existing issues: **CUL-875** (N-6 owes the note's cue its report clause back —
`guards/lookNotes.test.ts` binds the two in both directions, so the PR that lands Appendix G
is the PR that restores the clause or CI stops it) and **CUL-872** (the device pass gains
Home's density with the card *unanswered*, which the product read returned INSUFFICIENT on
and would not guess, plus the keyboard over the note field).

**Still provisional:** Q-13's fourteen answered days, now shared by the footer and the count
receipt. Q-16's cost accepted knowingly.

---

## Verification

`tsc --noEmit` clean. **349 suites / 7,596 tests** green, and green again under
`TZ=Pacific/Kiritimati` (UTC+14) — the CI matrix's extreme, and the one that would catch a
fixture anchored to a calendar literal in the rolling-window arithmetic (C-29).

Every fix in this session was **proven by mutation**: the guard red pre-fix, green post-fix.
That includes the two the adversarial pass found *because* no mutation had been run on them —
the recency bound and the `withheldNow` tri-state read, each of which survived the entire
suite before the repair.
