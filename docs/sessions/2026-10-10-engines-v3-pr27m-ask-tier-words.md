# Engines v3 PR-27m: Ask quotes the tier words

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

CUL-1512 (EN-3 remainder ⑤), a `/dispatch` child. Shipped via #1141.

## What shipped

- Ask's `READ_COLS` reads `tier` (079) and `engine_flags` (075), so the record's words can be resolved. Both columns are applied, and both are already read by the phone through `lib/readCopy.ts`.
- `mapReadRow` resolves `tierWords` from the raw DB row through the one tier-word map (`tierWordsOf` → `tierDisplayOf` + `TIER_WORDS`), the same resolver every client surface uses, where the dated correction is already worded. `AskCachedReadRow` carries no raw tier or stamp column, and the raw `recommendation` field left `ProjectedRead`, so no tier, verdict or stamp value reaches the model.
- `SYSTEM_PROMPT` rule (11) is built from the map's labels plus `TIER_DEFINITIONS` (one line per word; two displays share "Keep an eye out", so it is defined once). The model quotes the words exactly, never softens a call, and never gives an older read newer words.
- `redactReadForModel` hands the model a call's words (`read_words`) even when the photo has no flag, and only for a call; quiet words stay withheld. `featuredNonEscalatingRead` counts a call's words as an escalation through the same helper (`callWordsOf`).
- The Deno guard that kept `tier` out of Ask's select was flipped to pin `tier`, `engine_flags` and `recommendation` in it.

## Decisions

- **The map itself, not a twin (C-26).** `lib/incidentTierWords.ts` imports only the two import-free rule modules, so Ask imports it directly; its imports gained explicit `.ts`. A label edit now redeploys Ask and nothing else. A twin would have meant a second copy of the words, which is exactly what the one-map rule exists to prevent.
- **The read_photo path is escalate-only.** Recall already relays the quiet words, but read_photo's no-flag branch deliberately hands the model nothing, and that design was kept.

## Falsification

The adversarial-reviewer agent tried four things. Every one held: an unknown value, an unstamped `call_now`, a failed-status call, and a raw value leaking through any tool. It then **broke** one case: a stamped `call_now` with no photo flag on the cached read_photo path. The model was told to lead with "Call your vet now", and the flag-only `featuredNonEscalatingRead` then scrubbed that headline. This was fixed in the PR, with a test proven by mutation.

Its two other findings predate this PR, so they went to Wave 7 rather than widening it:

- CUL-1731: a held call whose fresh read is capped goes quiet.
- CUL-1732: a dismissed call goes silent in Ask while the record keeps it. This needs a PM ruling.

## CI

The first run went red on `engineStamps.guard.test.ts`, the one-writer guard. It read the `{ engine_flags: … }` literal that `tierWordsOf` built for the resolver as a stamp write. The guard is right not to tell a read-side literal from a write, so it stayed unchanged. The words are now resolved from the DB row as it is, in `mapReadRow`. The miss happened because I ran only the `ask/` suites locally; the full `supabase/functions/` run (2585 passed) is what catches a guard like this.

## Checks

- `tsc --noEmit`: clean.
- `deno test`, ask/ + incident-tier: 174 passed.
- `deno check`, ask/: clean.
- Targeted jest (tier words, read state, edge deploy, may-wait): 122 passed.
- Mutations: relaying the raw verdict reds 3 tests; the flag-only scrub reds 1.
