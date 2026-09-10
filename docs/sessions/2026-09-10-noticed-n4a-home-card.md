# Noticed N-4a — the Home card, the write, and the Home-write bound (CUL-871)

**Date:** 2026-09-10 · **Branch:** `claude/determined-carson-v0848o` · **Outcome:** shipped via #823 (draft)
**Mode:** BUILD · **Milestone:** Noticed C · The card (*Home v2 — the redesign*)
**Also ruled this session:** CUL-863, CUL-864, CUL-865 (the three `Waiting on PM` briefs)

---

## Build phase

Not a Build-Sequence step — the sequence is complete end to end. This is **N-4a** of the
Noticed run order (`docs/nyx-daily-look-requirements.md` §10), the card itself. N-0 → N-3
shipped over the previous three sessions (the flag, migration 064, the client mirror and
vocabulary, the record surfaces); N-4a is the first surface an owner touches, and the
first caller of `insertLook`.

## The rulings that came first

The session opened by putting all three gating briefs to the PM as decision briefs. Each
was ruled, recorded as a comment on its own issue, closed, and written into the spec
inline (v1.2) as **⚠ RULED 2026-09-10**.

**CUL-863 — the intake door: (a), SEQUENCED.** The recommendation on file was (a) "build
the sheet as its own PR *before* the card", which would have cost a session and delivered
the same two artifacts in the other order. The ruling keeps (a)'s destination and fixes
the order at the level that actually matters: **the chip ships with the sheet, in N-3b
(CUL-870), never ahead of it.** What that refuses is the fourth option nobody had written
down — shipping the chip now, pointed at today's picker "for now". That is not a
temporary compromise, it *is* the mis-record §4.5 exists to prevent: `handlePickFood`
writes the meal on the food pick with `intakeRating: null` and hands the arms to a card
that auto-dismisses, so an owner who came through a door labelled *Didn't eat* can leave
an ordinary meal row behind, which the intake-is-not-preference invariant then reads as
*she ate*. A dead chip is worse still. So this PR's first row holds two chips and is
built as a **list**, and N-3b's insertion is a one-line change.

**CUL-864 — both briefs as recommended.** The card is built against today's Home in the
slot after `MedStrip`; the spec is direction-independent by its own §1, so Home v2
re-places one card rather than the track waiting weeks on seven unruled design briefs.
And **an `other` pet gets no Noticed card, no Patterns card and no report line in v1** —
R1's "every account, always on" narrows *by species*, said in the spec rather than left
to an omission. `lookSpeciesOf` already returned `null` for `other` (N-2 built it that
way); it now has a ruling behind it instead of an assumption.

**CUL-865 — both Tier-2 edits approved.** Edit 1 is **written in this PR**, into
`docs/nyx-med-strip-requirements.md` §0.1 (now v1.1). Edit 2 (the report's Noticed line,
graph and Appendix G) is approved as drafted and applies when N-6 builds the render; the
recommendation to rule CUL-848 first stands as a sequencing note for that session, not a
condition on the approval.

## What was built

**The card** — `components/home/LookCard.tsx`. Three shapes: asking-compact (the
question, the two-chip first row, the seven head words, *Something else ›*, the hint),
asking-unfolded (the same card grown in place, the emergency door under the first row,
the way back above the families, the full grid at *head, gloss*), and answered (the day's
looks as entries, newest first, with the question folded to one line that re-opens the
chips cleared). It writes one `check_in` row and its child through the shipped
`insertLook` and nothing else.

**The chosen chip** — `components/home/LookChip.tsx` plus two theme tokens
(`colorAccentWashDeep` `#CDF5EC`, `colorAccentInkSelected` `#08685B`). The ink exists
because the deeper wash breaks the pair above it: `colorAccentInk` measures **4.40:1** on
it, under AA for the 13px label, where it clears 4.75:1 on `colorAccentLight`. Both
halves are pinned, the failing one included, so "simplify the selected chip back to
`colorAccentInk`" is a red build rather than a tidy-looking diff. Selection changes
colour and never geometry, by arithmetic: `PAD_LEFT` (14) = `PAD_LEFT_MARKED` (4) +
`CHECK_W` (7) + `CHECK_GAP` (3), the heavier hairline is an inset overlay so `borderWidth`
never moves, and the settle ring is transient and absolutely positioned outside the flow.

**The motion** — `components/motion/lookMotion.ts`. C-30 in the direction the rule was
written for: the second surface that needs the fold's choreography **lifts** it. Every
duration that also governs the Signal fold is imported (`UNFOLD_LAYOUT`, `FOLD_LAYOUT`,
`landDelayMs`, `landMs`, `driftPt`), so a tuning pass on the fold moves this card too.
Two hooks rather than one with a mode flag, because they defer different things: the
grid's disclosure is geometry (`LayoutAnimation`, one native transaction) and the arrival
is a mark being drawn (native-driver `Animated`).

