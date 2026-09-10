# Noticed N-2 — the mirror and the vocabulary (CUL-868)

**Date:** 2026-09-10 · **Branch:** `claude/noticed-n2-looks-infrastructure-o1smay` · **Outcome:** shipped via #821 (draft)
**Mode:** BUILD · **Milestone:** Noticed A · Foundation (*Home v2 — the redesign*)

---

## Build phase

Not a Build-Sequence step — the sequence is complete end to end. This is **N-2** of the
Noticed run order (`docs/nyx-daily-look-requirements.md` v1.1 §10), the client half of
the daily look. N-1 (migration 064) was applied last session; N-2 is client-only, dark,
no deploy. It unblocks four disjoint lanes: N-3 (CUL-869), N-4a (CUL-871), N-5
(CUL-874), N-6 (CUL-875).

## What was built

**The mirror.** `looks` in `BASE_SCHEMA_SQL` (`lib/localSchema.ts`) with `words` as a
JSON-array string in a `TEXT` column (the `food_items_cache.proteins` precedent) and the
`synced / sync_attempts / sync_error` trio; `'looks'` in `LOCAL_WIPE_TABLES`
(`lib/hydration.ts`) **before** `'events'`; `{ table: 'looks', pendingSince:
'updated_at' }` in `SYNC_QUEUES` (`lib/syncQueue.ts`). Both registry entries proven by
mutation — dropped, watched red, restored, watched green.

**The sync.** `syncPendingLooks` / `drainLooksQueue` (`lib/sync.ts`) on the
`drainWeightChecksQueue` shape: `serializeQueuePush('looks', …)`, parent-gated on
`JOIN events e … WHERE e.synced = 1`, quarantine-filtered. `hydrateLooks` after
`hydrateEvents`, explicit column list, the `WHERE looks.synced = 1` LWW backstop, its own
watermark. `markSynced`'s guard column is `updated_at`, derived — not declared — from the
queue's `pendingSince` (`pushGuardColumn`).

**The write.** `lib/looks.ts` — `insertLook` on the `insertMeal` shape: one transaction
holding the `check_in` parent and its child, the queue push (events → looks), and
nothing else. The parent is `occurred_at_confidence: 'witnessed'` by construction,
`notes` NULL always. `local_day` is derived once via `localDayForLook` and **returned**,
so no caller re-derives its own. It also holds the four rules migration 064 deliberately
left to the write path: words non-empty iff `outcome = 'observed'`, every key in the
species' closed set, NULL never `''`, parent first.

**The day counts.** `loadLookDays` (the only read of `looks` in the client, so the
soft-delete join is stated once) plus `answeredDays` / `wordDays` / `absenceDays` /
`answeredVomitDays`, all keyed on the stored `local_day`. One module before there are two
consumers — the diet-trial §5.3 lesson applied preemptively.

**The vocabulary.** `constants/lookWords.ts` — cat 26, dog 28, seven head words per
species, `LOOK_VOCAB_VERSION = 1`. Each word carries head, gloss, group and direction
(`concern` / `positive`). `not_herself` is one key with three labels, `unknown` included.
`lookSpeciesOf` returns `null` for an `other` pet rather than defaulting to a species.

**The exclusion, made structural.** `EventTintCategory` gains `'look'`;
`eventTintCategory('check_in') === 'look'`; every consumer that branches on the category
is an exhaustive switch with **no `default:`** — each arm `continue`s or `return`s, so the
statement after narrows to `never` and `assertNeverCategory` binds it. `lib/daySummary.ts`
(`buildCountChips` refuses a look; `buildLeadLine` reads a `partitionByCategory` instead
of four `=== '…'` filters, and a look-only day gets its own lead), `lib/dayEvents.ts`
(`describeByCategory`), `lib/todayLane.ts`, `components/dashboard/DayEventsSheet.tsx`,
`components/recap/nodeTints.ts` (both Records, plus `nodeDotColors` for the hollow mark).

**The type and its doors.** `EVENT_TYPES.check_in` (label *Noticed*, family
`energyBehavior`, `hasPhoto: false`, `confidenceModel: 'witnessed'`, never flag-gated) —
excluded from **both** picker grids explicitly, and added to History's `TYPE_FILTER_KEYS`
so `/history?type=check_in` is N-5's doorway.

**Guards.** `guards/lookNotes.test.ts` (new): a look's `notes` at zero server reads
outside `generate-report`, keyed on the column rather than the table.
`constants/eventTypes.membership.test.ts`: a `check_in` column across all 19 rows plus two
new structural rows. `guards/completionCard.test.ts`: the `insertLook → showLook` rule.
`lib/occurredAtConfidence.guard.test.ts`: the two new write paths, with their reasons.

