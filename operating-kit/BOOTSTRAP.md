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
- `BRAND_PRINCIPLE`: the one non-negotiable value rule (the predecessor's was "Pets > $: core care is always free; premium wraps convenience, never care"). Ask what this product must never charge for or compromise. From the answer, derive `MONETIZATION_PRINCIPLE_TITLE`, `MONETIZATION_PRINCIPLE` and `MONETIZATION_TEST` for principle 7.
- `ENTITY`: the core object the user cares for or works on (the predecessor's was a pet). Is there a multi-entity case (a user with two)?
- Consumer or professional? Mobile, desktop, or both? This decides how much of the principles and voice must be **rewritten rather than filled** (they came from a consumer mobile app).

**Round B: the people** (the most important round; the personas are the kit's engine)
- `PRIMARY_USER`: name, `PRIMARY_USER_SKETCH`, `PRIMARY_USER_NEEDS`, `PRIMARY_USER_DONT_WANT`, `PRIMARY_USER_QUESTION`, the `TIME_TEST` (the predecessor's: "can I log this in under 10 seconds while my dog is being weird?"; a desk tool's might be "can I clear 50 lines before my next call?"), and the `STRESS_MOMENT` (the predecessor's: 3am, one-handed, pet mid-incident; a desk tool's: month-end close with 400 open items).
- `SECONDARY_USER`: the *ambiguity* user, who cannot tell the benign case from the dangerous one and whom false reassurance would hurt most: `SECONDARY_USER_SKETCH`, `SECONDARY_USER_NEEDS`, `SECONDARY_USER_DONT_WANT`, `SECONDARY_USER_QUESTION`.
- `DOMAIN_EXPERT`: the professional who consumes what the product produces; `EXPERT_ARTIFACT` (the predecessor's was the vet report); `EXPERT_KEY_QUESTION`, `EXPERT_NEEDS`, `EXPERT_DONT_WANT`; for the cold read, `EXPERT_SCENE`, `SCAN_BUDGET` (e.g. "60-second") and `EXPERT_SCAN_CHECKLIST`.
- No expert consumer or no produced artifact? Drop `expert-cold-read`, the `expert` lens and the routing rows naming it, and fold the expert into the Data Scientist.

**Round C: safety, stakes and law**
- `DOMAIN_SAFETY_INVARIANTS`: what the product must never assert, and which errors are asymmetric (the predecessor: "a single sample may escalate, never reassure"; "declining appetite is a health signal, never 'picky'"). Every high-stakes domain has at least one.
- `DOMAIN_FAILURE_MODES` (for `adversarial-reviewer`), `DOMAIN_ATTACK_SURFACES` (for `security-privacy-reviewer`), `DOMAIN_DATA_ANTI_PATTERNS` (Data Scientist) and `DOMAIN_EXAMPLE_OF_THE_ASYMMETRY` (for `ai-output-guardrails`).
- **The regulatory regime** (health privacy, financial data rules, SOC 2, app-store rules, audit-trail requirements, data residency). It feeds the attack surfaces, the hard constraints and the Trust & Safety persona; the predecessor learned its platform rules late.
- Does the product put model output in front of users? If not, drop `ai-output-guardrails`.

**Round D: the machinery and the PM**
- `STACK`, `LANGUAGE_RULES`, `STRUCTURE_RULES`, `TEST_STACK`, `HARD_CONSTRAINTS` (architecture decisions enforced without PM confirmation), `ENV_CONVENTIONS`.
- `TRACKER` / `TRACKER_TEAM` / `ISSUE_PREFIX` (default: Linear, a new team). `REPO` (owner/repo).
- `DESIGN_BENCHMARKS` and `ENG_BENCHMARK` (the predecessor's: "Calm, Linear, Oura"; "a senior engineer at Linear").
- How the PM sees a pushed change (`RUNTIME_A_NAME`, `RUNTIME_A_COMMANDS`, and `RUNTIME_B_NAME` or delete runtime B).
- `PM_COMMUNICATION_PREFERENCES` (the predecessor's PM: confident and concise, plain-English TL;DRs, decisions as briefs with a recommendation, no em dashes in prose).

**Derived or defaulted, not asked** (fill from the answers above or the repo; list each choice in the PR body so the PM can veto it):

| Placeholder | Source |
|---|---|
| `PRINCIPLES_ONE_LINE_EACH`, `THREE_ONE_LINE_THESES`, `TONE_TYPE_COLOUR_MOTION_ICONOGRAPHY`, `ONBOARDING_BUDGET`, `TIME_BUDGET` | Drafted from Rounds A–B into `docs/design-principles.md`, status DRAFT until the PM ratifies |
| `VOICE_ONE_LINE`, `NAMING_RULE` | Drafted from Round B and `PM_COMMUNICATION_PREFERENCES` |
| `STACK_CONVENTIONS`, `STACK_CONSTRAINTS`, `STACK_ANTI_PATTERNS`, `MIGRATIONS_DIR`, `INSTALL_COMMAND` | From the stack; `TBD` if the repo has no code yet |
| `SETUP_TOOLCHAIN`, `INSTALL`, `TYPECHECK`, `TEST`, `TEST_COMMAND`, `CHECKOUT_SHA`, `CHECKOUT_VERSION` | From the stack; look up the current `actions/checkout` release SHA |
| `PRIMARY_VIEWPORT`, `DESIGN_LANGUAGE_BULLET`, `REPO_PATH` | design-critique only; fill when it is installed |
| `CURRENT_PHASE`, `WHAT_IS_INSTALLED_OR_DEPLOYED_AND_KNOWN_TRAPS`, `DATE` | Today's state |
| `ADD_ROWS_AS_SPECS_APPEAR` | Delete the row; add real rows as specs are written |
| `CEILING_BYTES` | The installed CLAUDE.md's `wc -c`, measured **after** every TBD above is resolved or recorded |

Anything the PM defers: leave a clearly marked `TBD (asked YYYY-MM-DD)` and an Open Questions row, never a guess.

## §3 Install (the file map)
`dot-claude/` becomes `.claude/` (it is named `dot-claude` in the kit so project-nyx's own Claude Code does not load the kit's skills and commands as its own). **Install in two tiers**: what earns its keep on day one, and what waits until there is something to run it on. Installing machinery before it has work to do is the ceremony the predecessor spent two retros cutting.

**Day one**
| Kit path | Installs as | Notes |
|---|---|---|
| `CLAUDE.template.md` | `CLAUDE.md` | Fill every placeholder; delete template guidance comments. If no test runner exists yet, the ratchet sentence stays (it says "installed with the first test runner") |
| `STATUS.template.md` | `STATUS.md` | Pointer card |
| `docs/personas.template.md` | `docs/personas.md` | Delete the specialist lenses and their routing row unless a design-heavy track is live |
| `docs/design-principles.template.md` | `docs/design-principles.md` | DRAFT until the PM ratifies each principle |
| `docs/operating-model.md`, `docs/engineering-lessons.md`, `docs/git-first-aid.md`, `docs/decisions-archive.md`, `docs/dev-handoff-runbook.md` | same paths | Delete engineering-lessons Tier B sections that do not match the stack (e.g. React Native if there is none) |
| `docs/sessions/`, `docs/research/`, `docs/retros/`, `docs/templates/` | same paths | As-is |
| `dot-claude/agents/*` | `.claude/agents/*` | Drop what §2 ruled out |
| `dot-claude/commands/{kickoff,wrap,handoff,pm-review,retro}.md` | `.claude/commands/` | |
| `dot-claude/skills/*` | `.claude/skills/*` | `_skill-template/SKILL.md.template` goes to `docs/templates/skill-template.md` instead |
| `dot-claude/hooks/session-start.sh`, `dot-claude/settings.json` | `.claude/…` | `chmod +x` the hook; merge settings if one exists |
| `github/PULL_REQUEST_TEMPLATE.md` | `.github/PULL_REQUEST_TEMPLATE.md` | |

**When first needed** (install the command and its machinery together, never one without the other)
| Trigger | Install |
|---|---|
| The first test runner | `guards/claudeMdBudget.test.ts.template` → `guards/claudeMdBudget.test.ts`; `github/workflows/ci.yml.template` → `.github/workflows/ci.yml`; then the `main` ruleset (§4) |
| The first source-scanning guard | `guards/fixtureRoot.ts.template`, `guards/blankComments.ts.template` (drop `.template`) |
| The first mock round | `dot-claude/commands/design-critique.md` + `dot-claude/workflows/design-critique.js` + `scripts/design-critique/render.mjs` (needs Playwright + Chromium; for a desktop product pass `--frames` and adjust the widths). If the specialist lenses were deleted, delete `motion` and `ia` from the workflow's library too |
| The first multi-PR run order in a tracker project | `dot-claude/commands/dispatch.md` |
| The first backlog grooming pass | `scripts/groom/*` (set the watermark to `git rev-list --count origin/main`) |

**Never installed:** the kit's own `README.md`, `BOOTSTRAP.md`, `guards/README.md` and `github/README.md` (fold anything useful from the last two into `docs/engineering-lessons.md`).

## §4 Tracker setup, in this order
Most steps are the PM's. Until step 1 is done there is no `Needs PM` state, so list steps 1–4 in the install PR's body as a checklist, then move each remaining one into an issue in `Needs PM` once the state exists.
1. **Create the workflow states:** `Needs PM` (type *unstarted*, after Todo) and `In Review` (type *started*) if the team lacks it. `Needs PM` must be a **state, not a label**: a state is exclusive and vacates on close, so "closed and still queued" becomes impossible. The predecessor used a label and it grew from 10 to 144.
2. **Labels:** `Area: *` (one per major surface) for project-less issues, and `Quick Win` for the groomer. No catch-all project.
3. **The coding-tool prompt template** ("copy as prompt"). Keep it a thin router; every rule lives in CLAUDE.md:
   > You are working on {{ISSUE_PREFIX}}-NNN. Follow CLAUDE.md § Session Protocol exactly: claim first (state + claim comment naming your branch), orient, name the mode (BUILD: plan before non-trivial code; DISCOVERY: a brief, never the build), close with /wrap. The issue description and its comments are the spec; newest comment wins. Reference the issue in the PR; attach it only if this PR finishes it.
4. **GitHub:** the tracker↔GitHub integration on; once CI exists, a `main` ruleset requiring its checks with an **empty bypass list**.

## §5 Verify, then ship as one PR
- `grep -rnE '\{\{[A-Z_]+\}\}|@<sha>' . --include='*.md' --include='*.sh' --include='*.js' --include='*.mjs' --include='*.ts' --include='*.yml' --include='*.json'` returns nothing (every placeholder filled or explicitly `TBD`).
- `bash .claude/hooks/session-start.sh` prints the orientation block without error.
- If guards are installed: they pass, and the ratchet is proven by mutation (add 3 KB to CLAUDE.md, watch it red, remove it).
- Write the first session record, `docs/sessions/YYYY-MM-DD-operating-kit-install.md`: what was adopted, adapted, dropped and deferred, and why.
- Open ONE PR, non-draft, with the whole install. Its body lists every derived placeholder value (so the PM can veto), every kit file dropped or deferred, and the §4 checklist.

## §6 What to adapt, not copy
- **The laws are portable; the thresholds are not.** "Retro every 10 sessions", "check-in at most one, ~90 min out", "claim stale after 24h / branch tip 14 days" were tuned to one PM running ~3 sessions a day. Keep the mechanism; tune the numbers in the first retro.
- **Start lean.** The predecessor's manual reached 136 KB. This one starts near 20 KB and the ratchet holds it there; add a rule only when a real incident earns it, and pay for it with a deletion.
- **Rewrite, don't fill, where the product differs in kind.** The principles and the voice came from a consumer mobile app. For a professional or desktop product, rewrite them from Round A–B answers.
- **Two staleness thresholds, two jobs.** A claim >24h old with no PR and no recent commit is *stale* (a new session may take it over, `/kickoff`); a branch tip >14 days old is *abandoned* (the groomer resets the issue). Tune both at the first retro.
- **Earn each guard.** Do not port the predecessor's domain guards. Port the guard *discipline*; write this project's first guard the first time a rule is broken twice.
