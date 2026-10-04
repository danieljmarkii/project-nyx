# Out of beta PR-32 — the photo read's words: a calm read draws no word, an unclear read says its record's

**Date:** 2026-10-04
**One thing:** D3 L1 — Reading a test: a loop over nothing proves nothing · check: pending

Dispatched session (`/dispatch`, PR-32). Shipped via #1047. Builds two PM rulings of 2026-10-03 (CUL-1520 docket items 11 and 12), both `GA gate` for History v2.

## What shipped

- **CUL-1233 (a): a calm read draws no word on any design_v2 surface.** The Signal gallery tile (`components/designV2/signal/EpisodeGallery.tsx`) dropped "Keep an eye out" under a calm read (`logged` / `monitor`); its spoken sentence now stops at "photographed". Home and History's day row already drew nothing (§3.6 rule 7). The record keeps its words one tap in.
- **CUL-1234 (a): the grey mark says its record's words.** A read that finished `not_enough_to_say` shows *Not enough to say yet* on the row, matching the record on tap-through. Every other no-completed-read case says *No read yet* on Home, History and the gallery alike, replacing the row's *Photo not read*.
- One shared constant (`NO_READ_WORDS`) and one calm predicate (`isCalmDisplay`) in `lib/incidentTierWords.ts`; `nodeReadOf` (`lib/spineNode.ts`) carries the label from `readVerdictOf`'s verdict, so `NodeRead`'s `unread` arm now holds `label`.
- Spec `docs/nyx-history-v2-requirements.md` v1.12 records both rulings under ⚠ RULED; the H-4b ruling rows keep their words as ruled, with a pointer.

## Decisions

- **The shared phrase is *No read yet*** (the ruling left the pick to the build session's `nyx-voice` pass). The gallery draws a read in flight with the same words, and "not read" of a photo that is being read is false; "yet" is true of every case. The adversarial pass noted the cost: for `read_disabled` and a failed read that does not retry, "yet" promises a little more than the record backs. Accepted; *Photo not read* was false for the in-flight case, which is the more common one.
- **The unclear row keeps the grey hatched mark**; only the words change. Grey never rose, never calm.

## Review

- **adversarial-reviewer (HOLDS):** enumerated 5,760 read-copy states (status × recommendation × tier × engine stamp × stale photo set × in flight × copy present) through the real `readVerdictOf` / `nodeReadOf` and the shipped `verdictWord`. Silence only on a finished, current `monitor` / `logged`; the gallery and the row never disagree; no call silenced. Tried: an in-flight re-read over an old calm verdict, failed / capped rows carrying an earlier `logged`, a replaced photo (`photoSetStale`), `monitor` beside tier `call_now`, a bout whose sibling row is `call_today`. Each held.
- **R2, fixed here:** the gallery's photo query lacked `readCopies`' `id DESC` tiebreak, so on a `created_at` tie the tile could show a photo the stale check never tested, and a calm tile would now stand silent over it. One line in `lib/signalScreen.ts`.
- **code-reviewer (ship-ready):** folded in `flexShrink: 1` on the mark's words (up to 21 characters now), a stale-calm label test, the spec wording, and a stale comment.
- **Mutation:** dropping the unclear label in `nodeReadOf` reds two tests (the model and Home's screen test).

## Residuals

- **R1:** a calm tile whose bout holds a second photographed row that was not read stays silent; the silence is true of the tile's photo, not of the episode. It said "Keep an eye out" before, so no worse. Comment on CUL-1233.
- History's Photographed sub-line *N not read* still counts the rows that now say *Not enough to say yet*. Outside the ruling's wording; comment on CUL-1234.
- R3 (rows written before the read stamps cannot be checked for a replaced photo) is the documented blind spot, unchanged.

## Teach

### One thing — Reading a test: a loop over nothing proves nothing (D3, L1)
A test that checks "every tile says the right thing" walks through the tiles one by one and checks each. If the sample data happens to hold no calm tile, the calm check never runs, and the test passes while proving nothing about calm tiles. So before the walk, the test first asserts that the sample really contains one of every kind it means to check.

**Like:** a fire inspector who certifies "every extinguisher in the building is charged" after visiting a building with no extinguishers. True, and worthless.

**In today's work:** `components/designV2/signal/SignalScreen.test.tsx:293`
```
const kinds = new Set(tiles.map((t) => (t.verdict === null ? 'none' : isCalmDisplay(t.verdict) ? 'calm' : t.verdict)));
expect([...kinds].sort()).toEqual(['calm', 'none', 'not_enough_to_say', 'worth_a_call']);
```
The first line sorts each sample tile into its kind; the second fails the test unless all four kinds are present, before any tile is checked.

**Why it matters to you as PM:** when a session reports "tests pass" on a safety rule, the question worth asking is whether the test data contained the case the rule is about.

**Check:** if someone later edits the sample data so no tile is calm, and also breaks the code so calm tiles show "Keep an eye out" again, what happens to this test, and why?
