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
| `dot-claude/commands/dispatch.md` | same, v1.4 | Repo, tracker and project values are placeholders; ships the prose without `scripts/dispatch/` (§ What `/dispatch` needs, below) |
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

## What `/dispatch` needs

`/dispatch` (and `/wrap --dispatched`, the close-out its children run) is the predecessor's v1.4. It is a tier-two install: it earns its keep at the first run order of more than a handful of PRs. Before the first run it needs:

- **Three MCP servers:** the tracker (projects with a description, project status updates, issue relations and `patch` edits; the tool names are Linear's), GitHub, and Claude Code Remote (`create_session`, `get_session`, `send_message`, `send_later`, `list_triggers`).
- **The `steward` skill and `scripts/steward/merge-check.sh`.** Every child merges through its §7 gate and every wake reads its §2 and §8. **Neither is in this kit yet**; port them from the predecessor before a child is allowed to merge.
- **`scripts/dispatch/`, optionally.** The predecessor's tested script does the deterministic half (selection, the cap, the Board, the status lines). It does not ship here, because its tests replay the predecessor's own plan pages; until a project writes or ports one, the command's § Without the script says how those steps run by hand.
- **Tracker states `Needs PM` and `In Review`**, `/kickoff`'s claim step, the `adversarial-reviewer`, `security-privacy-reviewer` and `product-voice` names, and a plan page in the command's § Page format. The *teach row* needs a learning skill and is inert without one.
- **These placeholders filled:** `{{TRACKER}}`, `{{TRACKER_TEAM}}`, `{{ISSUE_PREFIX}}` and its lowercase `{{ISSUE_PREFIX_LOWER}}`, `{{REPO}}`, `{{PM_TIMEZONE}}` (overnight and daytime rules), `{{DISPATCH_START_DATE}}` (the install date; older issues are never offered as rows), `{{SESSION_CAP}}` (sessions in flight across the repo; the predecessor settled on 6), `{{PRODUCTION_PATHS}}` (what deploys on merge), `{{HOTSPOT_FILES}}` (files only one session may edit at a time), `{{MIGRATIONS_DIR}}` and `{{SAFETY_SURFACE}}` (the domain word for a surface that plan-gates a row, e.g. *clinical*).

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
