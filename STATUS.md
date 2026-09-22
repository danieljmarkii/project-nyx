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

The original **build sequence** is done end to end — steps 1–10, finished August 2026 (`CLAUDE.md` § Where the Work Is Tracked): the **vet report** has Phase 1 + the owner-facing MVP + authenticated photos live, with the public share link (PR 6) deliberately unshipped; the **AI Signal** shipped and has since been superseded by Signals v2, which GA'd 2026-08-20.

**Live tracks — read each project's own summary in Linear, not a copy here:**

| Project | Where it stands |
|---|---|
| **App Store Launch** | The dominant track. Milestones M1–M6: the 5.1.2(i) AI-consent gate, QA and dashboard close-outs, the demo-account live seed, listing, build cut, submission, review-week ops. |
| **Signals v2 — the record, decomposed** | Shipped + GA'd 2026-08-20. Both beta flags retired. Report-side adoption (CUL-564) is merged but inert until the deploy below. |
| **The Daily Recap** | DR-0…DR-7 all shipped. Open: the §5.5 portfolio-slate reaction and the CUL-27 finish-pass briefs. |
| **Backlog → Linear: operationalize the cutover** | The workflow rewiring. Remaining: CUL-522 (dual-source stragglers), CUL-530, CUL-563. |
| **The workflow audit — the board, the queue, the ceremony** | New (2026-09-11). The second run of the process-retro ritual: fix the PM queue's *generator*, make the board honest, cut per-session ceremony. Five verified live defects; spec `docs/workflow-retro-2026-09.md`; **the project description carries the run order** (W-A…W-E). **W-A · The free wins is complete** — CUL-919 (#838), CUL-920 (#839), CUL-921 (#840). Next is W-B: CUL-922, the write boundary, a hard prerequisite for anything scheduled. Nothing here closes an open PM item — it fixes inflow and representation, and the project states that up front so no milestone is mistaken for a drain. |
| **Aug. 2026 Design Polish** | New (2026-08-22). Nav identity, the arrival moment, the two-register completion system + haptics, Trend verbiage, Geist app-wide, plus the audit's defect fallout. 18 PRs, one per session; the project description carries the run order. |
| **Event Taxonomy Expansion** | New (2026-08-26). Broadening event capture beyond the GI core — cough/sneeze first, the safety trio behind (B-756/CUL-509). Scoping ratified + hard-reviewed same day; **W2 split into W2a (strain + labored) and W2b (RRR) — both gated on CUL-684, five rulings open after the v1.5 pass returned FAIL**; **the project description carries the PR-by-PR run order**; every wave is its own PM greenlight (D5), and W1's GA queues behind the `log_picker_v2` host gate (CUL-662 → CUL-663). |
| **Home v1 — The Signal fold** | New (2026-09-03). The minimize/expand on Signal cards, all accounts, no flag — a read card folds to one calm line and the record, never a timer, brings it back. Spec `docs/nyx-signal-fold-requirements.md` v1.2, every ruling in; **the project description carries the PR-by-PR run order** (PR 1 CUL-784 ready; PR 2 CUL-785; PR 3 CUL-788; v1.1 CUL-786 / CUL-787). Home v2 is the separate *Home v2 — the redesign* project below. |
| **Home v2 — the redesign** | New (2026-09-05). The re-imagination after the fold, on its own merits (the conference spike was trashed 2026-09-03; its two research briefs are carried into this project). Discovery done: four research briefs, six isolated persona interviews, mock round 1 with five directions side by side (`docs/culprit-home-v2-mockups.html`), six decision briefs on **CUL-810** (`Waiting on PM`). Spec (CUL-811) gated on the rulings; four direction-independent PRs can start first — the project description carries the phases. **The daily look (*Noticed*) is the live build track:** spec `docs/nyx-daily-look-requirements.md` v1.1 (CUL-838 → CUL-846, #814; reviewed and decomposed CUL-862, #816); **the project description carries the PR-by-PR run order** (CUL-866 → CUL-876 on milestones Noticed A–E, the lanes and the deploy needs); N-0 → N-5 shipped; the three gating briefs and L-17 are ruled (CUL-863 / CUL-864 / CUL-865, 2026-09-10; CUL-849, 2026-09-11 — the spec carries each inline). On `Waiting on PM`: **CUL-891** (Urgent — a look counts as a logged day in the vet report's coverage denominators, fixed by §5.6 and live since the 2026-09-15 `generate-report` deploy; widening the flag past the device-pass cohort is now a PM call, not a blocked one), **CUL-914** (Urgent — the L-17 disclosure is true under the null; the pairing prints on 22–77% of pure-noise records, measured), CUL-915, CUL-916, CUL-889, CUL-894 and CUL-895. The pre-convergence layout briefs (CUL-810 / CUL-829) are parked and CUL-811 is cancelled at the PM's direction. |
| **Vet visits — the appointment companion** | New (2026-09-10). The vet-visit lifecycle over parts the app already has — book it, a Home strip in the days before, Get ready (the rundown promoted), notes in the room, the plan becomes records — dark behind the `vet_visits` flag and retired at GA. Spec `docs/nyx-vet-visits-requirements.md` v1.0 BUILD-READY, G0–G7 ruled, the nine-lens verdict 2 BUILD · 7 BUILD WITH CONDITIONS · 0 DON'T BUILD; **the project description carries the PR-by-PR run order** (CUL-898 VV-0 → CUL-906 VV-7 on milestones A–E; **VV-0 → VV-6 all shipped 2026-09-11** — the flag is seeded dark, nobody allowlisted. **VV-GA (CUL-905) is the only build issue left, and one finish-pass blocker stands in front of it:** CUL-950 (Urgent — ruled 2026-09-22, in review via #890; its panel and reviews filed CUL-1084 – 1087 and CUL-1094, and CUL-1093 (High) flagged — not asserted — as a possible GA blocker for the PM's call). (CUL-951 + CUL-970 cleared 2026-09-22, #888; its review filed CUL-1088 / 1089 / 1090, each flagged — not asserted — as a possible GA blocker for the PM's call.) (CUL-949 + CUL-966 cleared 2026-09-15, #849 — the notes now open when a visit is booked; **CUL-952 cleared 2026-09-15, #851** — a booked appointment can be changed and removed, and a passed one answered both ways.) The **visit delete is no longer held** — CUL-19's deploy ran 2026-09-15 (`generate-report` v15), so the control is free to ship. The recording is v1.x, after the submission cut per G5/G7). Decision record on CUL-878. |
| **Vet report — the v15 cold-read remediation** | New (2026-09-15). What the first cold read of the *deployed* v15 report found on a real record, the day before a real appointment — ten issues, R-1 → R-10 (CUL-974 → CUL-983). Two Urgent data-integrity defects, four consistency defects, an editorial pass. **R-1 (CUL-975) shipped 2026-09-15 (#853)** — every other number on the document is computed over the data it fixes, so it had to land first; **R-2 (CUL-976) shipped on top of it (#854)**, and a third defect it surfaced is filed as CUL-991 (Urgent). Both leave the same deploy owed (`generate-report`, ledger `pending`, one deploy serves both, runs from the Codespace). On `Waiting on PM`: query the label in Linear — the set turns over fast enough on this track that an enumeration here is stale within the day (CUL-975 and CUL-974 were both ruled and cleared on 2026-09-16). |
| **Design v2 — the whole day** | New (2026-09-19). The Home / Signal / Patterns redesign ruled on round 4 of the design-system audit (CUL-1060, four mock rounds, six stakeholder reads): every chart to the timing lane's standard, the Signal leading Home with its own screen, today as a spine, the month over its rows, one motion physics; dark behind the `design_v2` beta toggle, retired at GA. Design authority `docs/culprit-design-v4-mockups.html` (rounds 1–3 are archives); **the project description carries the run order** — four steps, the parallel lanes and the one bundle named (CUL-1062 → CUL-1071); step 1 is two sessions at once (bundle A: the toggle + the FAB; lane B: the chart family). |
| **Legacy Backlog** | The migrated `B-NNN` rows. Not a track — a holding project. |

### One standing hold

It gates more than one track, so it is named here rather than left to be rediscovered:

- **The per-incident AI functions owe a redeploy** — `analyze-vomit` / `analyze-stool` / `ask`, in that order, and the order is load-bearing. **CUL-557** owns it. Not under the `generate-report` hold.
_(The `generate-report` hold — B-494 / **CUL-19**, which had held the function at v14 since 2026-07-30 — was **cleared 2026-09-15**: PM ruled CUL-965 option (a), the function deployed at **v15**, and six weeks of report work went live with it, including cough + sneeze (CUL-676), which had never printed in production. The refusal lane (CUL-50 / CUL-59 / CUL-60) shipped knowingly unfinished and is now post-deploy work. Follow-through, including the owed `vet-report-cold-read`, is **CUL-969**; see `docs/sessions/2026-09-15-generate-report-deploy.md`. A further hold — `generate-signal`'s behaviour-changing redeploy behind a client build — was **cleared 2026-08-29**: the build shipped, the function deployed at v33, and W1's `other`-row swap ran the same day. See the deploy ledger and `docs/sessions/2026-08-29-event-taxonomy-w1-swap-run.md`.)_

The ledger of what is deployed versus what is on `main` is `supabase/functions/deploy-manifest.json`, guarded in CI.

---

## Why this file is short now

It was **239 KB / 33,000 words** — 25 track sections narrating work that had already shipped, a 102-item PM checklist with nothing checked, and a "Blocking Open Questions" section that was mostly closed questions. Every part of it duplicated Linear, `docs/sessions/`, or `CLAUDE.md`, and the duplicate was reliably the stale copy: it still led with "Step 10 — AI Signal" and called Ask "the next main project", months after both stopped being true.

The 2026-08-22 pass moved the state to where it is worked — 17 un-homed PM actions became Linear issues on the `Waiting on PM` label, the rest were matched to issues that already existed or verified as done — and left this pointer card behind. Nothing was discarded: `git log -p STATUS.md` has every word of the old file.

The structural fix is that **no per-session write lands here any more** (`/wrap` writes to `docs/sessions/` and Linear instead). A file every parallel session rewrote was both a merge-conflict magnet and, by construction, always growing. Full record: `docs/sessions/2026-08-22-status-md-linear-migration.md`.
