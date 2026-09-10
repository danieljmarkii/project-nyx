# Noticed N-3 — the record (CUL-869)

**Date:** 2026-09-10 · **Branch:** `claude/look-record-history-display-uj9nxb` · **Outcome:** shipped via #822 (draft)
**Mode:** BUILD · **Milestone:** Noticed B · The record and the door (*Home v2 — the redesign*)

---

## Build phase

Not a Build-Sequence step — the sequence is complete end to end. **N-3** of the
Noticed run order (`docs/nyx-daily-look-requirements.md` v1.1 §10), the surfaces where
a look is *reviewed* rather than made. Gated on N-2 (#821, merged); unblocks N-4b
(CUL-873). Client-only, dark behind `daily_look`, no deploy, no schema.

## What was built

**The data path.** A look's `outcome` / `words` / `notes` reach every record surface
through a `LEFT JOIN looks` in `getTimeline` and `getEventById` (`lib/db.ts`) — the
`weight_checks` precedent, one line above it in the same SELECT. Both queries already
filter `e.deleted_at IS NULL` on the parent, so §9 rule 2 is **inherited** here rather
than restated: a reversed look cannot come back through them at all. `lib/looks.ts`'s
"the ONLY read of `looks` in the client" header was amended in the same commit rather
than left to decay — `loadLookDays` remains the only place a look is **grouped by day**,
which is the half that was load-bearing.

**One resolver.** `lib/lookDisplay.ts` — what History, the day spine, the drill-in and
the record screen all read a look through, so they cannot disagree about case or clock
(§12's *"one render for one record"*). Its two failure directions are deliberately
asymmetric and the module says why:

- a key the pet's own species list does not hold falls back to the **sibling list**.
  The ordinary cause is not a future build but an owner **correcting a pet's species
  after logging**, and dropping those words would erase what she recorded (HR-23: a key
  both species share is one key; the copy split lives in the label).
- a `check_in` with **no child row** is `kind: 'unknown'`, never `'absence'`. *"Nothing
  unusual"* is the one phrase in this feature that describes the **pet** rather than the
  owner's act, and it is never inferred from a missing row.

It also resolves `not_herself`, which `lookWord()` alone would drop — the opening chip
is storable but deliberately not in `LOOK_WORDS`, so a resolver built on that helper
would have silently erased the single most common one-word look.

**The surfaces.** History's row (*Noticed · off, didn't want the walk · 7:12*, with ❞
beside the hour when a note exists); the drill-in's detail; the spine's hollow mark,
routed through `nodeDotColors` so lane and spine cannot draw a look two ways; the record
screen's `check_in` branch (`components/event/LookRecordSection.tsx` — the words with
their glosses, the note with its cue, add / edit / remove); the editor's branch (the
word grid as labelled family blocks, the note on the child, the parent Notes field
gated off, `local_day` re-derived only when the point actually moves).

**`lib/lookSelection.ts`** holds T-14's energy-pole rule as its own module, so the Home
card (CUL-871) lifts it rather than restating it. Written narrowly on purpose: the
tempting generalisation is *"a positive clears the concerns"*, and it is wrong — a dog
can do the `full_walk` and be `lip_licking`. The tests pin the pairs it must **not**
govern as hard as the one it must.

## Decisions made

**Two departures from the issue's literal scope, both surfaced before coding.**

1. **`showLook` is not N-3's.** The bullet was conditional (*"if N-2 left a thin
   beat"*) and N-2 left none, deliberately: `guards/completionCard.test.ts` registers
   the `insertLook → showLook` rule with `firstCallerLands: CUL-871` and asserts
   **exactly zero** `insertLook` call sites. N-3 writes no look. The half that *is*
   N-3's — `NamedPayload.hasNote` and the card's confirm — landed here and is tested
   directly, since the alternative is a field arriving with its first caller and its
   behaviour never being checked at all.

2. **A second editor gate the issue does not name.** E-7 is right that `isWeight` /
   `isMedication` gate the *confidence control* and not Notes — and that cuts both
   ways: `showConfidenceControl` was **true** for a `check_in`, so the editor would
   have offered *Saw it / Found it* on a look, against §5.4 (witnessed by
   construction — there is nothing to find). Added as `&& !isLook` rather than by
   switching the expression to read `confidenceModel`: `cough` and `sneeze` carry the
   same model and **do** get that control today, so the tidier version would have
   changed two shipped types under an unrelated PR and broken this PR's own flag-off
   criterion.

**The absence is typeset quiet (provisional, PM confirmation wanted).** T-15 / L-16
rules *"a quiet entry is quiet: the absence renders in the sans, the secondary ink, a
size down"* for the Home **entry**; the record screen is not named. The first pass gave
it the display serif at head-word weight. Extended the rule here because the reason is
**stronger** on this screen, not weaker: the record is the artifact an owner turns
around to show a vet, and on an absence look that line is the only thing on it — so the
display face gives the feature's single most reassuring string the app's own headline
register. History already rendered it quiet, so one fact was reading two ways inside one
PR. Pinned by a test that also pins the contrast (an observed word **keeps** the serif).

