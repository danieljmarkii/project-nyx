# Loose ends PR-21: the burden card and builds that cannot draw it

**Date:** 2026-11-11
**One thing:** none — dispatched session, not this round's teach row
**Mode:** DISCOVERY (shaping brief), closed on the PM's `go 1`, [CUL-1774](https://linear.app/projectnyx/issue/CUL-1774)

## What the code says

- The client renderer for `symptom_burden` (`components/home/InsightCard.tsx`, `SignalZone.tsx`, `lib/signal.ts`, `lib/signalCopy.ts`) shipped in the same PR as the server card (#984, 2026-09-29). Only native builds cut before that date lack it.
- `generate-signal` drops a same-sign `symptom_worsening` under a burden card (`suppressWorseningUnderBurden`, `supabase/functions/generate-signal/pipeline.ts`). The app sends no build number to the server, so the server cannot tell clients apart.

## The production read

Supabase edge logs, where every iOS request carries `User-Agent: Culprit/<build number>`. No Android traffic.

| Day (UTC) | Builds seen |
|---|---|
| 2026-09-28 | 53 (before the burden card) |
| 2026-10-05 | 55 |
| 2026-10-15 | 57, 53 |
| 2026-10-25 | 59, 53 |
| 2026-11-04 | 59 |
| 2026-11-08 | 59 |
| 2026-11-10 → 11 | 61 |

Build 53 was exposed for about four weeks on one device. It has not appeared since 2026-11-04. Builds 59 and 61 were cut after 2026-10-15 and draw the card.

## Ruling

PM `go 1`: close on this evidence, remove `Live harm`, and file the general rule as one Backlog finding: [CUL-2711](https://linear.app/projectnyx/issue/CUL-2711) (the server cannot tell which cards an installed build can draw). No code changed.

## Outcome

Shipped via #1513.
