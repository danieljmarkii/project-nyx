# Engine replay (research tooling, CUL-1117)

Replays the shipped engines over one pet's record so a session can answer "what did the engine say, how often, and at what urgency" without guessing. Built for `docs/research/2026-09-engines-step-change.md`; the first step of the proposed evaluation harness.

| File | What it does |
|---|---|
| `export.sql` | The two Supabase MCP queries that export one pet's record (subject named by id paired with owner, C-27). |
| `subject.ts` | The checks that stop a mistyped export replaying as a clean pass: one pet in both queries, the same pet, a time zone; a non-zero replay count. Plain TS, covered by jest. |
| `record.deno.ts` | Loads the export and holds the one as-of visibility rule (created by T, not deleted by T, occurred by T; pre-edit photo fields before a later owner edit). States its blind spots in its header. |
| `signalReplay.deno.ts` | Runs the unmodified `generate-signal` detection, curation and template phrasing for every evening in a range and prints what Home would show, with the register of each vet ask. |
| `incidentReplay.deno.ts` | Replays the shipped `analyze-vomit` contextual rule (it must reproduce the stored flags; the script prints the mismatch count) and a recalibration sketch beside it. |

**Data never enters the repo.** Run the queries from a session, keep the outputs in the session scratchpad, pass their paths with `--record` / `--meals`. The scripts import the engine and never restate it (C-34), so a change to a detector changes the replay.

**Check fidelity before trusting any output:** the Signal ledger's last evening against the live `ai_signals` row, and `shipped-rule mismatches: 0` from the incident replay, read beside its read count (a zero over zero reads proves nothing). The loader refuses an export that does not name the same single pet in both queries, and both replays exit non-zero when they replayed nothing (`subject.ts`, CUL-1276).

**Never tune a floor on this output.** It is one pet; calibration belongs to synthetic records with known truth (CUL-508), never the dogfood record or the demo pets.

The `.deno.ts` suffix keeps these files out of the app's `tsc` run (`tsconfig.json` exclude). Commands are in the brief's appendix.