**`main` was red, and the pre-push hook made it a hard blocker.**
`SignalZone.fold.test.tsx` pinned `stoodDownAt: '2026-09-03T12:00:00.000Z'`, and
`stoodDownExpired` measures that against the **real clock** with a seven-day TTL — so on
2026-09-10 the fixture aged out and the test began failing with no commit behind it.
CLAUDE.md § C-29's time axis verbatim, the CUL-831 shape in a second file. Because the
hook runs the suite, this stopped being *"widen the PR vs. flag it"* and became *"land
nothing vs. land a one-line base fix"*. Carried as its own commit; proven under a clock
shifted **+31 days** and **+400 days**, not by re-running today. CUL-886 holds the rest
of its scope.

## Review findings, and what they cost

Both mandated reviews returned real defects. This is the section worth reading.

**`code-reviewer` — one fix-before-merge bug, and it was the one this PR's own comment
claimed to prevent.** `pointMoved` compared `occurredAtIso !== occurredAtParam` as
**strings**. `occurredAtIso` is always JS-canonical (`…ssssZ`); `occurredAtParam` is
`events.occurred_at` verbatim out of local SQLite, and a row that has been through one
sync round-trip holds whatever PostgREST serialised — `…+00:00` (`lib/sync.ts:1121`
writes the server's value with no normalisation, and `parseTs`'s own comment in
`lib/hydration.ts` says these forms arrive). Same instant, different string; verified
empirically rather than taken on the reviewer's word.

So **every save of any previously-synced look** reported "the point moved" and
re-derived `local_day` against whatever zone the device is in *now* — silently moving an
owner's answered day the first time she opened an old record in another timezone, on the
one column every count in this feature is keyed to (T-19). `updateLookForEdit`'s own
no-op gate cannot catch it: in that case the recomputed day genuinely differs from the
stored one. Now compares instants, mirroring `parseTs`. **The reviewer's sharpest point
was about the tests, not the code** — no fixture used a non-canonical param, which is
exactly the shape that would have caught it. Added, and proven by reverting the fix and
watching precisely that test red.

The generalisable lesson: *a comment asserting a property is not a test of it.* The
gate carried three paragraphs explaining the timezone hazard it existed to prevent, and
implemented the hazard.

**`pm-feature-review` — NEEDS-WORK on four of eight flows.** Its blocking finds:

- **A look could be saved with every word cleared.** The outcome stayed `'observed'`,
  so `answeredDays` kept counting the day while the record had nothing to show for it —
  a day the owner answered, rendered as though she had answered nothing, feeding a
  denominator on Home, Patterns and the report. `insertLook` already forbade it; the
  edit path, the second door to the same row, did not. Now refused at both: the editor
  validates before any write (so time and note do not half-save) and names the way out
  (*"To take this one back instead, use Remove"*), and the helper holds the invariant.
