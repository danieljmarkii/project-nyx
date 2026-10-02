# Engines v3 PR-28: EN-4's floor on the vomit read (server half)

**Date:** 2026-09-30

Shipped via #992. The PR names CUL-1435, the server-half sub-issue of CUL-1134 (EN-4). Dispatched session, mode BUILD, branch `claude/cul-1134-pr28-0930`.

## What shipped

Before this, a cat vomiting three times in four hours with no photos got no call anywhere. The vomit read ran only on the photo path, and its rules topped out at one "Worth a call". This PR gives the read the louder rows of the sign-to-tier table and a way to run them on any vomit, all dark behind a new engine key, `engines_v3_en4`. The key is not seeded, and it acts only where `engines_v3_en3` also writes tiers.

- **`lib/incidentFloor.ts`**: one pure, import-free, raise-only rule. It builds these rows:
  - T1 (three non-found logs in 30 minutes): call now.
  - T2 (three onsets in about 4 hours): call now. Only witnessed logs merge, within 30 minutes of the onset, never chaining. Found piles are never onsets.
  - T3 (lethargy within 24 hours either side): call now.
  - T6 (a dog, two vomits in 24 hours): call today.
  - T7 (under six months or no birthday, two in 24 hours): call today.
  - T8 (three back-to-back 24-hour spans): call today.

  It never decides a read is calm. Every §7 row marked quieter than today stays out.
- **`analyze-vomit`**: reads the floor's rows and adds the matching existing flag, so installed builds see no new value. It hands the floor's tier to the shared pipeline as `ContextualRun.minTier`. `ruleVersion` is now `vomit3`.
- **`_shared/incident-analysis.ts`**:
  - `raisedTier` on every writer.
  - A second look at the record after the vision call.
  - Request modes `floor` (no Storage, model or cap unit; raise-only over a stored read) and `refloor` (a lethargy, meal or vomit log, live or soft-deleted, re-floors the pet's vomits both ways).
- **Spec:** `docs/nyx-incident-tiers-requirements.md` v0.3. The PM approved the §8.6 amendment: the re-run window reaches 24 h either side, and 72 h for a vomit trigger.

## Decisions

- Split EN-4 into sub-issues:
  - CUL-1435: the server half, this PR.
  - CUL-1436: the client half. It covers the durable marker, the offline preview, one arrival per bout, and the Noticed door.
  - CUL-1437: the shown-tier log, its own schema PR.
- **The floor raises through existing flags** (`repeated_vomiting`, `concurrent_lethargy`). Installed builds, which read only `recommendation` and the flags, keep today's words.
- **Held:**
  - T11 dog bloat: waits on GAP-14.
  - T9: waits on GAP-33.
  - T20/T21: wait on the drug list.
- **Replay column deferred.** The `incidentReplay.deno.ts` column waits, because `scripts/engine-replay/` belongs to PR-16 this week.

## Falsification

The `adversarial-reviewer` pass held four invariants on the first try:
- nothing is quieter than today under any flag combination;
- the floor never downloads a photo, calls the model or spends a cap unit;
- n=1 never reassures;
- ownership: a cross-account refloor 404s.

It found five coverage defects, all on the louder side. Each is fixed, and each fix's test went red against the earlier commit:

- **D1:** T8 missed three evening vomits (23:00, 22:00, 23:30) because it only tried run starts at a log.
- **D2:** the re-run only looked back.
- **D3:** lethargy logged during the photo read was lost.
- **D4:** a soft-deleted trigger could not re-floor.
- **D5:** the floor's words named a photo finding the owner had corrected.

Never-lower is proven by mutation. Dropping `holdsOver` reds the "call today at 8:00, a meal rated All at 12:00" case. Dropping the raise-only check reds "nothing louder to say writes nothing".

## Residuals

- When a call-now row and the feline intake flag both fire, the read leads with the call-now reason and drops the intake sentence. Flagged for Dr. Chen at the CUL-583 sitting.
- T8's spans are 24-hour cuts, not calendar days, because the server knows no time zone.
- Every threshold is a placeholder for CUL-583 and CUL-1312. Going live waits on CUL-1312 and CUL-1436.
