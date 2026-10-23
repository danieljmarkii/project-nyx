# Quick-Wins Batch — 2026-08-01

**Convened:** Sr. Product Designer + Dir. of Engineering, against `docs/backlog.md` (404 open rows).
**Ask:** 10 self-contained PRs, low-hanging, each knockable out in one Claude Code session.
**Efficiency rule applied:** where several backlog rows share a file, a lens, or a review, they ride in one PR. 10 PRs close **22 backlog items**.

---

## Selection criteria (what made the cut)

Both leads screened on the same four filters:

1. **No open PM decision.** Anything gated on a ruling (B-286 spec-vs-mock, B-509 escape hierarchy, B-563 which-hedge-loses, B-201 FAB promotion) is out — a session that stalls on a question isn't a quick win.
2. **The plumbing already exists.** Preference for rows whose Why-cell says *"the machinery exists, the affordance doesn't"* — B-547, B-549, B-475-adjacent work.
3. **One review gate at most.** A PR needing `adversarial-reviewer` **and** `rls-privacy-reviewer` **and** a cold read isn't a quick win.
4. **Disjoint files.** So several can run concurrently. Collisions are named per PR below.

**Deliberately excluded and why:** B-387 (backlog archive-split) and B-388 (CLAUDE.md deep trim) are both filed as needing PM sign-off — large restructures of the constitution, not quick wins. B-506/B-507 (migration version namespace) need a rename decision with live-DB blast radius. B-262/B-259 (onboarding) match a design-locked mock, so changing them re-opens a lock.

---

## The ten

### QW-1 — Theme-token sweep (on-dark literals + the missing 4px)
**Closes:** B-066, B-129, B-193
**Lens:** Dir. of Eng. (convention debt) · Designer (token parity)

Twenty files under `app/` and `components/` still carry `'#fff'` / `rgba(255,255,255,…)` / scrim literals on dark surfaces, violating the "no hardcoded values" hard constraint. The tokens they should point at **already exist** (`colorTextOnDark`, `colorTextOnDarkMuted`, `colorTextOnDarkSecondary`, `colorScrimDark` — `constants/theme.ts:69–72`); `medication-capture.tsx` was migrated and `food-capture.tsx` never was. Same PR adds the two tokens the scale is missing (`space0_5: 4` between `spaceMicro: 2` and `space1: 8`; an `lineHeightXS`) and migrates the `MetricCard` / `WeightTrendCard` / `WeightCard` call sites so the literal stops spreading.

Zero behaviour change, large-but-mechanical diff, `tsc` + jest are the whole gate.

---

### QW-2 — Shared `EmptyState` primitive + `ChipGroup` busy state
**Closes:** B-165, B-555
**Lens:** Designer (Principle 5) · Dir. of Eng. (shared primitives)

`components/ui/` has 26 primitives and **no `EmptyState`** — History, Foods, Profile and event-detail each hand-roll near-identical `emptyState` / `emptyTitle` / `emptyBody` blocks. A shared `components/ui/EmptyState.tsx` (title · optional body · optional action) makes Principle 5 the path of least resistance: after this, shipping a *bare* empty state is the harder thing to do.

Riding along: `ChipGroup` takes no `disabled`, so every closed-set picker that **writes on select** (the Vet Files kind filter is the live case) has nothing to show between tap and re-render. VF-6 guarded it locally with a re-entrancy check rather than bolt state onto a shared primitive mid-finish-pass — this is where that gets paid.

Both are the same job: make the shared layer carry what the call sites keep re-inventing.

---

### QW-3 — Vet-report chart geometry + the zero-nub
**Closes:** B-498, B-445, B-496, B-497
**Lens:** Dir. of Eng. · Dr. Chen (B-497 is a clinical guardrail, not a chart bug)

Four `vet-report-cold-read` findings, all in `symptomChart` (`supabase/functions/generate-report/render.ts:325`), all pure functions with `deno test` coverage:

- **B-498** — on odd maxima the gridline **labelled `3`** is drawn at the value 2.5, so a bar of 3 tops out above its own gridline. Even maxima scale correctly, so it fires only on odd ones — and it fired on the headline clinical trend.
- **B-445** — `mid = floor(nB/2)` splits the window into unequal halves, biasing the trend arrow toward "worsening": 21d→4 vs 27d→6 is 0.19/day vs 0.22/day (flat) rendered as +50%.
- **B-496** — the caption promises the dashed vertical marks the day an intervention **started**; `centerX(bucketIndex)` draws it at the centre of the 7-day bucket, so a day-1 start draws ~3.5 days in.
- **B-497** — the one that matters. Weeks with **nothing logged** emit a labelled `0` nub and the `aria-label` asserts it (*"…2, 2, 1, 0, 0"*), so on the refusing-cat artifact the most reassuring object on the page is a resolution curve whose last 40% is absence-of-a-log rendered as a measured zero — on a page that elsewhere says "Nothing was logged on 13 of 32 days." That is reassurance-on-absence in the report's own most-scanned graphic.