**The dev seed.** `lib/lookDevSeed.ts` — 18 answered days in a 21-day window (past the
fourteen-day floor, not saturated), a first *Off* nine days back, and a same-day pairing
with three vomit days, two of them lip-licking-marked. Written **through `insertLook`**,
so every seeded row is a row the app could have made. Hung on `globalThis` under `__DEV__`
from `app/_layout.tsx` — the debugger console, not a control on a shipped screen.

## Decisions made

**Q-3 — `panting_rest` stays a door row, not a dog chip (Dr. Chen, this session).** The
issue assigned the signature here because this is where the keys freeze. §4.9's gap-11
argument for withdrawing it — that the chip would propose `labored_breathing`'s dog arm —
**died with R10's strike of the symptom link**, and saying so mattered: the reason on file
was no longer the reason. The reason that survives is stronger. §4.6's dog *Call your vet
now* block already carries "breathing hard or struggling for breath, or panting while
lying still and cool". A chip at the same weight as `restless` is a **softer door to the
same sign** (T-6): it offers an owner a way to log-and-move-on where the record's own
answer is *call*. The dog list ships at 28. If a later revision signs a chip, it must
reconcile the two thresholds in the same pass — pinned by a test that names Q-3.

§4.2 / §4.3 / T-13 signed as written, with Q-7's already-ruled *Off* applied to
`subdued`'s head word on both species (the dog's gloss had to be re-derived from its video
test, since its old gloss *was* the new head word).

**Two departures from the issue's literal scope, both surfaced to the PM before coding and
both accepted.** They are the session's real finding and are recorded as CLAUDE.md
**§ Code Conventions C-32** (full account: `docs/engineering-lessons.md` §C-32):

1. **`constants/lookWords.ts` is NOT registered in `guards/symptomLists.test.ts`.**
   Registration is a *skip* in that guard's first test, so it would exempt the vocabulary
   from the one scan that must catch a symptom leaf appearing among the look words — and
   CUL-845's link is exactly that edit. Its sibling test also requires every registered
   file to *declare* a symptom-key list, which this one must never do. §4.7's premise
   ("both lists enumerate leaf keys") is false: none of the 55 words is a leaf. The
   guarantee landed as a membership-walk row plus full set-disjointness in both
   directions, over the shipped `SYMPTOM_TYPES` predicate as well as the literal list.

2. **The `insertLook → showLook` rule carries `firstCallerLands`.** The completion-card
   guard's floor test asserts at least one call site; N-2 ships the helper with none.
   Rather than defer the rule (a routing rule added after the first caller is a rule added
   after the bug) or build an unused `showLook` beat, the rule is registered now and the
   floor is **inverted**: exactly zero call sites, naming CUL-871. The first caller reds
   it, forcing the handle and the field's removal together. Self-deleting by construction.

**§5.1 row 1b, half moot.** The rule "a day with a symptom-class look word beside other
rows never says *Nothing logged as a symptom*" names a string that **does not exist**
anywhere in the tree. The lead line makes no absence claim, so there is none to suppress.
The other half — a lead that also names what she noticed — needs the child's `words`,
which `DaySummaryRow` does not carry; filed as CUL-883 rather than folded in. Third
measurement in three sessions of the v1.35 lesson.

## Persona flags raised

None escalated. The one place the lenses could have disagreed — whether a look earns a
mark on Home's day lane at all — resolved on the spec's own text (§5.1 #2: a hollow
neutral mark), and the Designer's constraint (C-5: geometry never changes) was met by
swapping fill and ring rather than adding a border, so the dot stays `NODE_DOT_SIZE`
across.

## Open questions surfaced

- **CUL-883** — §5.1 row 1b's positive half (the recap lead naming look words) needs a row
  shape that carries them. Low; a product question about recap density, not safety.
- **CUL-884** — three guards still blank comments with a chain of `.replace()`s, the exact
  C-18 anti-pattern; `guards/lookNotes.test.ts` ships the single-pass reference
  implementation to lift. Medium; guard integrity, no known live miss.
- Unchanged upstream: **CUL-864** brief 2 assumed (a) — an `other` pet has no vocabulary,
  and `lookSpeciesOf` returns `null` rather than guessing. **CUL-845** untouched; nothing
  here presumes an answer.

## Known issues / tech debt

- `describeDayEvent` renders a look as its bare label ("Noticed") with no detail — correct
  for N-2 (the words live on a child a `TimelineRow` does not carry) and the arm is left
  explicit so N-3 has an obvious home.
