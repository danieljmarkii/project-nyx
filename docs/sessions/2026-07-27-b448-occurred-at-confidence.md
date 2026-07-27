# B-448 — an edit was promoting unclassified times to "witnessed"

**Date:** 2026-07-27

Shipped via **#492**. Verification task that turned into a fix. No schema, no migration, no Edge Function change — nothing is deploy-gated on this.

## What B-448 asked

Both `vet-report-cold-read` passes on B-351 slice 5 flagged that every event in the reviewed report rendered `04:00 seen` / `05:00 seen` — bucketed round times tagged as *witnessed*. The row's own hypothesis was that this was a fixture artifact of the synthetic generator, and it was filed `Next`, *"likely a no-op"*. The ask: trace every write path that can default or infer `occurred_at` and confirm none leaves `occurred_at_confidence` at `witnessed`; check real production rows.

## The two answers

**The cold read's artifact was an artifact.** No production row matches the pattern. The only two round-time witnessed symptoms in live data are an owner-picked `09:00` (`other`) and `11:00` — both times a human typed into a picker, which is exactly what a round number should mean. That half of B-448 is closed clean.

**But the trace found a real leak, and not where the row was looking.** It was in the *edit* path, not a log path:

`lib/db.ts` `updateEvent` wrote all three B-010 columns on **every** UPDATE with `?? null`. `app/edit-event.tsx` seeds its Saw-it/Found-it toggle at `'saw'` (the reconstruct effect only *changes* it for a stored `estimated`/`window`). So saving any edit — a note, a photo, a food correction — on a row whose stored `occurred_at_confidence` was NULL wrote `'witnessed'`.

That is precisely the misrepresentation class the B-010 legend exists to prevent, and it runs in the reassuring direction. Migration 012's header states NULL is *"NOT a claim either way"* and that the PM would hand-populate rather than *"assert a blanket 'witnessed', which would bake in the false precision B-010 exists to remove."* `render.ts:3208` tags NULL as `unspecified` with a comment saying why: *"a bare time in a column of tagged rows reads as MORE certain than a witnessed one, the reassuring direction."* The edit screen quietly performed that blanket assertion one row at a time, on **149 live NULL-confidence rows**.

The same defect ran the other way too, and this one was worse in kind: the confidence reconstruct is an async `.then`, so a save that beat it would flatten a stored `estimated` or `window` — real information the owner supplied — down to `witnessed`.

**Not yet triggered in production.** Every live NULL-confidence row and every exif-witnessed symptom still has `updated_at == created_at`, so no row has been promoted. The fix is preventive and needs no backfill.

## The write-path inventory

All 12 client paths traced. **No Edge Function writes `events`** — all six functions that touch the table (`analyze-vomit`, `analyze-stool`, `ask`, `generate-signal`, `generate-report`, `_shared/incident-analysis`) are selects, verified line by line.

| Path | `occurred_at` | Verdict |
|---|---|---|
| `insertMeal` / `insertMedicationDose` / `insertWeightCheck` | caller | witnessed by construction — bowl / pill / scale |
| `captureInbox` ingest, `widgetCapture` REST | the **tap** time, preserved across the outbox hop | OK |
| `log.tsx` (symptoms) | the Saw-it/Found-it affordance | OK — owner-driven, never a literal |
| `log.tsx` (meal), `food-capture`, `medication-capture`, `FAB` | `now`, or an EXIF stamp the confirm screen shows and lets them change | OK |
| Meal / Medication completion cards | owner-picked, on a row already witnessed | OK — no-op restatement |
| **`edit-event.tsx`** | stored | **leaked — fixed** |

## The fix

**`updateEvent`'s confidence became optional-by-omission.** The three flat nullable columns collapsed into one `confidence: { value, earliest, latest }` unit; omit the key and they are left out of the SET clause entirely. This removes a footgun both completion cards had comments *working around* — each said, in so many words, *"updateEvent writes confidence on every UPDATE, so omitting it would silently wipe the row's confidence to NULL."* Two call sites documenting a hazard is the signal the API is wrong, not the callers. Bounds now travel with the value they belong to, which is what `chk_occurred_window_fields` requires anyway.

