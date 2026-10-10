# Engines v3 PR-30a: Home's safety band and the cross-pet banner read the tier

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

CUL-1511 (EN-3 remainder ④), a `/dispatch` child. Shipped via #1147.

## What shipped

- **Server (generate-signal).** The red-flag lane's `event_ai_analysis` read adds `recommendation`, `tier` and `engine_flags`. `newRuleCallOf` (pipeline.ts) resolves each row with the record's own `tierDisplayOf`, so Home and the record use one resolver. Only a new-rule call counts; every earlier-rule row resolves to no call, so the lane is byte-identical until CUL-1407 seeds `engines_v3_en3`.
- `detectIncidentRedFlags`: a photo-flagged family gains `tier`, its loudest new-rule call, and `tierIso`, the most recent read at that tier. A family with no photo flag and a new-rule call is a card of its own (`flags: []`, `tier`, `tierIso`, `callOnly: true`), which counts the called reads (K1 = A: every call joins Home's band). Between two red-flag cards the louder call leads, then family.
- `phrasing.ts`: the ask is the tier-word map's label, lower-cased; the earlier rule keeps "worth a call to your vet" to the byte. A call-only card says "The read of {Pet}'s vomit on {day} says to call your vet now." and names no source. A photo card whose call came from a later read dates that read as its own. The carried template and `canRenderCarried` accept the call-only card.
- **Client.** The `lib/signal.ts` mirror; `signalCopy` (ask, sample line, evidence text and rows, banner); `signalTitle`; `signalHomeLine` (ask; "Read · {day}" eyebrow on a call-only card; a count line naming the later read). The banner says the mock's words ("Nyx: a vomit read says call your vet now."), and a call-now red flag takes the banner from any other pet's finding.

## Decisions

- **One resolver.** The server imports `tierDisplayOf` and `TIER_WORDS` rather than restating either, so a label edit now also redeploys generate-signal. Accepted for the same reason Ask took it (PR-27m): a second copy of the words is what the one-map rule exists to prevent.
- **Earlier-rule contextual calls stay off Home.** Adding unstamped `worth_a_call` rows with no photo flag would change Home today, not dark. The spec's band is the new tiers.
- **The fold table was not widened.** The fold is retired; its exhaustive table test reds on a field the base fixture lacks, and nothing reads the entry.
- **A call-only card names no source.** The row cannot tell a contextual sign from the model's own call on a clean photo or a call whose blood the owner cleared, so "from what you logged around it" (the first draft) was false for two of the three.

## Falsification

The adversarial-reviewer agent's first pass returned FAIL. Nothing was calmer than the record and never-lower held, but five defects showed something false or misordered on the safety band. All five are fixed in this PR:

1. **"Not from a photo" on a call that came from the photo.** This covered the model's own call on a clean photo, and an owner override that cleared blood on a call-now read. Fixed: a call-only card names no source. The `detection.ts` override contract now states the new-rule exception.
2. **The fresh call-now pinned on a 12-day-old photo's date.** Fixed: `tierIso` is the read's own date, said in the sentence and on the row.
3. **"Most recently Oct 10, say call now" where Oct 10's read said call today.** Fixed: the date is tracked per tier.
4. **A stool call now ranked under a vomit call today, disagreeing with the banner.** Fixed: tier-first tie-break, proven by mutation.
5. **A stamped unknown value: the record drew a call and Home stayed silent.** Fixed: maps to call now.

A second pass held all five. It then broke one new case: a photo call now on Sep 28, then a fresh call-only call today on Oct 10. The finding was byte-identical before and after, so the fresh call never reached Home, which is the case K1 = A exists for. Fixed: `laterCallTodayIso` carries it, and the sentence, the evidence and the Home row add "A later read, on Oct 10, says to call your vet today." Proven by mutation. The same pass hardened the date comparisons to parse instants (C-40) and made the call-only evidence plural.

A third pass returned **PASS**. It tried:
- the later-call clause on photo and call-only cards;
- a newer call now beside an older call today;
- same-instant reads;
- cross-family dates;
- a tampered cache value;
- the C-40 spelling split.

None showed Home or the banner calmer than the record. Its notes:
- the photo is named twice when the later read is the photo itself (cosmetic);
- the client tests do not assert the call-only card's later clause (the server tests do).

The `nyx-voice` read of the rewritten strings (C-28) passed with no changes. Every string names the pet and a date and carries the map's own ask, with no `!`, no alarm word, no jargon and no wellness claim.

Held: a call-now on pet B vs every lane on pet C (banner); mixed earlier-rule and new-rule reads in one family (no word steps down); failed-status and unstamped stale calls (presence holds, dark); `flags: []` through every live consumer.

Routed, not fixed here:
- the stale "now" and the undated banner (CUL-1739, Waiting on PM);
- seeding the key before an app build carries this PR, since older builds render a call-only card as a photo finding (comment on CUL-1407);
- the retired fold's strip helpers, which have no renderer.

## CI

The full `supabase/functions/` run reddened `engineStamps.guard.test.ts` on the `{ engine_flags: … }` literal `newRuleCallOf` built for the resolver: the same miss PR-27m recorded. Fixed the same way (the row goes to the resolver as it is). The lesson repeats: run the whole Deno tree, not the touched suites, before the first push.

## Checks

- `tsc --noEmit`: clean.
- `deno check` generate-signal: clean.
- `deno test` supabase/functions: 2652 passed.
- jest (lib/signal*, useSignal, components/home, components/designV2, guards, app): 3208 passed.
- Mutations: dropping the tier-first tie-break reds the ranking test; dropping `laterCallTodayIso` reds the later-call test.
