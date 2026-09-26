# Engine replay (research tooling, CUL-1117)

Replays the shipped engines over one pet's record so a session can answer "what did the engine say, how often, and at what urgency" without guessing. Built for `docs/research/2026-09-engines-step-change.md`; the first step of the proposed evaluation harness.

| File | What it does |
|---|---|
| `export.sql` | The two Supabase MCP queries that export one pet's record (subject named by id paired with owner, C-27, and matched only if it is an evaluation subject). |
| `evaluationSubjects.ts` | The pets the replay may read: the PM's own, by id (PMD-12, CUL-1314). |
| `subject.ts` | The checks that stop a mistyped or unauthorised export replaying: one pet in both queries, the same pet, a listed pet, a time zone; a non-zero replay count. Plain TS, covered by jest. |
| `exportShape.ts` | Reads `export.sql` against an allow-list of the shapes that keep the subject rule binding: the exact CTE with the listed ids, every table read keyed on it, nothing the scan cannot read. Covered by jest, with a mutant for each way around it found so far. |
| `record.deno.ts` | Loads the export and holds the one as-of visibility rule (created by T, not deleted by T, occurred by T; pre-edit photo fields before a later owner edit). States its blind spots in its header. |
| `signalReplay.deno.ts` | Runs the unmodified `generate-signal` detection, curation and template phrasing for every evening in a range and prints what Home would show, with the register of each vet ask. |
| `incidentReplay.deno.ts` | Replays the shipped `analyze-vomit` contextual rule (it must reproduce the stored flags; the script prints the mismatch count) and a recalibration sketch beside it. |

**Only evaluation subjects may be replayed (PMD-12).** The export runs as the service role, so RLS never asks whose pet it is. Until the privacy policy and the App Store label name an evaluation purpose (CUL-1313), the only subjects are the PM's own pets and synthetic records. `evaluationSubjects.ts` lists them; both CTEs in `export.sql` match only those ids, so run as committed, any other pet comes back as `subjects: 0` with none of its rows; the loader refuses any other pet id; and `exportShape.test.ts` fails the build when the SQL stops matching only the listed ids. **This binds a session that runs `export.sql` unchanged, and nothing more.** `execute_sql` runs whatever text it is sent, and the loader checks the export's own `pet_id` label after the rows have already reached the session: the rule is followed, never enforced. Adding a pet (a synthetic record in the database included) is a reviewed PR that changes the list and both CTEs; loosening `subject.ts` instead is the wrong fix. Another owner's pet waits for CUL-1313, and a consent "no" outranks the list. Keep derived facts about any other pet out of git, Linear, session records and artifacts. The food rows are not yet tied to the pet's owner (CUL-1316).

**Data never enters the repo.** Run the queries from a session, keep the outputs in the session scratchpad, pass their paths with `--record` / `--meals`. The scripts import the engine and never restate it (C-34), so a change to a detector changes the replay.

**Check fidelity before trusting any output:** the Signal ledger's last evening against the live `ai_signals` row, and `shipped-rule mismatches: 0` from the incident replay, read beside its read count (a zero over zero reads proves nothing). The loader refuses an export that does not name the same single listed pet in both queries, and both replays exit non-zero when they replayed nothing (`subject.ts`, CUL-1276, CUL-1314).

**Never tune a floor on this output.** It is one pet; calibration belongs to synthetic records with known truth (CUL-508), never the dogfood record or the demo pets.

The `.deno.ts` suffix keeps these files out of the app's `tsc` run (`tsconfig.json` exclude). Commands are in the brief's appendix.