**`edit-event.tsx` writes a confidence only through the new pure `confidenceUpdateForEdit`** (`lib/utils.ts`), gated on a `confidenceTouched` ref set by the confidence-bearing handlers — the mode toggle, the found-mode, the estimated point, both window edges. The point-in-time picker deliberately does **not** set it: correcting *when* something happened is not a claim about how well the time is known. The point moves; the precision claim does not. The stored triple is also read back at save time rather than trusted from mount-time state, which closes the async race. This is the same discipline the dose `adherence` / `how_given` writes in that same file already follow — write the field the owner changed, never the ones they didn't.

For meal / weight / medication (no confidence control), the `'witnessed'` literal is now inert: with no control there is nothing to mark touched, so a legacy NULL row of those types keeps its NULL. That was a judgement call worth recording — the categorical argument says every meal *is* witnessed, so backfilling is harmless. It was rejected because migration 012 made the backfill an explicit PM decision, and doing it retail via an unrelated edit is the same blanket assertion, just slower.

## Tests, and the one that was worthless

Four suites, all mutation-verified (the fourth, `lib/eventTimeEdit.test.ts`, came out of the adversarial round below):

- **`lib/utils.test.ts`** — `confidenceUpdateForEdit`, the gate itself. Deleting the `ownerAsserted` guard fails 2 tests.
- **`lib/updateEvent.test.ts`** — the real `updateEvent` against `node:sqlite`, built from `BASE_SCHEMA_SQL` plus initDb's own ALTERs so it can't drift from the real column set. NULL survives a note edit; a window keeps both bounds; an asserted reclassify still writes; stale bounds are cleared on a point. Restoring the always-write `?? null` fails 2 tests.
- **`lib/occurredAtConfidence.guard.test.ts`** — a source scan pinning all **11** files that hardcode a confidence literal, each with a written reason why its rows are genuinely witnessed, plus **structural assertions on `app/edit-event.tsx`** — the second half was added after the adversarial round proved the scan alone had a hole exactly where the bug was. The `detectionSoftDelete.test.ts` / `hydration.test.ts` idiom.

**Worth carrying forward:** the first version of the `updateEvent` test **passed under mutation**. It pinned the SQL layer while the actual defect lived in the screen's *decision* — restoring the buggy `?? null` left the headline assertion green, because NULL → NULL is fine when the caller passes nothing. That is what forced extracting the decision into a pure function. A green test that survives the bug it was written for is worse than no test: it converts an open question into a false answer. The mutation check is the only reason it was caught, and it took thirty seconds.

**The other reason the guard test exists:** B-448 is a *verification* task, and a verification task's answer rots. B-010 shipped correct; the leak was added later by a screen whose author was thinking about notes and photos, not about time. Answering "no path leaks" in a session record would have been true and useless within a month.

## The adversarial pass failed it, twice over

`adversarial-reviewer` returned **FAIL** on the first cut, with two reachable counterexamples that were the same missing line — and a third finding about the tests that was sharper than either.

**A segmented control fires its handler on the segment that is already selected.** Neither screen checked.

1. **The worst one.** A row stored `estimated` at 04:10 reconstructs to mode `found` / sub-mode `around`, with "Found it" highlighted. Tap "Found it" — nothing visibly changes, because it was already on. But the enter-found branch fired anyway: sub-mode reset to `before`, latest edge reset to `new Date()`. The save then wrote confidence `window`, and because a window's `occurred_at` derives from its latest edge (012), **the event was re-dated to the moment of editing** — potentially by days. That value is the correlation engine's key and the Timeline's sort key. The owner saw nothing change.
2. **B-448 surviving its own fix, at a cost of one tap.** The reconstruct only reacts to a stored `estimated`/`window`, so a NULL row renders *identically* to a witnessed one: "Saw it happen", highlighted. The control was already displaying a claim the record did not hold, and one tap on that 44pt target turned the display into a stored `witnessed`. The fix had closed the zero-tap path and left the one-tap path open.

Both fixed by extracting the transitions into **`lib/eventTimeEdit.ts`** — `resolveTimeModeChange` / `resolveFoundModeChange`, with the rule that *re-selecting the current value is not a new claim*. `app/log.tsx` carried the identical bug (there it discarded an in-progress "between" window rather than a stored classification), so both screens now share the tested module instead of two copies of a handler.

