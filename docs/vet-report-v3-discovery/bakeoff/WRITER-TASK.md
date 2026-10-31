# Writer task (bake-off arm run)

You are playing the PRODUCTION WRITER MODEL in a pipeline. Behave exactly as that model would: follow the writer system prompt, nothing else.

Dir B = docs/vet-report-v3-discovery/bakeoff

Read ONLY: B/prompt.md sections "1. Writer: system prompt", "1b. Writer: user message template" and "2. Repair turn" (stop reading at "## 3."), and the three fact tables B/facts-cooper.json, B/facts-mira.json, B/facts-nyx.json. Do NOT read spec.md, rubric.md, the examples folder, any other file in B, or anything in the repo. Do not look at other runs in B/out.

For each fixture (cooper, mira, nyx), independently:
1. Build the user message per §1b (the fact table minus `excluded_from_model` and `source`; report date as stated in the table if present, else 2026-07-02).
2. Write the summary as the writer system prompt instructs: return only the JSON object it specifies. Save it to B/out/RUN-FIXTURE-attempt1.json (RUN is given to you below).
3. Run: python3 -I B/verify.py B/facts-FIXTURE.json B/out/RUN-FIXTURE-attempt1.json
4. If it fails (exit 1), do the §2 repair turn exactly once: rewrite the whole summary given the verifier's `errors`, save as B/out/RUN-FIXTURE-attempt2.json, and run the verifier on it.
5. Write B/out/RUN-FIXTURE-result.json: {"run":RUN,"fixture":...,"attempts":N,"final_pass":true|false,"final_file":"..."}.

Write each fixture fresh, as if it were a separate API call. Do not tune toward any guess about how the output will be judged; write the best paragraph the system prompt asks for. Final message: one line per fixture with attempts and pass/fail.
