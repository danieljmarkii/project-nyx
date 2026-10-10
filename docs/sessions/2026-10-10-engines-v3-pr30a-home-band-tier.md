# Engines v3 PR-30a: Home's safety band and the cross-pet banner read the tier

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

CUL-1511 (EN-3 remainder ④), a `/dispatch` child. Shipped via #1147.

## What shipped

- **Server (generate-signal).** The red-flag lane's `event_ai_analysis` read adds `recommendation`, `tier` and `engine_flags`. `newRuleCallOf` (pipeline.ts) resolves each row with the record's own `tierDisplayOf`, so Home and the record use one resolver. Only a new-rule call counts; every earlier-rule row resolves to no call, so the lane is byte-identical until CUL-1407 seeds `engines_v3_en3`.
- `detectIncidentRedFlags`: a photo-flagged family gains `tier`, its loudest new-rule call. A family with no photo flag and a new-rule call is a card of its own (`flags: []`, `tier`, `fromRecord: true`), counted and dated over the called reads (K1 = A: every call joins Home's band).
- `phrasing.ts`: the ask is the tier-word map's label, lower-cased; the earlier rule keeps "worth a call to your vet" to the byte. The record call has its own sentence; the carried template and `canRenderCarried` accept it.
- **Client.** The `lib/signal.ts` mirror; `signalCopy` (ask, sample line, evidence text and rows, banner); `signalTitle`; `signalHomeLine` (ask, and the eyebrow says "Read" rather than "Photo read" for a record call). The banner says the mock's words ("Nyx: a vomit read says call your vet now."), and a call-now red flag takes the banner from any other pet's finding.

## Decisions

- **One resolver.** The server imports `tierDisplayOf` and `TIER_WORDS` rather than restating either, so a label edit now also redeploys generate-signal. Accepted for the same reason Ask took it (PR-27m): a second copy of the words is what the one-map rule exists to prevent.
- **Earlier-rule contextual calls stay off Home.** Adding unstamped `worth_a_call` rows with no photo flag would change Home today, not dark. The spec's band is the new tiers.
- **The fold table was not widened.** The fold is retired; its exhaustive table test reds on a field the base fixture lacks, and nothing reads the entry.

## Falsification

See the adversarial-reviewer section below.

## CI

The full `supabase/functions/` run reddened `engineStamps.guard.test.ts` on the `{ engine_flags: … }` literal `newRuleCallOf` built for the resolver: the same miss PR-27m recorded. Fixed the same way (the row goes to the resolver as it is). The lesson repeats: run the whole Deno tree, not the touched suites, before the first push.

## Checks

- `tsc --noEmit`: clean.
- `deno check` generate-signal: clean.
- `deno test` supabase/functions: see the final run below.
- jest: `lib/signalIncidentTier`, `lib/signalCopy`, `hooks/useSignal`: 379 passed.
