# B-371 — symptom-aware "Add photo" empty-hero copy

**Date:** 2026-07-26

Small, self-contained copy fix on the event detail screen (`app/event/[id].tsx`), the last of the two fast-follows B-363 spun out.

## The gap

B-363 (#393) suppressed the dead AI-read frame on a photoless stool/vomit event — the right call, but it left the generic **"Add photo"** hero as the *only* remaining signal on those events. That hero never taught the thing that actually matters: for a symptom event the photo **is** the clinical artifact — colour, consistency, blood, mucus, foreign material — and without it there is nothing for the read to work from. Principle 5 wants an empty state to name what it's building toward, and this one named nothing.

## What shipped

New pure `addPhotoHeroCopy(eventType)` in `lib/eventPhoto.ts` — the sibling of `resolveEventPhotoDisplay`, in the module the hero already reads, so the copy decision is unit-testable without mounting the screen. Returns `{ action, hint }`:

- `action` is always `Add photo` — it labels the tap target, and the hero is a tap target on every event type.
- `hint` is the new second line, rendered muted and centred beneath the label, and is `null` on everything that doesn't earn it.

Copy:

| Event type | Hint |
|---|---|
| `vomit` | With a photo, I can read the colour, consistency, and whether there's blood. |
| `diarrhea`, `stool_normal` | With a photo, I can read the colour, consistency, and whether there's blood or mucus. |
| everything else | *(none — bare action label, unchanged)* |

## The scoping call

The backlog row said "symptom event types only", which reads as `SYMPTOM_TYPES`. That set is the wrong boundary in both directions, so the map is keyed on **which types have a shipped photo read** instead:

- `lethargy` and `itch` **are** in `SYMPTOM_TYPES` but no skin or behaviour analyzer exists. A line promising "I can read…" there is a promise the product cannot honour — worse than saying nothing.
- `stool_normal` is **not** in `SYMPTOM_TYPES` (no rose tint — it isn't a symptom) but it does route to `analyze-stool`, so it gets the hint.

The map's comment says to widen it when a sibling analyzer ships, not before. An honest itch/skin empty state is a separate question that needs a real read behind it.

## Clinical + voice bar

The hero sits one tap from the AI read on a symptom event, so it inherits that surface's bar, and `clinical-guardrails` Pattern 8 says the invariant is an assertion rather than a comment. The tests bar, on every hint string:

- the reassurance lexicon — including `normal` and `safe`, which a "check if it's normal" phrasing would have walked straight into;
- verdict language (`tell you if` / `confirm` / `diagnose` / `rule out`) — the read can legitimately come back `not_enough_to_say`, so the copy promises only what *can be looked at*, never an outcome;
- `!` (nyx-voice P4) and clinical jargon (`bristol`, `emesis`, `melena`, `mucoid` — P5: the Bristol number is a vet-facing detail, never the owner's framing).

First-person app voice ("I can read…") matches what already ships in `app/ask.tsx` and the `analyze-vomit` fallback read, so the hint sounds like the same speaker the owner is about to hear from.

## Verification

`tsc --noEmit` clean · 22 cases in `lib/eventPhoto.test.ts` (8 pre-existing B-207 + 14 new) · full suite **139 suites / 2656 tests** green. No schema, no secrets, no Edge Function, no deploy.

Shipped via #486.