**The third finding is the one worth remembering.** The guard test's regexes matched only *quoted literals* — but B-448's actual bug was a **variable**, `tf.confidence`. The reviewer reinstated the pre-fix write byte for byte and all three suites stayed green, under a header asserting the guard kept B-448's answer honest. The guard could not see the shape of the bug it was written for, and said so in the affirmative.

Widening the regex to match variables was tried and **reverted**: a regex cannot distinguish an assertion from a read-through (`row.occurred_at_confidence` mapped into a store object), a sync pass-through, or a type declaration, so it flagged `history.tsx`, `sync.ts` and `db.ts`'s own interfaces. Silencing those would have meant allowlisting `edit-event.tsx` too — exempting the one file the guard exists for. Replaced with **structural assertions on that file** in the `detectionSoftDelete` idiom: the single `updateEvent` call must pass confidence only through the gated spread, the value must come from `confidenceUpdateForEdit`, the touched gate must still be armed from exactly five controls, and both mode handlers must early-return on `noOp`.

All four of the reviewer's mutations now go red (M1, the byte-for-byte pre-fix shape, M2, and removal of the no-op guard); previously three of them were green.

**That is twice in one session** that a test looked like coverage and was not — first the `updateEvent` test pinning the wrong layer, then the guard test pinning the wrong *shape*. The common failure is writing the assertion against the fix you just made rather than against the bug as it actually occurred. The mutation run is what caught both, and it costs about a minute.

Two things the reviewer confirmed rather than broke, worth keeping: the `showConfidenceControl === false` branch's `'witnessed'` really is inert (five `confidenceTouched` sites, all reachable only through `TimeConfidenceField`), and preserving a legacy NULL on meals/weights/doses is the stronger call — `occurredCell` has exactly one call site, the symptom log, so those types never render a confidence tag at all and upgrading them would buy zero reader-visible honesty for a backfill keyed on who happened to edit a note.

## Routed, not fixed

- **B-524** — five live `vomit` rows are `witnessed` on an `exif`-sourced time. Four were photographed seconds before logging, so the tag is honest. One was photographed **5h39m** earlier (shot 01:38, logged 07:17): the canonical B-010 discovery case rendered as `seen`. This is *not* a code leak — `log.tsx` takes confidence from the control, the owner had it on screen, and left it on the seeded default. It is a defaults question, and Principle 1 (zero decisions at moment of event) is exactly why the default exists, so it wants a Designer + Dr. Chen ruling rather than a unilateral change.
- **B-525** — one row sits at exactly `09:00:00` with `occurred_at_source = 'now'`. A `now` stamp is never round, so a picker edit didn't flip provenance to `manual`. Cosmetic today (nothing branches on `source`, and the confidence the report *does* render is correct), but the column exists to tell a witnessed-now log from a backfilled one.
- **B-526** — the migration-012 backfill the PM still owes must set `updated_at = now()`. `hydrateEvents` reconciles LWW off an incremental watermark, so a bare `UPDATE events SET occurred_at_confidence = …` never reaches an already-hydrated device — and worse, the next on-device edit of that row pushes the stale local NULL back over it. Three comments in this diff now rest on that backfill being possible, so the trap is written down before anyone runs it.
- **B-527** — a NULL row renders identically to a witnessed one (Designer). B-448 fixed the write; the *display* still shows a certainty the record lacks. The honest fix is a third visual state or no selection, which is unusual enough to be a design call. Decide with B-524.
- **B-528** — a point edit made inside the sliver before the async reconstruct lands can write an `occurred_at` that isn't the window's latest edge, breaking 012's derivation invariant. Explicitly not a regression: pre-fix, that same race flattened the row to `witnessed`, which was worse.

**Still not covered, and named rather than papered over:** there is no test that *renders* `app/edit-event.tsx` and drives a save. The structural assertions kill the mutations we know about, but they assert source shape, not behaviour. A render test — seed a NULL row, save without touching the time, assert `updateEvent` was called with no `confidence` key, then the mirror on a stored `estimated` — would subsume all of them. It was scoped out here because the screen's mock surface (expo-router params, DateTimePicker, ImagePicker, supabase, SQLite) is large enough to be its own piece of work.

## Gates

`tsc --noEmit` clean · CI green on #492 · `adversarial-reviewer` **FAIL → fixed → all named mutations red** (it feeds the vet report's confidence column, so the DoD makes the pass mandatory; see the section above — a bare ✓ would have shipped two live defects).
