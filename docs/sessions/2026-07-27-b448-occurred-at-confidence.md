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

Three suites, all mutation-verified:

- **`lib/utils.test.ts`** — `confidenceUpdateForEdit`, the gate itself. Deleting the `ownerAsserted` guard fails 2 tests.
- **`lib/updateEvent.test.ts`** — the real `updateEvent` against `node:sqlite`, built from `BASE_SCHEMA_SQL` plus initDb's own ALTERs so it can't drift from the real column set. NULL survives a note edit; a window keeps both bounds; an asserted reclassify still writes; stale bounds are cleared on a point. Restoring the always-write `?? null` fails 2 tests.
- **`lib/occurredAtConfidence.guard.test.ts`** — a source scan pinning all **11** files that hardcode a confidence literal, each with a written reason why its rows are genuinely witnessed. A new write path fails the build until someone justifies it; a stale entry fails too. Also asserts `estimated`/`window` are *never* hardcoded (a found-it classification is a claim only the owner can make) and that `edit-event.tsx` never reappears. The `detectionSoftDelete.test.ts` / `hydration.test.ts` idiom.

**Worth carrying forward:** the first version of the `updateEvent` test **passed under mutation**. It pinned the SQL layer while the actual defect lived in the screen's *decision* — restoring the buggy `?? null` left the headline assertion green, because NULL → NULL is fine when the caller passes nothing. That is what forced extracting the decision into a pure function. A green test that survives the bug it was written for is worse than no test: it converts an open question into a false answer. The mutation check is the only reason it was caught, and it took thirty seconds.

**The other reason the guard test exists:** B-448 is a *verification* task, and a verification task's answer rots. B-010 shipped correct; the leak was added later by a screen whose author was thinking about notes and photos, not about time. Answering "no path leaks" in a session record would have been true and useless within a month.

## Routed, not fixed

- **B-524** — five live `vomit` rows are `witnessed` on an `exif`-sourced time. Four were photographed seconds before logging, so the tag is honest. One was photographed **5h39m** earlier (shot 01:38, logged 07:17): the canonical B-010 discovery case rendered as `seen`. This is *not* a code leak — `log.tsx` takes confidence from the control, the owner had it on screen, and left it on the seeded default. It is a defaults question, and Principle 1 (zero decisions at moment of event) is exactly why the default exists, so it wants a Designer + Dr. Chen ruling rather than a unilateral change.
- **B-525** — one row sits at exactly `09:00:00` with `occurred_at_source = 'now'`. A `now` stamp is never round, so a picker edit didn't flip provenance to `manual`. Cosmetic today (nothing branches on `source`, and the confidence the report *does* render is correct), but the column exists to tell a witnessed-now log from a backfilled one.

## Gates

`tsc --noEmit` clean · jest **142 suites / 2721 tests** green (3 new suites, 59 cases) · both CI checks green on #492 · `adversarial-reviewer` run on the confidence logic (it feeds the vet report's confidence column, so the DoD makes it mandatory).