**The emergency door** — `lib/lookEmergency.ts` (pure: the copy and the collapse) plus
`lib/lookEmergencyFacts.ts` (the read) and `components/home/LookEmergencySheet.tsx`. The
split is so the test that feeds it each condition never stands up a database. Its own
24-hour read rather than Home's `todayEvents`, because every threshold in §4.6 is written
in hours and a local-midnight window holds nine of them at 9 AM — the direction §4.6
exists to prevent.

**The pinned exits** — `components/home/LookExits.tsx`, drawn by Home as a second
absolute layer beside `PullToRefreshSky`, with the handles published through a new
`store/uiStore.ts`. They cannot live in the card: the card is inside the ScrollView, so
anything absolute in it scrolls away — the exact failure T-21 was written for. Each pins
only once its in-flow twin is out of reach, and the in-flow rows never leave the layout,
so nothing reflows as the owner scrolls. The FAB stands down while the grid is open,
because the Done bar and the FAB want the same corner.

**The write and the beat** — `showLook` in `store/momentStore.ts`: the first presentation
in that store that renders **no bottom card**. R14 puts the arrival inside the Noticed
card, so what the register contributes is the five-second dwell, the staleness guard, the
`removed` swap and the single route through `reverseLoggedEvent` (C-20/C-21).
`playCommitHaptic` gained one line — Done is silent (T-10).

**The selection rules** — appended to `lib/lookSelection.ts` beside T-14's pole rule,
because the Home card is the first surface where the absence chip and the words sit
together. `LookDraft` has one representation for "nothing chosen"; `draftToWrite` drops
the opening chip once a word follows it (§3.1a), and that is a rule about the WRITE — the
chip stays selected on the card, because nothing may move under the owner's thumb.

**The nudge** — `lib/lookCard.ts`'s `todayNudgeKind`, consumed by `TodayZone`. The empty
predicate now ignores `check_in` rows, so a day holding one look is still a day with
nothing logged in it; the nudge yields while the question is unanswered (the card one row
above is asking it) and comes back afterwards pointed at the bowl. Off the flag it is
byte-for-byte today's behaviour, and the same `lookCardLive` gate the card renders behind
decides whether there is a card to yield to.

**Guards.** `guards/homeWrites.test.ts` (new, below); `guards/completionCard.test.ts`
loses `firstCallerLands`; `guards/haptics.test.ts` gains the emergency door in
`ALWAYS_SCANNED` (proven by mutation — the door carries none of the marker strings and is
nonetheless the surface that prints *Call your vet today.*); `guards/blankComments.ts`
extracts the single-pass comment blanker out of `guards/lookNotes.test.ts` so a new guard
can import it without jest running that suite twice. `lib/occurredAtConfidence.guard.test.ts`
gains the card's optimistic mirror with its reason.

## Decisions made

**The Home-write bound is enforced by effect, and its SCOPE was decided by measurement.**
`guards/homeWrites.test.ts` computes Home's import closure and matches every write helper
the app has, plus raw SQL that mutates, against an allow-set pinned to exactly
`{ MedStrip → insertMedicationDose, LookCard → insertLook }` — helpers per file, never a
boolean, because the third adversarial pass named the hole a boolean leaves. The first
run also ran the raw-SQL detector over `lib/` and found **26 sites**, every one of them
sync fabric. Marking 26 of them `home-write-ok` would have been the
exemption-as-wallpaper failure, so the raw-SQL detector stops at the card tree while the
named-helper detector keeps the whole closure minus five definition modules. **An
exemption you have to apply twenty-six times is a scope error, not an exemption** — and
the way to find out which one you have is to run the detector before deciding. Recorded
as CLAUDE.md § Code Conventions **C-33**.

**One marker survived:** `store/momentStore.ts`'s `reverseLoggedEvent`, named as the
shared reversal C-20 exists to keep single — reachable from Home only through a card
already in the allow-set, and able only to remove a row the owner just made.

**The `firstCallerLands` tripwire fired exactly as designed (C-32, one session later).**
N-2 registered `insertLook → showLook` with the floor inverted to *exactly zero call
sites*, naming CUL-871. Wiring the card reddened it, which is what forced `showLook` to
be built in the same PR rather than noticed in review. The field is deleted with the
caller that invalidated it. It is the first measured instance of a guard that was
designed to delete itself, and it worked without anyone remembering it existed.

