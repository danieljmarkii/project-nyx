# Engines v3 PR-27: one tier-word map feeding every surface

**Date:** 2026-09-29/30

EN-3's client half (CUL-1133), shipped via #989. Client only, no Supabase migration. A local SQLite column was added (`event_ai_verdicts.tier`). It is dark by data: nothing writes a tier or the `engines_v3_en3` stamp until CUL-1407 seeds the key, so every row on every phone still draws today's words.

## What shipped

- **`lib/incidentTierWords.ts`, the map.** Every owner-facing word for a read, plus one resolver, `tierDisplayOf`:
  - It reads the louder of `tier` and `recommendation`.
  - Status comes ahead of tier. A call stands at any status; a quiet tier stands only on a finished read (the PR-26 F6 handoff).
  - The rule-version stamp alone decides new-rule words (spec §1). An earlier-rule row keeps the shipped words to the byte.
  - A value this build does not know is spoken as "Worth a call".
  - The lowest tier is "Keep an eye out". Call now is the filled rose; call today is the rose outline.
- **The phone's copy** mirrors `tier`. It lives in the schema constant and `COLUMN_UPGRADES`, and the watermark moved to `event_ai_verdicts:v3`, so every phone re-pulls once. At the same version, a NULL tier is filled once and never cleared.
- **Surfaces on the map:**
  - the record card (vomit, stool): label, tone, the call-now action line, and the landing announcement;
  - `readVerdictOf.display`;
  - the History / Home spine row: the short chip on screen, the full phrase spoken;
  - the Signal gallery tiles: the bout's louder call, by the month's `louderCall`;
  - the month: day paint, "read as" text, and a legend and sentence that count the two rules on separate lines, never summed.
- **The Hide compare** gains `tier`.
- **`guards/incidentTierWords.test.ts`** fails the build on "worth a call" in client code outside the map; the Signal's "…to your vet" ask is excluded by shape. It was proven by planting the literal in `lib/chartCopy.ts`.

## Decisions

- **Dark by the row's stamp, not `design_v2`.** The Engines v3 key is the product gate, and a tiered row must draw its tier wherever the map exists.
- **History keeps the shipped rule:** no word for a calm read. The mock draws a grey chip; that is the PM's call (CUL-1432).
- **Call today has no action line.** The spec's "first thing tomorrow" needs its emergency exception, which needs PR-28's call-now signs. Without it, a digested-blood vomit (call today until PR-28) would read calmer than today's "Worth a call".

## Reviews

- **code-reviewer:** one finding. The record's gates read `recommendation` alone, so a call held only in `tier` hid. Fixed and mutation-proven.
- **adversarial-reviewer, round 1:** FAIL on four findings, all fixed:
  - the call-today leave to wait;
  - the rescue disclosure claiming "from what's logged" over a photo finding;
  - the tier-only call on the record;
  - the stamp rule.
- **Adversarial round 1, a server finding:** a held calm re-read leaves `error` standing, so CUL-819's line would go stale. This is server-side and filed as CUL-1432 item 8.
- **Adversarial round 2:** FAIL on an unstamped `{monitor, call_now}` row drawing a grey card. Fixed and mutation-proven. On the reviewer's recommendation, CUL-819's line is withheld until item 8 lands.

## Not in this PR

Everything below is listed on **CUL-1432**, which blocks CUL-1407:
- the watch-for list, "what to tell them" and call today's exception (PR-28);
- Home's band and the cross-pet banner (PR-30);
- Ask's definitions;
- the GA-day lines;
- the "{Pet}'s read:" spoken form;
- "Part of a pattern";
- CUL-819's wiring;
- the unstamped `call_now` word step.

CUL-531 (K3 = C) needs a stored photos-read count, a migration plus a server change. It stays open, with a comment explaining why.
