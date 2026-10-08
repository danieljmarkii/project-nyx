# Engines v3 PR-23c: the raised-again latch survives a skipped night and an unreadable prior row

**Date:** 2026-10-08
**One thing:** S2 L1 — A fact remembered only in a saved row dies with that row; a fact rebuilt from the record cannot · check: pending

Dispatched build of CUL-1600 (relaunch; the PM ruled **B** on 2026-10-06), shipped via #1102. Plan posted on the issue, PM go typed in this session.

**The bug.** EN-9's latch (CUL-1545) holds a returned concern loud until the owner answers about something after it came back. The moment it came back lived only in last night's `ai_signals` row. An incomplete read skipped the care step and the carried card lost its care state; a failed prior-row read handed the step nothing. Either way the next answer about an older visit was judged as a first answer and could quiet a concern still doubling (r0→r3, from #1073's adversarial review).

**What shipped.**
- `rebuiltMarker` (`generate-signal/careState.ts`): the step's own evening-by-evening re-raise test is replayed against every answer in the current course but the one tested live. For each, the first evening that answer was the one the step tested: not covered by a newer answer written on an earlier day whose anchor had arrived, that was not retracted and was inside its trial or course. The latest such day is the marker, combined with the carried one field by field (later instant, later day), so nothing from the owner-writable row can move it earlier.
- A skipped step under `engines_v3_en9` stamps the prior marker on every concern card it writes as a bare `raisedAgainLatch` (no state, so the lane's own ask stands). It covers what the replay cannot: the cough/vomit pair and a failed care-history read.
- Residuals 2–5 folded: the marker's local day is stored (`raisedAgainOn`); each lane resolves its legacy fallback before pooling; a trial or course answer is about the earlier of its anchor and its start; a held latch reads "Back since {date}." or "Still back." when the day is only a stand-in.
- Ask strips the latch before the model sees a finding.

**Adversarial review, three rounds.** Round 1 FAIL: a forged prior row's earlier day won the merge (whole-marker pick); the replay tested only the earliest trigger, missing a re-raise that surfaced when an eight-week trial ended. Round 2 FAIL: a trial written before its start covered the older answer while still future-anchored; a course stopped with no end date read as ended on every past day. Round 3 PASS: r0→r3 holds `raised_again` in UTC, Auckland, Chatham and Honolulu with no prior row, an unstamped skipped row and a stamped one; a visit about the re-raise day itself goes `with_vet`. Every counterexample became a test from the reviewer's own fixture. 22 mutations: 21 red; the survivor (an answer's own walk starting at its anchor) is unreachable under the shipped knobs and says so in the code.

**Residuals, stated in the header.** The pair reason and a reference beyond the read are not replayable. Scope fields (end date, status, newest dose) are read as they stand today, so a course that lapsed over a dosing gap and resumed reads as covering the gap, and a late-synced end reads as on time; quieter only with no prior row. The D4 lapse list on an unreadable prior row is CUL-1663 (filed, with a PM call). The no-prior replay assumes a nightly run, so it can be louder than what the app actually showed.

**Also found.** The code reviewer's base looked like 125 files; the real diff was four (a stale local `origin/main`).

## Teach

### One thing — A remembered fact dies with its row; a rebuilt one cannot (S2, L1)
Some facts the app stores, and some it works out. A stored fact lives exactly as long as the place it is stored: if that one saved copy is skipped, stripped or unreadable, the fact is gone and nothing notices. A worked-out fact can be produced again from the record (every logged event and every answer) on any run, so losing a copy costs nothing. This session moved "the day the concern came back" from the first kind to the second.

**Like:** a receipt in your wallet versus your bank statement. Lose the receipt and the purchase is unprovable; the statement can always be printed again.

**In today's work:** `supabase/functions/generate-signal/careState.ts:1096`
`const carried = laterMarker(priorMarkers.get(sign) ?? null, rebuiltMarker(sign, args, ix, cfg, ack?.id ?? null))`
The left half is the remembered fact (last night's row); the right half rebuilds it from the record; the later of the two wins, so a lost or edited row can only make the card louder.

**Why it matters to you as PM:** when a spec says the app "remembers" something, ask whether it could be worked out instead; that question turned a recurring class of skipped-night bugs into one fix.

**Check:** The record rebuild cannot replay the cough/vomit pair, so that re-raise is still only remembered. What happens to it if last night's Signal row cannot be read?
