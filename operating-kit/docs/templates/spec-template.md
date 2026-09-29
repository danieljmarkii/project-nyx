# {{Feature}}: Requirements

**Version:** 0.1, DRAFT  <!-- DRAFT → BUILD-READY → DECOMPOSED → IN BUILD; version lives here, never in the filename -->
_One sentence on what this version records._
**Last Updated:** YYYY-MM-DD · **Issue:** {{ISSUE_PREFIX}}-NNN · **Project:** <tracker project>
**Design authority:** `docs/<product>-<surface>-mockups.html`, round N (one URL for every round)
**Evidence:** `docs/research/YYYY-MM-<topic>.md` 🧊 · **Read with:** <sibling specs>

**Read this when:** <surfaces, modules and concepts that should make a session open this spec>.
**How to read this doc:** §0 is the decision record; §2 is settled; §9 is the run order. Text struck by earlier revisions is in git at `<sha>`.

---

## §0 Decision record
A build session never reconstructs why a rule exists.

### §0.1 Stakeholder rulings (binding)
| # | Ruling (quote the PM verbatim) | Consequence |
|---|---|---|
| R1 | | |
<!-- Overruled dissents are recorded in the row: "dissent recorded as overruled: …" -->

### §0.2 Briefs
| # | Deciding | Options (recommendation marked) | Gates (§) | Status |
|---|---|---|---|---|
| L-1 | | | | open / RULED (R-n) / RE-OPENED |

### §0.3 Team rulings (each individually vetoable, none silent)
- T-1 …

### §0.4 Team verdict (when isolated persona interviews ran)
Tally: N BUILD · N BUILD WITH CONDITIONS · N DON'T BUILD.
| Condition | Named by | Where it landed |
|---|---|---|

### Decisions left to the issue ("Decide on the fly")
Low-stakes calls delegated to build time. Each build issue carries a *Decide on the fly* section with the team's default marked ✓, so nothing is decided silently and nothing blocks a start.

---

## §1 What this is / what it is not
One paragraph each. **Out of scope, filed rather than folded:** each item with its issue ID.

## §1b The job and the user moment
The job before / during / after; why it matters to the wedge; one narrated moment in the user's real context.

## §2 The floor (settled invariants)
Numbered. **Re-open only with a named counterexample.** Items added later are attributed ("added by the adversarial pass").

## §3 Never-say rules
`N1…Nn`: the invariant and why it exists, inherited or new. Each gets a test in §8.

## §4 Guardrail spine
`G1…Gn`: the few non-negotiables every PR in this track must honour.

## §5 What exists today (code audit)
Premises verified at `file:line`, dated. A premise that turns out false becomes its own prerequisite PR.

## §6 Evidence: conclusions
2–5 bullets per lane (competitive, legal / T&S, technical feasibility), each pointing at the frozen brief.

## §7 The proposal
Subsections keyed to the mock's frame IDs (A1, A2b, B1…), each written to the rule that enforces it.
- **Data model and architecture:** schema, sync, the flag, the guards it must meet and the one it adds.
- **Security / privacy / consent:** what crosses a boundary; soft vs hard delete; questions only counsel can answer.

## §8 Acceptance criteria
Numbered, each testable, each naming its assertion shape ("a test over the resolver output, not review"; "run red by rendering one new element flag-off").

## §9 PR plan / run order
| PR | Issue | Scope | After (merged PRs only) | Deploy need | Decide on the fly (default ✓) |
|---|---|---|---|---|---|

- **Critical path:** PR-01 → PR-03 → PR-05
- **Parallel lanes:** (disjoint files)
- **Never at the same time:** `A → B → C` strictly in order; `D, E, one at a time`
- **The one shared file to expect a collision on:**
- **Held, and on what:**
- **Why a PR is split the way it is:**
- **Reviews owed:** adversarial / security-privacy / voice / product walk, per PR

## §10 Per-session kickoff prompts
One 1–3 sentence prompt per PR: the § to build from, the mock round, "check the issue's *Decide on the fly* and §0 before deviating from any frame".

## §11 Persona positions and recorded conflicts
One line per lens with its conditions. Conflicts: **Lens A:** … / **Lens B:** … / **Decision needed at <PR>:** options.

## §12 Open questions raised here
`Q-n` with status: RESOLVED / PROVISIONAL TEAM CALL (gates nothing) / MOOT / belongs to another track.

## §13 Parked (not dropped)
Each with its home.

## §14 Proposed edits to other docs (Tier 2)
Each "proposed, gated on X" or "lands with PR Y". None written without approval.

## §15 Persona sign-off
Per round: `Designer ✓ (what was verified) — Expert ✓ — Data ✓ …`. Adversarial passes quote their "tried X → held / BROKE" lines.

---

**Errata convention.** Never silently rewrite. Mark corrections inline where they bind: **⚠ vN.N, E-17:** (a review erratum), **⚠ RULED YYYY-MM-DD (issue):** (a later ruling), **⚠ AMENDED YYYY-MM-DD (issue):** (a changed criterion). The superseded wording stays readable or is named as superseded.
