# CUL-701 — the meal and dose cards stop stamping 'manual' on a peek-and-save

**Date:** 2026-08-29

Project: **Aug. 2026 Design Polish**. Shipped via #TBD.

## What was wrong

`MealCompletionCard.savePicker` and `MedicationCompletionCard.savePicker` both wrote
`occurred_at_source: 'manual'` unconditionally. Save is live the moment the
`TimeEditSheet` opens, so "tap Change time, look at the wheel, tap Save" — a gesture
that scrubs nothing and changes nothing on screen — flipped the column from the value
the app had stamped at insert to a claim that a **human chose** this timestamp.

Migration 007 defines `'now'` as *"was auto-stamped to `now()`"* and `'manual'` as an
owner's own choice. That distinction is what lets the vet report and the correlation
engine tell a witnessed-now log from an owner backfill, so the write was a
record-fidelity defect even though nothing rendered differently. It is the CUL-576
class read back off the column instead of into it, and it is precisely the defect
CUL-606's adversarial pass found on `NamedCompletionCard` — fixed there by routing
through `sourceAfterPointEdit`. These two cards never got the same treatment.

## The correction to the issue's premise

CUL-701 was filed noting the two cards were *not* the named card's case: their prior
source is `'now'`, so "nothing owner-authored is destroyed — the cost is a false
provenance claim rather than data loss."

**That holds for the dose card and not for the meal card.** `insertMedicationDose`
hardcodes `occurred_at_source 'now'` in its INSERT (`lib/medicationDose.ts:117`), so a
dose really can only ever be auto-stamped. But `insertMeal` takes the source as a
**parameter** (`lib/meals.ts:74`), and both photo paths fill it from a food photo's own
EXIF stamp:

- `app/log.tsx` `handlePickFood` → `source: usingExif ? 'exif' : 'now'`
- `app/food-capture.tsx` → `setMealOccurredAtSource('exif')` at lines 388 and 496

So a meal logged from a photo carried that photo's attribution, and a peek-and-save on
its completion card **destroyed it** — the same data loss the named card's fix exists to
prevent, on the surface meals actually use. The fix is unchanged by this; the severity
is not. Flagged to the PM rather than silently absorbed.

## What shipped

Both `savePicker`s now compute the source instead of asserting it:

```ts
const changed = next.getTime() !== new Date(payload.occurredAt).getTime();
const source = sourceAfterPointEdit(await getEventSource(payload.eventId), changed);
```

`sourceAfterPointEdit` returns `'manual'` only when `changed && current !== 'manual'`.
That makes all three completion cards, plus `app/log.tsx`, `app/edit-event.tsx` and
`components/log/SimpleEventConfirm.tsx`, one predicate — the diet-trial §5.3 rule
applied to provenance. No schema, no store change, no owner-visible change.

Two details worth the comment they carry in place:

- **The key is passed, never omitted.** `updateEvent` defaults a missing
  `occurred_at_source` to `'manual'` (`lib/db.ts:579`), so unlike `severity`, `notes`
  and `confidence` — all optional-by-omission — silence on this field is not neutral,
  it is an assertion. See the follow-up below.
- **Compared by instant, not by ISO text.** `getTime()` is the idiom the four other
  surfaces already use; a string compare works only while every payload's
  `occurredAt` is a canonical `toISOString()`, which is true today and is not a
  property any of them promises.

`lib/eventTimeEdit.ts`'s header had a sentence that this change made false — *"This
mirrors the completion cards, which write 'manual' on any picker save."* — replaced
with the now-true statement that every point-time edit in the app routes through it.

## Tests

Three new tests, mirroring `NamedCompletionCard.test.tsx`'s two-sided pin:

- meal — `preserves EXIF provenance on a peek-and-save` (the data-loss half)
- meal — `preserves an auto-stamped 'now' on a peek-and-save` (the false-claim half)
- dose — `preserves the auto-stamped 'now' on a peek-and-save`

Each also asserts `occurred_at` still reaches `updateEvent`, so a test cannot be
satisfied by a card that simply stops writing. The move half was already pinned by the
existing `writes the moved time, stamps manual, and re-asserts witnessed` in both
suites, and it still discriminates: with `getEventSource` mocked to a non-`'manual'`
value, an implementation that only ever preserved would fail it.

**Mutation-checked per the CUL-613 / CUL-621 rule**, not trusted for being green: all
three were written first and run against the unfixed source, where each failed on its
own `occurred_at_source` assertion (`Received: "manual"`). Then the fix, then green.

## Residuals

- **Filed:** `updateEvent`'s `occurred_at_source ?? 'manual'` default is the structural
  version of this bug — every other optional field on that signature preserves on
  omission and this one asserts, so a future caller that "only wants to move the time"
  gets `'manual'` for free. Changing it is its own decision (what should omission
  mean?), so it is a separate issue rather than folded in here.
- **Observed, not filed:** both cards still pass `severity: null, notes: null` on the
  time edit — the CUL-606 restatement shape. It is unreachable today (a card lives ~5s
  and neither meal nor dose capture writes a note), so it is a latent inconsistency
  rather than a defect, recorded here rather than turned into backlog noise.