- The hollow lane mark ships without a device render. It is geometry-neutral, so the risk
  is legibility rather than layout; CUL-872's device pass sees it with the seed.
- `nodeDotColors` has one consumer (`DayLane`). The spine is N-3's, and the helper exists
  so the two cannot disagree when it lands.

## PM action items

**None.** No deploy, no migration, no secret, no decision blocked on the PM. The device
pass (CUL-872) still waits on N-4a, and the dev seed now exists for it.

## Recommended next steps

After N-2 the track fans out into **four independent lanes** — disjoint files, no shared
edits (`lib/looks.ts` is written here and only read afterwards):

1. **N-3 (CUL-869)** — the record: the History row, the day-spine mark, the `check_in`
   branches on `/event/[id]` and `/edit-event`, the note editor on `looks.notes`, "Change
   time" re-deriving `local_day`. Ready now; nothing gates it.
2. **N-4a (CUL-871)** — the Home card and the write. Gated on **CUL-864**, **CUL-865 edit
   1** and **CUL-863** (all `Waiting on PM`, all assumed). It is the PR that lands the
   first `insertLook` caller, so it also lands `showLook` and deletes `firstCallerLands`.
3. **N-6 (CUL-875)** — the vet report. Gated on CUL-865 edit 2; merges inert and rides the
   held CUL-19 redeploy.
4. **N-5 (CUL-874)** — Patterns. Still gated on **CUL-849 (L-17)**.

**N-3b (CUL-870)** remains independent of the whole lane and starts when CUL-863 rules.
Ruling CUL-863 / CUL-864 / CUL-865 is the single action that unblocks the most: it frees
N-4a, and N-4a frees the device pass and then N-4b.

## Next session kickoff

**Recommended first prompt:**

> Pick up CUL-869 (Noticed N-3 — the record). Read `docs/nyx-daily-look-requirements.md`
> §3.1a, §5.4 and T-22, and `lib/looks.ts` (N-2 shipped the write path and the day
> counts). Build the History row, the day-spine mark, and the `check_in` branches on
> `/event/[id]` and `/edit-event` — the note editor writes `looks.notes`, the parent's
> Notes field is gated off for a `check_in` (E-7), and "Change time" re-derives
> `local_day` through `localDayForLook` only when the point actually moves.

**Alternates:**

- Rule CUL-863 / CUL-864 / CUL-865 (the three `Waiting on PM` briefs) — one sitting
  unblocks N-4a and N-3b, and N-4a unblocks the device pass and N-4b.
- CUL-884 — lift `guards/lookNotes.test.ts`'s single-pass comment blanker into a shared
  helper and point the three chain-form guards at it, each proven by mutation.

**Parallel / efficiencies:** N-3 and N-6 can run concurrently with each other today
(history/event screens vs. the Edge Function — no shared files). N-4a and N-5 are ready
the moment their gates rule. `constants/theme.ts` gains its two tokens in N-4a only, and
`app/(tabs)/index.tsx` is N-4a's alone, so no collision is expected in any pairing.

## Documentation updates

**CLAUDE.md** — applied inline: § Code Conventions gains **C-32**; Version History gains
v1.37 and archives v1.34 to `docs/CLAUDE-md-history.md`.

**`docs/engineering-lessons.md`** — applied inline: **§C-32**, the full account.

**`/docs/` proposed edits (needs PM confirmation):**

- `docs/nyx-daily-look-requirements.md` **§4.3** — mark Q-3 resolved in the `panting_rest`
  row: it stays a door row; the reason on file (the proposal to `labored_breathing`'s dog
  arm) died with R10 and is replaced by the softer-door argument (T-6) against §4.6's
  existing dog emergency row.
- `docs/nyx-daily-look-requirements.md` **§4.7** — correct the premise. The look
  vocabulary enumerates no leaf keys, so it must NOT be registered in
  `guards/symptomLists.test.ts`; the membership walk carries the decision and pins full
  set-disjointness instead. (Reason in C-32.)
- `docs/nyx-daily-look-requirements.md` **§5.1 row 1b** — record that the
  *"Nothing logged as a symptom"* clause names a string that does not exist in the tree,
  and that the positive half is CUL-883.
- `docs/nyx-daily-look-requirements.md` **§11 Q-3** — mark resolved (2026-09-10).

**STATUS.md** — no change. No track started or ended; the Home v2 row already names
Noticed as the live build track and points at the project description for the run order.

**Project Brief (Claude.ai)** — no change needed.
