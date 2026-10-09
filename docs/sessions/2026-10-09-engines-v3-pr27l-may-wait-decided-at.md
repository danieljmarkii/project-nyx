# Engines v3 PR-27l: may_wait stamps when the leave was decided (migration 094)

**Date:** 2026-10-09

Dispatched build of CUL-1707, shipped via #1135. **094 is unapplied.** Applying it takes the PM's typed `apply 094`. This PR merges only after that, because the server writer names the new column and PostgREST fails any write that names an unknown one. The PM chose **A** (one PR: migration, server writer and phone together) over splitting the schema into its own PR.

**The gap (CUL-1629, PR-27f's adversarial finding 1).** "First thing tomorrow" covers one night, ending at the first local 6 AM after the decision. The phone had no decision time. `updated_at` moves on every write, a Hide or Show included, so PR-27f bounded the night by min(`updated_at`, the incident's time). That bound is safe, but it ends a late read of an older vomit before its night.

**What shipped.**
- **Migration 094.** Adds `event_ai_analysis.may_wait_decided_at timestamptz` (nullable, no default, no backfill). The freeze is re-stated as 088's body plus one line, so no client can move the stamp.
- **`withMayWaitDecidedAt`** (`_shared/incidentMayWait.ts`) stamps the write's time only when the write carries a `may_wait` key. It is applied at all five server writes of `may_wait`:
  - `updateAnalysisRow`
  - the write-back upsert
  - the failure upsert
  - the capped branch's lower
  - `revalidateMayWait`
- **The rule it keeps.** A TRUE is written only on a fresh passing verdict, and a write without `may_wait` never moves the stamp. So the stamp is never newer than the TRUE beside it. A miss leaves an older stamp or none, and both end the night sooner.
- **The phone** (`lib/mayWaitLine.ts`, `leaveDecidedAt`):
  - With a stamp, the night starts at min(stamp, `updated_at`), so a skewed stamp cannot lengthen it.
  - With no stamp, PR-27f's bound stands.
  - A stamp that is present but won't parse refuses the wait.
  - The column joins the two analysis sections' one select.
- **Guards:**
  - `incidentReadFreeze.test.ts` adds the column to `SERVER_OWNED`.
  - A new Deno scan checks that every `event_ai_analysis` write under `supabase/functions` either routes through the helper or writes a literal with no `may_wait`. Its floor is four call sites in `incident-analysis.ts` and one in `incidentMayWaitEvidence.ts`.
  - CUL-1323's read-words scan now unwraps the helper.

**Proofs.**
- Unwrapping `revalidateMayWait`'s write turns the new scan red.
- In `leaveDecidedAt`, putting the incident back into the min turns the three stamp tests red, and dropping the `updated_at` clamp turns the skew test red.
- `lib/mayWaitLine` passes in Kiritimati, Chatham, Honolulu and New York.
- `deno check` and the `_shared` Deno suites are green (330 tests).
- `tsc` is clean.

**Reviews.** The adversarial review and the rls-privacy-reviewer (with a Postgres 16 probe) both returned **HOLDS**:
- No server path leaves a TRUE beside a newer stamp.
- No client route moves the stamp.
- 094's freeze is 088's body plus one line.

Both found the same residual: the stamp records the latest decision, so a re-read of an old call-today incident that passes again starts a fresh night, which PR-27f's incident bound used to refuse.

**Open:** that ruling is with the PM on CUL-1707. Options:
- **(a) recommended:** the stamp is set once, by a database trigger;
- **(b):** accept a re-read as a new decision;
- **(c):** always keep the incident bound.

Minor findings, held until the ruling settles the shape:
- The stamp is the write's time, a moment after the verdict (finding B; (a) closes it).
- The helper's comment names the wrong test file as the one that pins its call sites (finding C).
