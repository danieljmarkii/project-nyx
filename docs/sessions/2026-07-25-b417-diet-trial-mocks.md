# B-417 diet trial — the mock round (design, docs-only)

**Date:** 2026-07-25

The §0.4 gate between spec v0.97 and v1.0: `docs/nyx-diet-trial-mockups.html`, also published as an artifact for review. PRs 3–7 were blocked on it, and **PR 4 additionally carried the C4 ruling, which was deliberately deferred *to* this round** so the call is made against a real artifact rather than a description.

Three surfaces drawn — the start-a-trial modal (§4.1), the trial card v2 in every state (§4.2), the completion milestone (§4.3) — plus **§7's trial block in the two C4 variants**, in the vet report's own register, with the scan cost measured (+4 lines, +38% block height). C5's symptom-trend-against-logging-density render is held constant across both. Everything is drawn against R1 (no negative claim about off-diet foods at any coverage) and R2 (no blended metric in any form, including bar width); the deck opens by drawing what those two rules *delete*, because the shipped compliance-bound bar and its replacement are visually identical on a good week — which is exactly why the old string-only acceptance criterion would have passed the bug.

**A `pm-feature-review` pass as Jordan then earned the round three times over.** Three defects fixed:

- **§7 rendered "168 permitted feedings" inside a total of 84 logged feedings** — in *both* C4 variants, i.e. in the artifact the PM is asked to rule on, on the surface whose entire job is credibility. §5.3's 28-day DentaStix example had been pasted into a 45-day scenario.
- **State 7b rendered the clean-trial statement over a pet that refused the diet** — the canonical §5.2 proof-#1 failure, and a breach of PR 5's AC that a refused trial renders no clean-trial statement *anywhere*. **The fix is a rule change, not a copy change:** §5.2's composition rule was drawn as a *live-flag* replacement only, so it never reached the terminal states. A trial whose `stopped_reason` is refusal must be structurally incapable of rendering an adherence line.
- Two end dates for one trial in the start flow — and those are the strings PR 3's fixtures get lifted from.

Three missing surfaces added: the **allowed-set read-back** (D3 was ratified partly on the set being *"a re-readable rule list"* and nothing rendered it — worse, the only path to add a permitted food was the rung-3 flag, so complying with your vet required feeding the thing and getting flagged first), the **off-diet list** (the most-tapped affordance had no destination), and **§5.6's multi-pet scope caveat** — the eleventh state.

**Fourteen items back to the PM** (7 from the drawing, 7 from the review), three PR 1-timed while the schema is free at zero live rows, two touching **LOCKED** copy:

- **C4** — rec three of the four; any ruling must keep the interpretability row or G2's floor loses its only consequence.
- **`diet_class`** is not in migration 040 and only partly derivable — **there is no hydrolyzed flag anywhere in the schema**, and hydrolyzed is the class the clinical argument turns on.
- **A-2 (`paused`)**, **A-3** (drawn), the **species × indication table with no cat cells** (PR 3 cannot build the lookup it is required to build), the **undefined coverage floor** state 4 depends on, §8's Home-Trend ruling.
- **LOCKED #1:** the headline welds a treat-inclusive feeding count to a non-treat-only day ratio — false on 15.7% of live covered days.
- **LOCKED #2:** the blind-spot qualifier still says flavoured medications aren't visible, after C3 ruled them detected; on the vet report that tells Dr. Chen to discount a line in his own Appendix C.

Also found: **§4.2's "seven states" is eleven** — eight numbered plus three conditional *replacements* (§5.2 intake-decline, §5.6 free-fed and multi-pet). All three are the states most likely to ship broken, because the bug they prevent is a normal-looking card rendering over an abnormal pet. PR 4's AC undercounts by four.

Tier-2 spec edits proposed, not written. Docs only — no app code, no schema, no deploy. Shipped via #443.
