# The operating model — why every rule in this repo exists

**Status:** 🌱 living. Seeded from a predecessor project (a mobile health app built by one human PM and many Claude Code sessions, May → September 2026: ~1,000 merged PRs, ~500 session records, two formal process retros). This file is the *why*. CLAUDE.md is the *what*. Read this once at setup and whenever a rule feels like ceremony: the incident behind it is here.

---

## 1. The shape of the collaboration

- **One human PM** owns vision, every final call, merges, hands-on checks and rulings. The PM reads plainly and rules from short briefs.
- **Claude operates as a simulated product team**: ~10 personas in context, isolated subagents for adversarial reviews, auto-loaded skills for invariants, slash commands for rituals.
- **Many sessions run in parallel**, often six or more at once, each on its own branch, each started from one tracker issue. The repo is designed so that parallel sessions cannot collide by construction, rather than by care.
- **The tracker (Linear) is the state. Git is the read path. `docs/sessions/` is the narrative.** Nothing else holds state.

---

## 2. The laws (each derived from a measurement, not an argument)

**L1 — Prose fires approximately never; a guard, a hook or a scheduled job has zero recorded misses. There is no third tier.**
The predecessor wrote "run a retro every ~10 sessions" into its manual. Two months later, `grep -r retro .claude/` returned 0 and ~36 retros were owed. Anything that must happen every time is a test, a hook, or CI. A rule written only as prose is a suggestion.

**L2 — A budget without a structural fix only buys time. A cap on COUNT with no cap on SIZE is not a budget.**
Three instances: the status file (pruned 210 KB → 86 KB, regrew to 239 KB in five weeks), the markdown backlog (403 KB), and CLAUDE.md (trimmed 51%, regrew in nine days). The manual's "keep only three version entries" cap held perfectly while the section still weighed 14.6 KB. The fix that held: a byte ratchet test whose ceiling only moves down.

**L3 — A shared file that every session writes is a merge-conflict magnet and only grows.**
One overnight produced four conflict-resolution commits on the status file and shipped two contradictory "Last updated" lines. The fix: one new file per session (`docs/sessions/`), and a status file that is a pointer card nobody writes to.

**L4 — A queue with a mandated ADD and no mandated REMOVE is the old checklist in a new store.**
PM actions moved from a 102-item markdown checklist (0 checked) to a tracker label. The label went 10 → 97 → 144. Design the drain before the label: a workflow **state** (exclusive, vacates on close) instead of a label, and batch items by **sitting** (all hands-on checks in one sitting, all copy calls in another). A queue whose items share a modality is as long as its sittings, not its rows: 97 items were about 7 sittings.

**L5 — A deliverable that lands only on an unmerged branch does not exist.**
38 of 39 open PRs were drafts; lessons stranded on an unmerged branch were re-derived from scratch a week later. A session with no work PR opens its record-only PR non-draft.

**L6 — A scheduled wake is justified by an event it can miss, never by a state a structural fix already prevents.**
102 self-check-ins over three weeks did useful work 3 times, all of it cleaning up after collisions a structural fix later removed.

**L7 — A detector that cannot fire is indistinguishable from a clean board.**
The "abandoned claim" check tested whether a branch still existed; branches were never pruned, so it could not fire. Every detector is proven by mutation to fire at least once.

**L8 — Fan out the read, serialize the write.**
Verification and review parallelize cleanly across subagents. Writes to shared surfaces (the manual, migrations, guard registries) go one at a time.

**L9 — Whatever performed an action writes the record of it, in the same run.**
Deploy records written by a later human step went stale within a month. Records written by the deploy job itself did not.

**L10 — A check keyed on a signal your own arrival also produces cannot tell you apart from a collision.**
The launch path sets `In Progress`, so status cannot say *who* claimed an issue. The branch name in a claim comment can.

**L11 — The isolated reviewer catches what the build conversation cannot.**
A statistical flaw shipped under three ceremonial ✓s and the PM caught it, not the experts. Since then: an isolated adversarial pass that must name its counterexample. It has repeatedly returned FAIL with real bugs; a code reviewer then found a fourth the adversarial pass missed. Isolation is the feature.

**L12 — Verify the premise at file:line before building on it.**
A quick-win label was ~60% stale within weeks; 10 of 21 "quick wins" had a disqualifier visible only in the body. One wrong architectural premise invalidated four spec rules at once.

---

## 3. The rituals, and the pain behind each

