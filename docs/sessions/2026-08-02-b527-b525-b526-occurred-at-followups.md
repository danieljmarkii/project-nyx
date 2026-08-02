# B-527 / B-525 / B-526 — the three occurred_at follow-ups from the B-448 trace

**Date:** 2026-08-02

Closing the three routed findings the B-448 `occurred_at` trace left open (`docs/sessions/2026-07-27-b448-occurred-at-confidence.md` → "Routed, not fixed"). Two are code (shipped via **#566**), one is a data migration (shipped via **#565**, deliberately its own PR — schema isolation). The migration is **not applied to production** — that stays a PM action.

## B-527 — an unclassified event no longer borrows "Saw it happen" (#566)

An `occurred_at_confidence` NULL row rendered *identically* to a witnessed one on `app/edit-event.tsx`: the "Saw it happen" segment highlighted. The record holds no claim about how well the time is known (migration 012: NULL is "NOT a claim either way"), so the control was displaying a certainty the record does not have — and B-448 had already shown one tap on that already-highlighted segment turns the display into a stored `witnessed`.

B-527 named two honest fixes — a third visual state, or no segment selected. **Chose no segment selected.** It reuses the existing point row unchanged (the row itself asserts nothing — only the highlighted segment does), adds an honest line, and reads correctly as "unrecorded" without inventing a third control state.

Implementation, all in the pure/tested shape B-448 established for this control:
- **`reconstructTimeControl()`** (`lib/eventTimeEdit.ts`) — maps a stored row to a control seed. `witnessed → 'saw'`, `estimated → 'found'/around`, `window → 'found'/before|between`, and **`null → mode: null`** (neither segment). Pure, so the mapping is pinned by a test rather than by an effect nobody re-reads.
- `edit-event.tsx` now **seeds `timeMode` to `null`** (was `'saw'`) and applies the reconstruct for every case — so before the async reconstruct resolves the honest default is "we don't know yet", never a borrowed witnessed claim. `buildTimeFields`'s `timeMode === 'saw'` became `timeMode !== 'found'` so a null row resolves `occurred_at` to the plain point (the confidence stays inert — B-448's `confidenceTouched` gate never fires for a still-null row, because picking a segment leaves null).
- `TimeConfidenceField` accepts **`mode: TimeMode | null`**; the `saw`/null branch renders the same neutral, still-editable point row, and null adds *"Not recorded as seen or found — choose one if you'd like."* (nyx-voice ✓ — honest absence, forward, optional, no exclamation). `resolveTimeModeChange`'s `current` widened to `TimeMode | null`: a first tap from null is never a no-op, so it correctly asserts and classifies the row.

`log.tsx` is untouched in behaviour here — a fresh log is always classified (`timeMode` seeds `'saw'`), so it never passes null.

**B-524** (the log-screen *seed* default — a symptom photographed hours before logging, seeded `saw`) is the twin question and stays open; it's a Designer/Dr. Chen defaults call, out of scope here.

## B-525 — a picker edit no longer leaves `occurred_at_source = 'now'` (#566)

The point-time handlers flipped only `exif → manual`, so a picker edit on a `now`-sourced time kept `now` (the live proof: a `vomit` at a round `2026-05-30 09:00:00` whose source stayed `now`, created at 09:40). The column exists so the vet report / correlation engine can tell a witnessed-now log from an owner-backfilled one.

**`sourceAfterPointEdit(current, changed)`** (`lib/eventTimeEdit.ts`): any *value change* → `manual` whatever the prior source; a peek that changes nothing preserves the stored source (critically `exif`, whose attribution must not be dropped merely by opening the picker). It mirrors what `MealCompletionCard`/`MedicationCompletionCard` already do on a picker save. Applied to both `edit-event.tsx handlePointChange` and `log.tsx handleTimePickerChange` — the two older paths B-525 pointed at. The single historical live row is cosmetic (nothing branches on `source`) and left as-is.

## B-526 — the backfill, and a correction to its own premise (#565)