**Two departures from the issue's literal text, both smaller than the ruling above.**
(1) The emergency door reads the meal rows directly rather than `isAnimalNotEating`,
which requires a `TrialCardInput` most pets do not have — a door that escalated only for
trial pets would be worse; Home's own fail-closed trial answer is folded in as an OR
(`withTrialRefusal`), so a refusal either register can see is a refusal. (2) The door's
`ALWAYS_SCANNED` entry is added now rather than deferred to N-4b, since the door is the
half that escalates and its silence is the D7 row.

## Persona flags raised

None escalated. The one place the lenses pulled apart was the emergency door's
unanswered-facts window. The Designer's instinct was to render the thresholds and let the
imperative arrive when the read landed; Dr. Chen's rule refuses it — a conditional is the
reassuring-shaped half of that pair ("you can wait until tonight"), and an absence of
known facts is not evidence of a well animal. Resolved on the guardrail rather than by
preference: `facts: null` renders the imperative alone, and no thresholds beside it,
because we cannot say which of them are unmet either.

## Open questions surfaced

- **CUL-889** (`Waiting on PM`) — the emergency door cannot read the look's own words.
  T-5 keeps looks out of every read, so an owner who taps *Off* and opens the door reads
  a softer answer than her own record would give her. Filed with three shapes rather than
  bridged quietly; distinct from CUL-845, which is the write-side question and carries the
  opposite failure direction.
- **CUL-890** — the pinned exits are decided from the card's rect rather than each
  control's, so a very tall grid can pin the Done bar a beat early (two Done buttons on
  screen, both correct). The device pass says whether it matters.
- Unchanged upstream: **CUL-845** untouched; **CUL-883** / **CUL-884** still open from N-2.

## Known issues / tech debt

- The unfolded grid's height against a real screen is still the one thing no round could
  measure (spec §3.1a's build note). The device pass (CUL-872) is now unblocked.
- The arrival's ring is drawn as the shared 11 pt bordered node scaling and fading over
  the mock's 320 ms rather than an SVG stroke. Turning it into a path would fork the one
  geometry the card, the day lane and the spine share; the beat is what the owner reads.
- `guards/blankComments.ts` is now the importable reference CUL-884 asks the other three
  guards to lift. This PR does not touch them.

## PM action items

**None.** No deploy, no migration, no secret. **CUL-889** is filed `Waiting on PM` but
gates nothing — the door ships as-is.

## Recommended next steps

1. **The device pass (CUL-872)** — now unblocked, and it is the highest-value next hour:
   the grid's height, the doubled Done bar (CUL-890), and the hollow lane mark all need a
   real screen. The dev seed (`lib/lookDevSeed.ts`, N-2) fills a record for it.
2. **N-3b (CUL-870)** — the intake sheet **and** its chip, now that CUL-863 has ruled and
   N-4a has landed the row it inserts into.
3. **N-4b** — the note, the withheld state, and its `ALWAYS_SCANNED` entry.
4. **N-5 (CUL-874)** — Patterns, still gated on CUL-849.

**Parallel:** N-3b and N-4b both touch `LookCard.tsx`, so they should not run
concurrently. N-5 and N-6 are disjoint from both and from each other.

## Next session kickoff

**Recommended first prompt:**

> Pick up CUL-870 (Noticed N-3b) — the intake-first meal sheet AND its *Didn't eat ›*
> chip, which the PM's CUL-863 ruling moved into this issue. Read
> `docs/nyx-daily-look-requirements.md` §4.5 and §3.1a's router paragraph, and
> `components/home/LookCard.tsx`'s first row (N-4a built it as a list so the third chip
> inserts without a re-layout). The sheet writes the meal only when an arm is chosen,
> nothing is pre-selected, and closing it returns `'dismissed'` so the card keeps its
> selections.

**Alternates:**

- The device pass (CUL-872) on the whole Noticed surface, with the dev seed.
- Rule CUL-889 — whether the emergency door may read the look's own words.

## Documentation updates

**CLAUDE.md** — applied inline: § Code Conventions gains **C-33**; the daily-look
Read-These row records the three rulings; Version History gains v1.38 and archives v1.35
to `docs/CLAUDE-md-history.md`.

**`docs/engineering-lessons.md`** — applied inline: **§C-33**, the full account.

**`docs/nyx-med-strip-requirements.md`** — applied inline (**PM-approved on CUL-865, edit
1**): §0.1 gains the look's clause verbatim, the note on why neither existing clause
reached it, and the guard that bounds it. Header to v1.1.

**`docs/nyx-daily-look-requirements.md`** — applied inline (recording PM rulings, not new
scope): §1 gains the species narrowing and the slot; §3.1a and §4.5 carry CUL-863's
ruling; §3.2 records edit 1 as approved and written. Header to v1.2.

**STATUS.md** — no change. No track started or ended.
