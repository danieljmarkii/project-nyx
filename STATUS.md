# STATUS — where are we?

_A **pointer card**, not a state store._ The volatile working state lives in **Linear** (team `Culprit` — `linear.app/projectnyx`); the build-critical reference lives in `docs/` and `CLAUDE.md`; the narrative of what happened lives in `docs/sessions/` and git. This file exists to tell a fresh session **which of those to open**.

**It should change only when a track starts or ends — not every session.** If you are about to add a paragraph here describing what you built, that paragraph belongs in your `docs/sessions/` record and on the Linear issue. See `/wrap` step 3b.

---

## Where each kind of state lives

| Question | Answer lives in | How to reach it |
|---|---|---|
| What is in flight right now? | **Linear** — team Culprit, state `In Progress` / `In Review` | `list_issues` |
| What are the live tracks? | **Linear projects** — each carries its own status + summary | `list_projects` |
| What should I pick up next? | **Linear** — `Todo` at Urgent/High priority | `list_issues` |
| What is waiting on the PM? | **Linear — the `Waiting on PM` label** | one view; every issue there names its single remaining step |
| What shipped last, and why? | **`docs/sessions/`** — one file per session, never edited | `ls docs/sessions/ \| sort -r \| head -3` |
| What decision is still open? | **`CLAUDE.md` § Open Questions** (resolved ones: `docs/decisions-archive.md`) | already auto-loaded every session |
| How do I build this correctly? | **`docs/`** — the `*-requirements.md` specs, `supabase/migrations/`, the design principles | `CLAUDE.md` § "Read These Before Writing Any Code" |
| How do I get a build on a phone? | **`docs/dev-handoff-runbook.md`** — both runtimes, the installed build, the traps | |
| How do I deploy an Edge Function / migration? | **`docs/edge-deploy-runbook.md`** + `supabase/functions/deploy-manifest.json` (the deploy ledger) | |
| What did the pre-Linear backlog say? | **`docs/backlog.md`** 🧊 frozen 2026-08-15 | only to recover an already-ported row's history |

The rule behind the table (`CLAUDE.md` § Documentation Update Protocol): **read-path → git; work-path → Linear.** Does a coding session need to `Read` this file to build correctly? Yes → git. No → Linear.

---

## Current phase

**Shipping toward the App Store.** The product is feature-complete for v1; the remaining work is submission mechanics, device verification, and two held deploys.

The **Build Sequence** (`CLAUDE.md`) is done end to end: steps 1–8 complete; **step 9** (vet report) has Phase 1 + the owner-facing MVP + authenticated photos live, with the public share link (PR 6) deliberately unshipped; **step 10** (AI Signal) shipped and has since been superseded by Signals v2, which GA'd 2026-08-20.

**Live tracks — read each project's own summary in Linear, not a copy here:**

| Project | Where it stands |
|---|---|
| **App Store Launch** | The dominant track. Milestones M1–M6: the 5.1.2(i) AI-consent gate, QA and dashboard close-outs, the demo-account live seed, listing, build cut, submission, review-week ops. |
| **Signals v2 — the record, decomposed** | Shipped + GA'd 2026-08-20. Both beta flags retired. Report-side adoption (CUL-564) is merged but inert until the deploy below. |
| **The Daily Recap** | DR-0…DR-7 all shipped. Open: the §5.5 portfolio-slate reaction and the CUL-27 finish-pass briefs. |
| **Backlog → Linear: operationalize the cutover** | The workflow rewiring. Remaining: CUL-522 (dual-source stragglers), CUL-530, CUL-563. |
| **Aug. 2026 Design Polish** | New (2026-08-22). Nav identity, the arrival moment, the two-register completion system + haptics, Trend verbiage, Geist app-wide, plus the audit's defect fallout. 18 PRs, one per session; the project description carries the run order. |
| **Event Taxonomy Expansion** | New (2026-08-26). Broadening event capture beyond the GI core — cough/sneeze first, the safety trio behind (B-756/CUL-509). Scoping ratified + hard-reviewed same day; **W2 is gated on CUL-684 — four rulings open after the v1.4 pass returned FAIL**; **the project description carries the PR-by-PR run order**; every wave is its own PM greenlight (D5), and W1's GA queues behind the `log_picker_v2` host gate (CUL-662 → CUL-663). |
| **Legacy Backlog** | The migrated `B-NNN` rows. Not a track — a holding project. |

### Two standing holds

Each gates more than one track, so they are named here rather than left to be rediscovered:

- **`generate-report` is not deployed** — live is v13 (Jul 18) while `main` carries PR 7 and everything after it. **CUL-19** owns the deploy and the constraint that rides it (do not ship an app build carrying B-417 PR 6 to a device before it runs). Blocks the prod visibility of CUL-64, CUL-45, CUL-50, CUL-564, CUL-479.
- **The per-incident AI functions owe a redeploy** — `analyze-vomit` / `analyze-stool` / `ask`, in that order, and the order is load-bearing. **CUL-557** owns it. Not under the `generate-report` hold.
_(A third hold — `generate-signal`'s behaviour-changing redeploy behind a client build — was **cleared 2026-08-29**: the build shipped, the function deployed at v33, and W1's `other`-row swap ran the same day. See the deploy ledger and `docs/sessions/2026-08-29-event-taxonomy-w1-swap-run.md`.)_

The ledger of what is deployed versus what is on `main` is `supabase/functions/deploy-manifest.json`, guarded in CI.

---

## Why this file is short now

It was **239 KB / 33,000 words** — 25 track sections narrating work that had already shipped, a 102-item PM checklist with nothing checked, and a "Blocking Open Questions" section that was mostly closed questions. Every part of it duplicated Linear, `docs/sessions/`, or `CLAUDE.md`, and the duplicate was reliably the stale copy: it still led with "Step 10 — AI Signal" and called Ask "the next main project", months after both stopped being true.

The 2026-08-22 pass moved the state to where it is worked — 17 un-homed PM actions became Linear issues on the `Waiting on PM` label, the rest were matched to issues that already existed or verified as done — and left this pointer card behind. Nothing was discarded: `git log -p STATUS.md` has every word of the old file.

The structural fix is that **no per-session write lands here any more** (`/wrap` writes to `docs/sessions/` and Linear instead). A file every parallel session rewrote was both a merge-conflict magnet and, by construction, always growing. Full record: `docs/sessions/2026-08-22-status-md-linear-migration.md`.
