# Engines v3 PR-30c: a "Call your vet now" read steps to a dated form after its first day

**Date:** 2026-10-10
**One thing:** none (a dispatched session, not this round's teach row)

CUL-1739, a `/dispatch` child, plan-gated. Shipped via #1156.

## What shipped

- **The rule (PM ruling A).** A new-rule call now says "now" for 24 hours from when it was *said*. After that, Home's row, the cross-pet banner, the Signal screen's sentence and evidence, Home's arrival speech, and the record's card (vomit and stool) quote the call with its day: "On Oct 3, the read said: call your vet now". The card keeps its 14-day window, its rose and its place. There is no haptic. Call-today and earlier-rule cards are byte-identical.
- **When the 24 hours start (ruling 1a).** "Said" is the later of the event and the read row's last write. generate-signal reads `event_ai_analysis.updated_at` (as `writtenAt`) and emits `tierReadIso`, the freshest said-at over the card's tier. The record uses its own row. A card cached before this change has no `tierReadIso` and keeps "now".
- **The banner (rulings (a) and 2a).** In its first day, a call now leads, as PR-30a built it. After that it ranks 0.5: just under a live red flag, above intake decline. If a later call today exists, the banner says that call instead.
- **The words.** `lib/callNowDated.ts` holds the one 24-hour check, `callNowSaidAt`, `localCallDay` and the dated strings, all built from `TIER_WORDS`. Every dated day is the phone's local day. The record's action line reads: "If you haven't spoken to your vet since, call them now. If they're closed, call an emergency clinic."

## Decisions

- **24 hours, not the local day.** A local-day rule would date an 11:40 pm call twenty minutes later. That reads calmer than "now" inside its first day.
- **Said-at, not the event (1a, PM).** A re-floor raised a 25-hour-old vomit to call now. Dated by the event, it showed dated on first render, and "since Oct 8" excused an owner who had called before the lethargy.
- **The banner refines ruling (a) (2a, PM).** At an equal rank, a dated call now could hide a fresh call today in the other family, or on the same card.
- **Local day for every dated form (second pass).** East of UTC, a UTC day can name the day before the owner was told, which is the excusal direction. Home's photo eyebrow keeps its UTC day.

## Falsification

- **Pass 1: FAIL.** Two breaks:
  - a late-raised call now was dated at once (high);
  - the banner hid a fresh call today under a dated call now (medium).

  The PM ruled 1a and 2a, and both were built.
- **Pass 2: FAIL.** Both breaks held, but it found two more:
  - `laterCallTodayIso` was ordered by event time while dating ran on said-at. A late-written call today on an older event was hidden, and a call now raised after a call today stepped the banner down to it.
  - Dated days printed in UTC.

  Fixed: later is ordered by said-at, with a fallback to event order only when write times are missing, and dated days print in the phone's local day. Both fixes are proven by mutation.
- **Pass 3:** see the outcome comment on CUL-1739.
- **Named residuals (all loud):**
  - an owner edit, a Hide or a failed re-read moves `updated_at`, which restarts "now" for a day;
  - Get ready's "Worth raising" quotes the server sentence verbatim;
  - `InsightCard`'s evidence call passes no clock (nothing renders `InsightCard`);
  - an old cache never dates.
- **Quiet-direction residual:** a phone clock more than 24 hours ahead dates a fresh call early.

## Checks

- `tsc --noEmit` is clean.
- jest (signal, record, guards, home, hooks): 2,883 passed. The PR-30c suites also pass under UTC, +14, −10, +5:45 and +12:45.
- `deno test supabase/functions`: 2,661 passed.
- Mutations: the boundary (23 hours) reds 7 tests, the banner rank reds 1, and the later-call-today order reds 2.
- Reviews: `nyx-voice` passed after one fix ("call them now"), and `code-reviewer` found no blockers.

## Filed

- CUL-1749: a call today says "today" for its whole window (needs its own ruling).
