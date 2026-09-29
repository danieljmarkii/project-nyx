# BOOTSTRAP: installing the operating kit in a new project

**Who reads this:** the first Claude Code session in the new repository. The PM pastes the prompt in §0; everything after it is instructions for that session.

---

## §0 The prompt the PM pastes into the new project's first session

> We're starting a new project, and I want it to run on the operating model we built in project-nyx: the product team personas, the review subagents, the slash commands, the session rituals, and the lessons behind them. The kit lives in `danieljmarkii/project-nyx` under `operating-kit/` (on `main`; if it isn't merged yet, on branch `claude/wonderful-volta-u3m93u`). Attach that repo read-only, read `operating-kit/BOOTSTRAP.md` and `operating-kit/README.md`, and follow BOOTSTRAP from §1. Interview me before you fill anything in; don't guess the domain. Deliver the installed kit as one PR.

---

## §1 Get the kit (read-only)
1. Attach `danieljmarkii/project-nyx` with read access (`add_repo`, access `read`). Do not push to it.
2. Clone it outside this repo (e.g. into your scratchpad) and check out `main`; if `operating-kit/` is absent there, check out `claude/wonderful-volta-u3m93u`.
3. Read, in this order: `operating-kit/README.md`, `operating-kit/docs/operating-model.md`, `operating-kit/CLAUDE.template.md`, `operating-kit/docs/personas.template.md`. You are installing a way of working; understand its *why* before copying its *what*.

## §2 Interview the PM (before writing anything)
Ask in **four short rounds**, each as a decision brief with your recommended default marked, so the PM can answer "yes, default" to most of it. Use `AskUserQuestion` where options are discrete. Do not ask anything you can infer from the repo or an earlier answer.

