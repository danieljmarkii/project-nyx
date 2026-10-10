# Engines v3 PR-27p: a shown call now keeps its words over a flag-off write

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

Dispatched session (CUL-1516, BUILD), shipped via #1150.

## What shipped
- `lib/incidentTierWords.ts`: `isTieredRow` treats a stored `tier = 'call_now'` as a new-rule row whatever the `engine_flags` stamp says. `tierDisplayOf` speaks any stored `call_now` as call now. Before this, a flag-off write (stamp `[]`, which never names the tier column) over a shown call now kept the filled rose and the call-now rank but stepped the words down to "Worth a call" (GAP-34, R-1).
- The fix goes through `isTieredRow` and not only through the words resolver. The record's card and its action line, the month's population, the rule seam and Ask all switch on that one predicate, so a patch to the words alone would have left the record card on "Worth a call".
- Louder only. A stale `call_today`, `logged` or `not_enough_to_say` beside an unstamped write still follows the stamp (spec §1's rollback case is unchanged).
- Tests: a new resolver case covers every stamp shape, status and verdict beside a stored `call_now`. Proven by mutation: dropping the exception reds it. The VomitAnalysisSection case that pinned the old step-down now asserts call now on the record card.

## Decisions
- Candidate fix (b) from the issue: the words read the louder of the stored tier and the stamp, scoped to `call_now`. It was chosen over candidate (a), a server hold that keeps the stamp. The client fix also covers a rolled-back server build, needs no analyze-* redeploy, and keeps the flag-off run's own read text on the row.
- Tier-2 edit to spec §1, PM-approved in session 2026-10-10 and written in this PR (spec v0.4): "Earlier rule" is decided by the rule-version stamp, save a stored `call_now`, which keeps its words over a later flag-off write (GAP-34).

## Falsification
The adversarial reviewer verdict was PASS. It tried five ways to put a `call_now` on a row the owner was never shown as call now:
- a flag-off rescue
- a failed-flags read
- a floor-only write
- the offline preview
- local hydration

Every tier writer is key-gated and stamped (incident-analysis.ts :377, :674, :989, :1631). It also checked whether the change lowers anything: a calm flag-off re-read is held by `holdsOver`. And it checked what turns on now that the row counts as tiered: the held-call disclosure and `tellThem`. Both move louder or more honest.

## Residuals
- Spec §1 says that deleting the row that raised a read lowers its tier. No path implements that lowering, with the key on or off. Filed as CUL-1741.
- The rollback trade: if EN-3 were switched off because its call-now mapping was wrong, the call-now words stay on the rows already shown that way. That is GAP-34's chosen trade.