- **The absence's typography** (above).
- **Three states said nothing where they owed a sentence** (Principle 5): a look whose
  child has not reached this device rendered a blank screen indistinguishable from a
  failed save; the editor on an absence row showed no words and no reason; the word grid
  had **no family labels at all**, so ~29 long chips read as an unsorted wall — the exact
  failure T-21 was written for, and an under-build against this issue's own *"the head
  words then the families"*. The grid is now labelled blocks in the owner's phrases
  (§3.1a: `Company` → *With you*, `Activity` → *What he/she/they did*, following the
  record's pet), families in the vocabulary's own order so the vet's ordering is
  inherited rather than restated.
- **The editor offered "Attach a photo"** on a `hasPhoto: false` type, and an attached
  photo would have rendered as the record's hero regardless of the flag. Closed for
  `check_in`; the wider gap (`cough` / `sneeze` share it) is CUL-887.
- **"This will remove the Noticed from history."** `check_in` is the first type whose
  label is not a noun. Fixed by naming the **subject** per type, so every other type's
  confirm is byte-identical — pinned in both directions.

Also taken: the note is quoted on both surfaces (T-22 — the marks are what say the words
are *hers*); History's Remove gained both the subject fix and the note-naming the record
screen and the completion card already had (it is the likeliest door to a week-old look
and was the one of three staying silent); the record screen's confirm is now composed
rather than chained, so a record carrying both a photo and a note cannot drop one fact —
the defect the card's own comment was written to prevent, reproduced one surface over.

## Persona flags raised

None escalated. Two calls were made under existing rules rather than referred:

- **Designer vs. the spec's silence on the record screen's absence typography.** T-15
  names the Home entry only. Resolved by the safety invariant rather than by a coin
  flip — a quiet day never earns headline weight, least of all on the vet-facing
  surface — and recorded as provisional for PM confirmation.
- **Engineer vs. the issue's `showLook` bullet.** Resolved on the guard's own text: the
  tripwire names CUL-871 as the first and only caller, so building it here would have
  reddened it.

## Open questions surfaced

- **CUL-885** — `lib/occurredAtConfidence.guard.test.ts` scans raw source with no
  comment blanking, so an explanatory *comment* about time confidence reds the build. A
  fourth C-18 instance and the worst-positioned: the only way to satisfy its own
  instruction (*"add the file to ALLOWED … Do not add it to quiet the test"*) is to
  allowlist the file, which is the one file the guard exists for. Reworded the comment;
  allowlisted nothing.
- **CUL-886** — `main`'s red test. One line landed here to unblock the push; the file's
  ~20 sibling `NOW` fixtures are the same latent shape and stay open.
- **CUL-887** — the editor's unconditional photo row across all three `hasPhoto: false`
  types.
- **The note cue is forward-looking.** *"Printed on the vet report you make · never on a
  shared link unless you choose it"* ships **verbatim as T-22 ruled it**, but Appendix G
  is N-6's and rides the held CUL-19 redeploy, and the public share link is deliberately
  unshipped. Harmless while the flag is off; **the `daily_look` GA must not precede
  N-6**. `pm-feature-review` additionally argues the second clause raises a worry rather
  than closing one, and that the fact which *is* true and load-bearing — the note is
  never read by a model, never by Ask, never counted — is the one left unsaid. A re-cut
  is a PM call on ruled copy, not a build fix; the brief is in the summary.
- **Should the record restate the question?** A week later the record says NOTICED /
  Sep 3 / 7:12 PM / *Off*. The comparative frame — *"compared with his usual"* — is
  nowhere, and it is the half a vet needs. PM call.
- Unchanged upstream: **CUL-864** brief 2 assumed (a); **CUL-845** untouched.

## Known issues / tech debt

- The editor's header still reads *"Edit Noticed"*. Left alone deliberately: it is a
  title, not a sentence, and it parses as editing the thing called Noticed. Flagged by
  `pm-feature-review`; a rename touches the shared `Edit ${config.label}` template.
- `sameWords` is order-insensitive, so a save that only **reorders** the same words does
  not persist the new order. Documented in the helper and signed off as a trade-off (the
  no-op gate is worth more than a reorder-only edit), but it is a real behaviour.
- The ❞ marker is look-only; a meal or vomit carrying `event.notes` shows none, though
  its expanded row prints one. Pre-existing inconsistency, widened in visibility by this
  PR's marker. Not filed — it is a one-affordance question for whoever next touches the
  History row.
- No device render. The word grid's labelled blocks and the record screen's two
  registers are the two things CUL-872's pass should look at first.

## PM action items

- **CUL-886** — `main` is red; one line landed in #822 to unblock the push, the file's
  remaining absolute-date fixtures are open. *(Urgent.)*
- **CUL-885** — the guard that reads comments as write paths.
- **CUL-887** — the editor's photo row on `hasPhoto: false` types.
- **Two rulings requested in this session's summary** (the note cue's re-cut; whether
  the record restates the question). Neither blocks N-4b.

No deploy, no migration, no secret.

## Recommended next steps

N-3 unblocks **N-4b (CUL-873)**. The lanes that were parallel after N-2 still are:

1. **N-4a (CUL-871)** — the Home card and the first `insertLook` caller (it lands
   `showLook` and deletes `firstCallerLands`). Gated on CUL-864 / CUL-865 edit 1 /
   CUL-863, all `Waiting on PM`, all assumed.
2. **N-6 (CUL-875)** — the vet report. Gated on CUL-865 edit 2; merges inert on CUL-19.
   **Its ordering now matters to GA**, not just to the report: the note's cue promises
   Appendix G.
3. **N-5 (CUL-874)** — Patterns. Gated on CUL-849.
4. **N-3b (CUL-870)** — the intake sheet. Starts when CUL-863 rules.

Ruling CUL-863 / CUL-864 / CUL-865 remains the single action that unblocks the most.

## Documentation updates

**CLAUDE.md** — no change. Nothing this session established a new convention; the two
guard findings are Linear issues against existing conventions (C-18, C-29), not new
rules.

**`/docs/` proposed edits (needs PM confirmation):**

- `docs/nyx-daily-look-requirements.md` **§3.1a / T-15** — record that L-16's "a quiet
  entry is quiet" was extended to the **record screen**, with the reason (the absence is
  alone on the vet-facing surface). Currently shipped as provisional.
- `docs/nyx-daily-look-requirements.md` **§3.1a (the note)** — record that the editor
  and the record screen both carry the note field, and that the grid's family labels
  apply to the editor as well as the Home card's unfold.
- `docs/nyx-daily-look-requirements.md` **§5.5** — add the two rows this build proved
  were needed: an edit may not empty an observed look, and `check_in` never offers the
  photo affordance.

**STATUS.md** — no change. No track started or ended; the Home v2 row already names
Noticed as the live build track and points at the project description for the run order.

**Project Brief (Claude.ai)** — no change needed.