**Round A: the product**
- `PRODUCT` name; `PRODUCT_PARAGRAPH` (what it is and the core insight, 3–5 sentences).
- `WEDGE`: the single highest-intent user and moment the product serves first.
- `BRAND_PRINCIPLE`: the one non-negotiable value rule (the predecessor's was "Pets > $: core care is always free; premium wraps convenience, never care"). Ask what this product must never charge for or compromise.
- `ENTITY`: the core object of care / work (the predecessor's was a pet). Is there a multi-entity case (a user with two)?

**Round B: the people** (the most important round; the personas are the kit's engine)
- `PRIMARY_USER`: name, sketch, needs, doesn't-want, key question, and the `TIME_TEST` (the predecessor's: "can I log this in under 10 seconds while my dog is being weird?"), plus the `STRESS_MOMENT` (their 3am-one-handed moment).
- `SECONDARY_USER`: the *ambiguity* user, who cannot tell the benign case from the dangerous one, and whom false reassurance would hurt most.
- `DOMAIN_EXPERT`: the professional who consumes what the product produces; `EXPERT_ARTIFACT` (the predecessor's was the vet report); `EXPERT_KEY_QUESTION`; `EXPERT_SCENE` and `EXPERT_SCAN_CHECKLIST` for the cold read.
- If there is no expert consumer or no produced artifact: say so, and you will drop `expert-cold-read` and fold the expert into the Data Scientist.

**Round C: safety and stakes**
- `DOMAIN_SAFETY_INVARIANTS`: what the product must never assert, and which errors are asymmetric (the predecessor: "a single sample may escalate, never reassure"; "declining appetite is a health signal, never 'picky'"). Every high-stakes domain has at least one.
- `DOMAIN_FAILURE_MODES` (for `adversarial-reviewer`) and `DOMAIN_ATTACK_SURFACES` (for `security-privacy-reviewer`): the specific ways the logic and the boundaries could fail here.
- Does the product put model output in front of users? If not, drop `ai-output-guardrails` (keep the file in the kit's history, not the repo).

**Round D: the machinery**
- `STACK`, `LANGUAGE_RULES`, `STRUCTURE_RULES`, `TEST_STACK`, `HARD_CONSTRAINTS` (the architecture decisions that need no PM confirmation to enforce), `ENV_CONVENTIONS`.
- `TRACKER` / `TRACKER_TEAM` / `ISSUE_PREFIX` (default: Linear, a new team). `REPO` (owner/repo).
- `DESIGN_BENCHMARKS` and `ENG_BENCHMARK` (the predecessor's: "Calm, Linear, Oura"; "a senior engineer at Linear").
- Runtimes for the handoff (`RUNTIME_A_*`): how does the PM see a pushed change?
- The PM's communication preferences (the predecessor's PM: plain-English TL;DRs, decision briefs, no em dashes in prose, confident and concise).

Anything the PM defers: leave a clearly marked `TBD (asked YYYY-MM-DD)` in the file and an Open Questions row, never a guess.

## §3 Install (the file map)
Copy from the clone into this repo. `dot-claude/` becomes `.claude/` (it is named `dot-claude` in the kit so project-nyx's own Claude Code does not load the kit's skills and commands as if they were its own).

| Kit path | Installs as | Notes |
|---|---|---|
| `CLAUDE.template.md` | `CLAUDE.md` | Fill every placeholder; delete template guidance comments |
| `STATUS.template.md` | `STATUS.md` | Pointer card |
| `docs/personas.template.md` | `docs/personas.md` | Delete specialist lenses unless a design-heavy track is live |
| `docs/design-principles.template.md` | `docs/design-principles.md` | Status DRAFT until the PM ratifies each principle |
| `docs/operating-model.md`, `docs/engineering-lessons.md`, `docs/git-first-aid.md`, `docs/decisions-archive.md`, `docs/dev-handoff-runbook.md` | same paths | Lessons and model as-is; runbook filled |
| `docs/sessions/`, `docs/research/`, `docs/retros/`, `docs/templates/` | same paths | READMEs and templates as-is |
| `dot-claude/agents/*` | `.claude/agents/*` | Fill placeholders; drop what §2 ruled out |
| `dot-claude/commands/*` | `.claude/commands/*` | |
| `dot-claude/skills/*` | `.claude/skills/*` | `_skill-template/` stays a template (keep the `.template` suffix, or move it to `docs/templates/`) |
| `dot-claude/hooks/session-start.sh` | `.claude/hooks/session-start.sh` | `chmod +x`; fill `{{INSTALL_COMMAND}}` |
| `dot-claude/settings.json` | `.claude/settings.json` | Merge if one exists |
| `dot-claude/workflows/design-critique.js` | `.claude/workflows/design-critique.js` | Fill the lens library placeholders; install only when the first mock round exists |
| `scripts/design-critique/render.mjs` | same | Needs Playwright + Chromium |
| `scripts/groom/*` | same | Set the watermark to the current `git rev-list --count origin/main` |
| `guards/*.template` | `guards/*` minus `.template` | Only once a test runner exists; set `CEILING_BYTES` to the installed CLAUDE.md's `wc -c` |
| `github/PULL_REQUEST_TEMPLATE.md` | `.github/PULL_REQUEST_TEMPLATE.md` | |
| `github/workflows/ci.yml.template` | `.github/workflows/ci.yml` | Fill steps for the stack |

## §4 Tracker setup (most of this is the PM's; file each as a `Needs PM` issue with the single step first)
1. **Create the `Needs PM` workflow state** (type *unstarted*, positioned after Todo). It must be a **state, not a label**: a state is exclusive and vacates on close, so "closed and still queued" becomes impossible. The predecessor used a label and it grew from 10 to 144 items.
2. **`Area: *` labels** for project-less issues (one per major surface). No catch-all project.
3. **The coding-tool prompt template** ("copy as prompt"). Keep it a thin router; every rule lives in CLAUDE.md:
   > You are working on {{ISSUE_PREFIX}}-NNN. Follow CLAUDE.md § Session Protocol exactly: claim first (state + claim comment naming your branch), orient, name the mode (BUILD: plan before non-trivial code; DISCOVERY: a brief, never the build), close with /wrap. The issue description and its comments are the spec; newest comment wins. Reference the issue in the PR; attach it only if this PR finishes it.
4. **GitHub:** the Linear↔GitHub integration on; after CI lands, a `main` ruleset requiring the CI checks with an **empty bypass list**.

## §5 Verify, then ship as one PR
- `grep -rnE '\{\{[A-Z_]+\}\}' . --include='*.md' --include='*.sh' --include='*.js' --include='*.ts' --include='*.yml'` returns nothing (every placeholder filled or explicitly `TBD`).
- `bash .claude/hooks/session-start.sh` prints the orientation block without error.
- The guards (if installed) pass, and the ratchet is proven by mutation: add 3 KB to CLAUDE.md, watch it red; remove it.
- Write the first session record, `docs/sessions/YYYY-MM-DD-operating-kit-install.md`, naming what was adopted, adapted and dropped, and why.
- Open ONE PR with the whole install. Its body lists every placeholder decision and every kit file deliberately dropped.

## §6 What to adapt, not copy
- **The laws are portable; the thresholds are not.** "Retro every 10 sessions", "check-in at most one, ~90 min out", "claim stale after 24h / branch tip 14 days" were tuned to one PM running ~3 sessions a day. Keep the mechanism; tune the numbers in the first retro.
- **Start lean.** The predecessor's manual reached 136 KB. This one starts near 20 KB and the ratchet holds it there; add a rule only when a real incident earns it, and pay for it with a deletion.
- **Earn each guard.** Do not port the predecessor's domain guards. Port the guard *discipline*; write this project's first guard the first time a rule is broken twice.