| Ritual | Pain that created it | Evidence it works |
|---|---|---|
| **Claim comment** at session start (branch + UTC + mode) | Two sessions built the same issue and opened near-identical PRs 15 seconds apart | Zero status drift in two later grooming passes |
| **One PR per session**, records say `shipped via #n` | "merged to main (#n)" can only be written after merge, forcing a second PR | 96.6% compliance; the phrase "merged to main" used 0 times |
| **`docs/sessions/` one file per session** | The shared status file conflicted on every parallel session | Collisions stopped the day it landed |
| **Server-side CI with an empty-bypass ruleset** | ~400 merges landed with zero checks; the pre-push hook was skippable | Every later guard became binding |
| **Adversarial DoD line** (name the counterexample) | The three-✓ statistical bug | Repeated real FAILs caught pre-merge |
| **Decision briefs** (Deciding / Options + recommendation / Consequence) | Bare "thoughts?" questions the PM could not rule on | Every session since uses them; PM rules same day |
| **Mock what you change**; each round republishes to the SAME URL | Visual choices described in words; PM lost track of which frames were current | Used on every design track |
| **A reaction round republishes as ONE proposal** | "we mix in elements from mock-a to mock-b and it gets confusing" | Converges in fewer rounds |
| **Plain-English TL;DR** opens every issue | "sometimes your tasks are too technical for me to truly understand" | Standing |
| **Plan-gate**: post a plan before non-trivial code | Sessions built the wrong thing well | Standing |
| **BUILD vs DISCOVERY mode** | Research sessions started building the thing they were asked to evaluate | Standing |
| **Byte ratchet on CLAUDE.md** | L2 | Held since introduction; each addition now pays with a deletion |
| **Living vs frozen docs** (version in header, never filename) | `*-v1_0` docs froze while reality moved; the schema doc inverted a table's ownership and sessions trusted it | Standing |
| **Frozen research corrected additively** (§V addendum + inline ⚠ pointer) | In-place edits destroy "what we knew when"; an addendum alone is unread | Standing |
| **Better-than-the-rule brief** | Principles written as restraint ("never" ×66, "delight" ×0) quietly blocked better designs | Used repeatedly |
| **Guards proven by mutation** | Tests that were green over nothing, found only by breaking the source | 40 guards, zero recorded misses |
| **PR check-ins: at most one, ~90 min, stop on first no-op, never at wrap or overnight** | L6; every wake past the prompt-cache TTL re-sends the whole context at full price | Standing |
| **`/dispatch`**: propose ready rows, PM picks, then launch | Parallel batches assembled by hand took an hour | New |

---

## 4. Ceremony that was cut (do not reintroduce)

- A session list, "Last updated" line, or PM checklist in any shared file (L3, L4).
- A version-history section in the manual. Git log is the history.
- A build-sequence section in the manual. It contradicted itself on its first screen; the tracker's projects are the plan.
- Filename-versioned docs.
- Standing hourly check-in chains.
- A markdown backlog with hand-assigned IDs (IDs collided three times in one day across parallel sessions).
- A catch-all "default" project for new issues (153 issues leaked into it).
- A custom CI action for tracker status (fights the native integration).
- A Definition of Done line that re-asserts what required CI already proves.

---

## 5. Tracker mechanics that bit (Linear + GitHub integration)

- **An attachment closes an issue on merge; a bare mention usually does nothing.** Attach only what the PR finishes. Point at related work in a comment.
- **Never put an issue-ID range in a PR title.** The integration attached both endpoints and would have closed both on merge.
- **A multi-PR issue closes on its first PR's merge.** Split into one sub-issue per PR.
- **`labels` replaces the whole set; `addLabels` appends.** Always use add/remove.
- **The search index lags writes.** After a bulk pass, trust your write count.
- **The MCP writes as the PM.** An author field is not proof of who acted; verify against the source.
- **Agent sessions run on `claude/<slug>` branches that don't name the issue**, so the PR body reference is the only link trigger.

---

## 6. Session hygiene that saves real money (from a token post-mortem)

- The auto-loaded manual is the single largest fixed cost: every byte is paid on every turn of every session. Rules live in the manual; stories live in `docs/engineering-lessons.md`.
- `git status` before the first commit. Push once, then end the turn.
- Two tracker writes per issue per session: the claim and the outcome.
- One foreground code review, told what is already proven.
- One-line status updates while waiting on background work; never poll.
- Push early. Cloud containers restart and take unpushed work with them.
- Cloud sessions arrive as a shallow clone. Anything reasoning over history fetches first and asserts a commit-count floor (`scripts/groom/preflight.sh`).
- A review subagent shares your working tree. Tell it to `cp -r` before mutating anything.

---

## 7. The retro

Run `/retro` when the SessionStart hook prints `RETRO DUE` (every 10 sessions, computed from `docs/sessions/` against the newest file in `docs/retros/`). Four questions:

1. **What did a persona miss?** One issue a lens should have caught.
2. **What rule prevents that class?** A durable change: a guard, a hook, a routing row, a skill, a DoD line. Prefer the tier that fires (L1).
3. **What is now over-process?** Name one ritual to cut. Process must net out, not only accrete.
4. **What working file is bloating?** Check every state surface against its budget.

The predecessor's second retro added a fifth habit worth keeping: **name the falsifier.** State, before the fix ships, the measurement that would prove it failed (e.g. "if the Needs PM count is not lower in six weeks, the programme failed regardless of what else shipped").