**Merge-only. Do NOT redeploy `generate-report`** — that deploy is held behind B-494 (see CLAUDE.md Open Questions). The code lands and waits with PR 7's.

---

### QW-4 — Vet Files: name the thing you're naming
**Closes:** B-588, B-589, B-590, B-591
**Lens:** Designer · Sam persona

Four `pm-feature-review` findings on the shipped Vet Files track, all one theme — *the surface stops one step short of the moment it exists for*:

- **B-588** (the reviewer's highest-value catch) — two portal PDFs are distinguished on the list **only** by the filename line; tap **Name** on the second and the sheet shows generic examples, an empty field, and nothing identifying which document was opened. Both rows produce a byte-identical sheet, so the only move is Cancel → re-read → re-tap.
- **B-589** — a two-PDF Files pick renders one card reading "2 documents", and its "Name it" silently names the cover group only.
- **B-590** — `PhotoViewer` is a chrome-less black lightbox with no name on it, and email screenshots are this feature's *primary* capture class, so it's the higher-volume handover surface. Add an optional `caption`.
- **B-591** — `DocumentHero` routes an unreachable PDF into the `isPdf` arm, so AC-12's honest "Needs a connection to show this page" sentence is structurally unreachable for PDFs.

---

### QW-5 — Vet Files: finish the detail ⋯ menu
**Closes:** B-547, B-549, B-548
**Lens:** Designer · Sam persona

Two affordances whose **plumbing is already built and has zero callers**:

- **B-547** — spec §0 D13 says "Also add to {other pet}" sits on the saved moment **and** the detail ⋯ menu; only the saved moment shipped, so the copy-to-another-pet action exists for about four seconds, ever. `duplicateVetDocumentRowsForPet` already handles it, hydrated rows included.
- **B-549** — "Add another page" lives only on the saved moment, and only for a camera capture. Miss page 4 of a discharge sheet and the only recovery is delete-and-recapture, on the exact artifact class `document_group_id` was built for. `buildVetDocumentRows` already takes `groupId` / `startPageIndex` / `documentDate`.

Riding along: **B-548** — the Files row renders fully live with a confident subtitle, and only *after* the tap does the owner learn the binary lacks `expo-document-picker` ("PDFs need an app update") — which on TestFlight they cannot act on. Probe the module once at mount, render the row disabled with an honest subtitle. Empty-states-are-features applied to a capability state.

_Scope valve: B-549 is the largest half. If it runs long, ship B-547 + B-548 and re-file B-549._

---

### QW-6 — TZ-fragile fixtures + a CI timezone leg
**Closes:** B-514
**Lens:** Dir. of Eng. / QA

Four test suites are green in UTC and red elsewhere — `lib/analytics.test.ts`, `lib/widgetSnapshot.test.ts`, `lib/widgetResolution.test.ts` under `TZ=Pacific/Auckland` / `Pacific/Kiritimati` (two also under `Asia/Kolkata`), and `constants/monetizationCopy.test.ts` under `TZ=America/Los_Angeles`. These are **TZ-fragile fixtures, not production bugs** (B-421's explicit-zone tests all pass), but CI runs UTC-only so nothing can see them.

Two halves: pin the fixtures to explicit zones, then add a **second `jest` leg to `.github/workflows/ci.yml`** under a non-UTC `TZ` so the class can't come back. This repo has shipped four separate day-math incidents; a UTC-only CI is why they're found by review instead of by the build.

---

### QW-7 — Close the day-math guard's own gap + test the trial write path
**Closes:** B-517, B-544
**Lens:** Dir. of Eng. / QA

- **B-517** — `lib/dietTrialDayMath.guard.test.ts` enforces one day-math oracle via a `CONSUMERS` list (currently two entries) plus a `DAY_DIVISION` regex. `lib/dietTrialOutcomeFacts.ts` declares its **own** `MS_PER_DAY` and its own `todayIndex - startIndex + 1`, is not in `CONSUMERS`, and its `index * MS_PER_DAY` evades the regex (which matches division only). The guard was written to catch exactly this file and doesn't. Its inversion was caught by an `adversarial-reviewer` pass, not by the guard.
- **B-544** — `components/profile/StartTrialModal.tsx` (843 lines) is the **sole** `diet_trials` write path, including the end-and-continue ordering, and has no test file. Neither does `hooks/useDietTrial.ts`, where the B-534 staleness bug lived. The DoD exemption for both was silent rather than stated.

---

### QW-8 — Foods tab: name the pet, name the foods
**Closes:** B-626, B-627, B-628
**Lens:** Designer · Sam persona

Three `pm-feature-review` findings from B-616 PR 3 (#528), same screen:

- **B-626** — the tab header says only "Foods", but the reliable-favorites shelf, the per-row intake notes and the new trial chips are **all** scoped to the active pet over a per-account library. Mock screen A carried a `Biscuit's library` subtitle; the build dropped it, leaving the trial strip as the only pet context — and it scrolls away, and doesn't render at all with no trial running.
- **B-627** — the strip reads `3 foods on the trial list`; the cold reaction was *"Three. Okay… which three?"* On the wedge's own surface, the tab points at the 10-second answer instead of giving it. `Royal Canin Hydrolyzed HP, and 2 more` is the alternative, at the cost of a longer line.
- **B-628** — nothing in the mid-trial add flow frames **whose call** an extra is. The only vet framing (FR-9's empty-extras line) renders only when the extras group is empty, so an owner entering from food detail never sees it.

---

### QW-9 — Diet-trial copy: the start modal and the decline register
**Closes:** B-565, B-561
**Lens:** Designer · `nyx-voice`

- **B-565** — five small start-modal items from `pm-feature-review`: two different date formats ~40px apart on one screen (`toLocaleDateString` "July 28, 2026" vs `formatTrialEndDate` "22 September" — the matching helper is *already imported*); `durationHelperLine` renders above the start-date field, so back-dating changes a sentence that's scrolled off-screen; `START_DATE_LABEL` is six words in wide-tracked micro-caps beside two-word siblings.
- **B-561** — `pushDeclineLines` says *"isn't showing the trial numbers"* one line above a trial number. The sibling `trialViabilityNote` had this exact sentence corrected twice; the decline register kept the original wording, which was true only while it rendered no numbers — and B-533 PR A made it false in three states instead of one. Same fix as the sibling: name the **reading** it withholds, not "the numbers".

---

### QW-10 — Docs & state hygiene
**Closes:** B-487, B-392, B-391, B-484
**Lens:** Dir. of Eng. / Product Owner

- **B-487** — the 2026-07-25 extraction moved 17 resolved Open-Questions rows to `docs/decisions-archive.md`, but **4 stayed inline because CLAUDE.md is the only copy of their ruling** — and two of those are *live build guardrails* (B-247's stool seam; B-340's derive-from-structured-fields rule). Re-home them so the rule lands where the sessions that need it will read it, and CLAUDE.md gets a pointer. CLAUDE.md is loaded on **every turn of every session**, so bytes here are the highest-leverage bytes in the repo.
- **B-392** — `nyx-technical-spec` self-declares "Living Document" and never moves: 3 of 5 Open-Eng questions are resolved-but-listed-open, design tokens read TBD (long since Geist/Newsreader/teal), the migration count says 021 (live is 048+), and event-type comments call weight and medication "not in MVP" (both shipped).
- **B-391** — 13 open drafts, 6 idle 2+ weeks; #366 and #380 are superseded-but-open and actively misrepresent shipped work.
- **B-484** — delete the `zz-deploy-probe` Edge Function (leftover from a June deploy-path test, still `ACTIVE`). Dashboard action, no code.

_Note: this PR touches `CLAUDE.md`, which is a Tier-1 file — edits are allowed in the moment, but the doc-content moves are Tier-2 and want the PM's eye in review._

---

## Parallelism

| Runs concurrently | Shared-file collision |
|---|---|
| QW-1, QW-3, QW-6, QW-7, QW-10 | none — theme/constants, `render.ts`, test fixtures, `lib/dietTrial*`, docs are disjoint |
| QW-4 **then** QW-5 | both touch `app/vet-document/[id].tsx` — sequence them |
| QW-8, QW-9 | disjoint (`app/(tabs)/foods.tsx` vs `StartTrialModal` / `dietTrialCard`) |
| QW-2 | touches many call sites — land it **before** QW-1 or accept a token-sweep rebase |

Everything collides on `STATUS.md` at `/wrap` — expected, and the per-session record now lives one-file-per-session in `docs/sessions/`, so that's the only line to resolve.

**Suggested order if run serially:** QW-6 (CI floor first) → QW-7 → QW-2 → QW-1 → QW-3 → QW-4 → QW-5 → QW-8 → QW-9 → QW-10.