Migration `052` (authored as `050`; renumbered at wrap — a sibling landed `050`/`051` notification_preferences on `main` first, first-lands-keeps) backfills the NULL-confidence rows migration 012 deferred, but only the subset that is **witnessed by construction**: `event_type IN ('meal','medication','weight_check')`. Calling *those* `witnessed` is the truth, not the blanket `'witnessed'` migration 012 rejected (which would false-precise the ~65% of symptoms that are discovered) — the same reasoning in `lib/occurredAtConfidence.guard.test.ts`'s ALLOWED list and the B-448 review §77. Discovery-prone symptom rows are **left NULL** (they render `unspecified`) for the PM's per-row plan. Verified against live data: **146 NULL meals** in scope, **3 NULL live `vomit` rows** out of scope (the 149 total the B-448 record cites; +71 soft-deleted, excluded by `deleted_at IS NULL`).

**The finding that matters, and it corrects B-526's premise.** B-526 (from an `adversarial-reviewer` pass) claims a bare `UPDATE events SET occurred_at_confidence = …` that "does NOT bump `updated_at`" never reaches a device. The production schema contradicts this: `events` carries

```
trg_events_updated_at  BEFORE UPDATE … EXECUTE set_updated_at()
set_updated_at():  NEW.updated_at = NOW();   -- unconditional
```

so **any** UPDATE already moves `updated_at`. It is the *same* trigger that makes `hydrate`'s reconcile a server-time LWW (`lib/hydration.ts` header says so) — which the reviewer was reading when it filed the row. So a bare backfill does **not** silently fail on a normal run; the trigger propagates it. B-526's "a bare UPDATE never reaches a device" only holds if the trigger is bypassed (a bulk run under `session_replication_role='replica'` / `DISABLE TRIGGER`).

The work is not wasted: the backfill itself is still the right thing, and the migration keeps the explicit `updated_at = now()` as a **defensive backstop** for a triggers-suppressed run (and to make the propagation contract explicit at the call site rather than an invisible dependence on a trigger three dozen migrations away). The framing was corrected everywhere — the migration header, the test, the backlog row, the PR — rather than repeating the incorrect premise.

**The real residual, which the bump does not fix:** a device holding the row with an unsynced local edit (`synced = 0`) will, via push-before-pull, send its stale local NULL back up and re-bump `updated_at`, clobbering the backfill; and `hydrate`'s write is `WHERE events.synced = 1`, so that device also won't *receive* it on pull. That is what "run when devices are quiet" actually protects — not the bump.

**Test** — `lib/hydrateConfidenceBackfill.test.ts` (9 cases). `hydrateEvents` is an unexported I/O shell over the pure reconcile in `lib/hydration.ts`, so its pick-up decision is tested through those functions: a moved `updated_at` is picked up, an un-moved one is skipped by LWW *and* never re-pulled below the watermark floor. The write is tested against a real `node:sqlite` engine built from the genuine events schema (`BASE_SCHEMA_SQL` + the production `COLUMN_UPGRADES` path, B-398) running the verbatim hydrate upsert: it flips a `synced=1` NULL meal to `witnessed`, and it does **not** overwrite a `synced=0` row (the timing caveat). A drift guard scans the real `hydrateEvents` body so the replicated SQL can't silently diverge (the `detectionSoftDelete` idiom).

## Why two PRs

Schema isolation: the migration ships alone in **#565** (Migration Safety Pre-flight in its header; **not applied** — migration 012 assigned this backfill to the PM, and it's timing-sensitive). The B-527/B-525 code + all doc/backlog/STATUS updates ride in **#566**.

## Gates

`tsc` clean on both branches. Full jest green (#566: 4108; #565: 4102). New helpers mutation-checked (revert `reconstructTimeControl`'s null case to `'saw'`, or `sourceAfterPointEdit`'s guard to `=== 'exif'`, and the targeted test goes red). The B-448 guard + structural suites still pass on #566 — the refactor kept the write-gate invariant (5 `confidenceTouched` sites, the single gated `updateEvent` call). `code-reviewer` run on #566. No `adversarial-reviewer` on #565: the backfill touches only meal rows, which render no confidence tag on the report, so it changes nothing the report *says* about any patient — the clinically load-bearing surface (symptom confidence) is deliberately untouched. The PM reviews the migration before applying, which is the real gate for a prod data change.
