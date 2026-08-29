# Event taxonomy — W1: the deploy, the swap, and the reconciliation (CUL-676, CUL-677)

**Date:** 2026-08-29
**Shipped via #737.** _(Branch `claude/w1-pr4-other-row-swap-bqqy1f`, restarted from `main` after #735 merged.)_

The day W1 stopped being a mechanism and became a change to the record.

## What happened

1. **A TestFlight build carrying #730 landed**, and the PM confirmed Cough / Sneeze
   rendering on device. That was the gate the whole chain queued behind.
2. **`generate-signal` deployed** — v32 → **v33**, 13:26 UTC.
3. **The §11 swap ran** — 13:47 UTC. 33 of 34 `other` rows re-keyed; 1 held by ruling.
4. **This PR reconciles the records** that still described the pre-deploy world.

## The swap

| event_type | before | after |
|---|---|---|
| cough | 0 | **22** |
| sneeze | 0 | **11** |
| other | 34 | **1** |

Total 979 → 979, enforced inside the transaction. Notes, timestamps and
`occurred_at_confidence` untouched; `updated_at` bumped on all 33 re-keyed rows and on
**none** of the held row — the propagation mechanism doing exactly its job and nothing else.

Post-swap, `predictChronicity --after` reproduced the pre-swap prediction identically:
**cough fires `firm`** at 20 episodes / 50-day span / 6 active weeks / 2 days since last.
The ~9-week cough course the record had been carrying in note text is now something the
engine can read.

## Two things worth keeping

**The floors are clocks, demonstrated rather than asserted.** The same prediction run on
2026-08-28 read 21 episodes / 53-day span; on 2026-08-29 it read 20 / 50. Nothing changed
in the record — the 56-day window slid forward overnight and dropped the Jul 1 and Jul 3
coughs out the back. §11 step 4 exists to stop a future session debugging that as a
defect, and this run produced a live example of the thing it warns about.

**The ledger lies by omission, not by drifting.** After the deploy, `deploy-manifest.json`
still said `generate-signal: pending` and STATUS.md still listed the hold as standing. The
CI guard did not catch it and could not: it fires on **fingerprint** drift, and the
fingerprint was correct — it was the *status* that had gone stale. A hold that has been
cleared but is still written down is worse than no hold at all, because STATUS.md exists
precisely so holds are not rediscovered. Worth knowing that the guard's coverage stops at
"has the source changed", not "is this still true".

## Two decisions the PM took, recorded rather than dropped

Both are the PM's to make and both are defensible; they are written down because a waived
gate that leaves no trace is indistinguishable from a gate nobody thought of.

- **The multi-device behavioural check (§11 step 0) was waived.** The stated reason was
  that the feature toggle would not be on much longer. Noting once, because the reason
  rests on a wrong premise: `EVENT_TYPES` is **never** flag-gated (§12), so what would
  render these rows as a neutral "Event" on another device is an out-of-date **build**,
  not the flag — and GA'ing `event_types_v2` would not change that. Accepted risk on the
  owner's own record, and reversible.
- **The `rls-privacy-reviewer` re-review on PR #735's closing diff was waived.** The first
  pass returned FAIL with 9 findings; F1–F5/F7 were closed with tests and F1/F2/F3
  red-checked against a deliberately broken emitter. The re-review was prudence on top of
  that, not a gap in it.

## Records reconciled here

- `deploy-manifest.json` — `generate-signal` → `deployed`, v33, with the pre-deploy record
  retained verbatim beneath the closure rather than trimmed away. That entry *is* the
  history of what the gate was and why it held.
- `STATUS.md` — "Three standing holds" → "Two", with a one-line note of what cleared and
  when. The two that remain (`generate-report` / CUL-19, the per-incident AI chain /
  CUL-557) are untouched.
- `scripts/w1-other-row-swap/run-log.md` — filled in: gates, the zero delta, the
  prediction recorded *before* the run, dry-run and live before/after tables, verification,
  and both waivers.

## Open

- **CUL-688** — with recency at 28, R4's span-first ordering can let a 27-days-quiet course
  lead one seen today. An ordering call that was never put. Now live-relevant: Nyx has two
  chronic courses, so something is leading.
- **CUL-686** — the density OR-arm for short dense courses, carried as a named defect.
- **CUL-690** — no JS-bundle identifier on device; today's gate had to be discharged
  behaviourally because no version string could discriminate.
- **CUL-696** — `export-pet-timeline.sql` picks its pet by name, unscoped, against a
  database with two pets named Nyx.
