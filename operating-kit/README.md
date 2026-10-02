# The operating kit

Everything project-nyx learned about **how a PM and a fleet of Claude Code sessions build a product together**, extracted so a new project in a different domain can start at the mature state instead of re-learning it. The product content (pets, vets, Expo, Supabase) is stripped out; the team, the rituals, the review machinery and the hard-won lessons are kept.

**To start a new project with it:** paste the prompt in [`BOOTSTRAP.md`](./BOOTSTRAP.md) §0 into the new repo's first Claude Code session. That session interviews you about the new domain, fills the templates, and installs everything as one PR.

This directory is inert inside project-nyx: its Claude config lives under `dot-claude/` (not `.claude/`), and its code files carry a `.template` suffix, so nothing here loads, type-checks or runs in this repo.

---

## What's in it

### The team
| Kit file | From project-nyx | What changed |
|---|---|---|
| `docs/personas.template.md` | `docs/personas.md` | 10 personas generalized. Jordan → `{{PRIMARY_USER}}` (the wedge user), Sam → `{{SECONDARY_USER}}` (the ambiguity user), Dr. Chen → `{{DOMAIN_EXPERT}}`; universal anti-patterns and edge cases kept; routing table kept; guards added as a fourth tier |
| `dot-claude/agents/adversarial-reviewer.md` | same | Universal failure modes (washout, pseudoreplication, absence ≠ absence, n=1, window vs record, partitions, clocks) + a domain slot |
| `dot-claude/agents/security-privacy-reviewer.md` | `rls-privacy-reviewer.md` | Stack-neutral; adds the error-message side channel and id-paired-with-owner rules |
| `dot-claude/agents/expert-cold-read.md` | `vet-report-cold-read.md` | Any expert reading any rendered artifact cold |
| `dot-claude/agents/pm-feature-review.md` | same | Generalized to the new users and principles |
| `dot-claude/agents/code-reviewer.md` | same | Adds a test-honesty category |

### The rituals
| Kit file | From | What changed |
|---|---|---|
| `dot-claude/commands/kickoff.md`, `wrap.md`, `handoff.md`, `pm-review.md` | same | `Needs PM` is a **state** from day one; one-PR-per-session and attachment rules folded in |
| `dot-claude/commands/dispatch.md` | same | Repo and tracker parameterized |
| `dot-claude/commands/design-critique.md` + `dot-claude/workflows/design-critique.js` + `scripts/design-critique/render.mjs` | same | Lens library rewritten with domain slots |
| `dot-claude/commands/retro.md` | **new** | The retro existed only as prose in project-nyx and never fired; now a command |
| `dot-claude/hooks/session-start.sh` | extended | **Computes** `RETRO DUE`, unshallows the clone, prints the manual's budget. project-nyx's hook only ran `npm install` |

### The invariants
| Kit file | From | What changed |
|---|---|---|
| `dot-claude/skills/ai-output-guardrails/` | `clinical-guardrails` | The 10 structural patterns behind "escalate on presence, never reassure on absence", domain-neutral |
| `dot-claude/skills/product-voice/` | `nyx-voice` | The 8 voice patterns as a template to ground in shipped strings |
| `dot-claude/skills/backlog-groomer/` | same | Condensed; every measured failure kept |
| `dot-claude/skills/_skill-template/` | new | The skill-authoring format (RULE / CANONICAL EXAMPLE / ANTI-PATTERN / Ambiguities) |
| `guards/` | `claudeMdBudget`, `fixtureRoot`, `blankComments` | The CLAUDE.md byte ratchet and the guard-writing infrastructure |

### The manual and the knowledge
| Kit file | What it is |
|---|---|
| `CLAUDE.template.md` | The operating manual, ~20 KB (project-nyx's is 136 KB): roster, principles, constraints, conventions, session protocol, decision briefs, DoD, git and tracker rules, doc tiers, backlog protocol |
| `docs/operating-model.md` | **Why** every rule exists: 12 laws, the ritual→pain→evidence table, the ceremony that was cut, tracker mechanics that bit, token hygiene |
| `docs/engineering-lessons.md` | ~110 portable engineering laws distilled from project-nyx's 44 conventions: Tier A universal, Tier B stack-conditional, Tier C how to prove a check works |
| `docs/design-principles.template.md` | The seven principles, domain-neutral, with the principle-writing format |
| `docs/templates/` | Spec template (§0 decision record → run order → kickoff prompts), research-brief template (frozen + §V corrections), mock-round protocol |
| `docs/sessions/`, `docs/research/`, `docs/retros/` READMEs | One-file-per-session, evidence-not-decisions, and the retro log |
| `STATUS.template.md`, `docs/decisions-archive.md`, `docs/dev-handoff-runbook.md`, `docs/git-first-aid.md` | The pointer card, the archive, the handoff runbook, the git symptom → fix guide |
| `github/` | PR template and CI template (SHA-pinned actions, timezone leg) |
| `scripts/groom/` | The preflight that refuses to reason over a shallow clone |

---

## Built in from day one (project-nyx's unsolved problems, not inherited)
1. **`Needs PM` is a workflow state, not a label.** The label grew 10 → 144. (The predecessor kept its label by PM ruling on 2026-10-02 and drains it with a groomer step instead, because migrating 150 live items cost more than the state saved. A new team pays no migration, so start with the state.)
2. **The retro trigger is computed by the hook**, not written as prose.
3. **A session with no work PR opens its record-only PR non-draft**, so lessons do not strand on a draft branch.
4. **Tracker close-on-merge is a known mechanic:** attach only what a PR finishes, never an ID range in a title, one sub-issue per PR.
5. **The manual starts lean under a ratchet**, instead of being trimmed after it hurts.

## Deliberately left behind
Every product spec, mock, research brief and domain guard; the Expo / EAS / Supabase runbooks and the edge-deploy pipeline (its *hold manifest* and *the deployer writes its own record* ideas are in `operating-model.md`); the pet-specific clinical invariants in their literal form (their general shape is `ai-output-guardrails`).

## Keeping it current
The kit is a snapshot of project-nyx on 2026-09-29. When project-nyx learns a lesson that is not about pets, add it here too (a new law in `operating-model.md` or a new tier entry in `engineering-lessons.md`), so the next project starts from the newest floor.
