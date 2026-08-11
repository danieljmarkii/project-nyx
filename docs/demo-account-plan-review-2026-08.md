# Demo-Account Plan (B-271 v2) — Convened Team Review

**Date:** 2026-08-10 · **Reviewed:** `docs/nyx-demo-account-requirements.md` v2 (finalized 2026-08-09, #623) · **Requested by:** PM ("convene the team, especially the specialists — review the plan, highlight what's going well, what needs improvement, suggest improvements, produce the PR-by-PR breakdown")
**Panel:** four isolated specialist reviewers — an **App Store submission specialist** (the §3.5 "consultant"), the **adversarial reviewer** (who *executed* the Cooper story against the shipped engine — 26 variants through the real `detectSignals` + `computeTrialFacts`, not a prose read), the **Dir. of Engineering** (mechanism/plumbing verification against code + the live project), and the **rls-privacy-reviewer** (attack pass on the seed path, credentials, and teardown) — plus an in-context cross-doc read (screenshot plan, submission guide, age rating, privacy answers).

---

## 0. Verdict

**The plan's architecture is right and unusually well-grounded; the plan as *written* would not reliably produce the demo it promises, and its operational path carries one genuine blast-radius hazard.** Specifically:

- **Sound and verified:** the two-rendering-paths model (§4), the D5 inversion, seeding the real B-417 lifecycle, the declarative story module (§12.1 — its cross-runtime import topology is proven by existing precedent: `generate-signal/index.ts:64` already imports `lib/dietTrial.ts` across the same boundary under the current CI flags), the seed-is-data-not-migration ruling, the tier structure, and the credential mechanics (dedicated Sign-In fields; pre-confirmed account).
- **The honesty properties held under attack:** venison **cannot** be falsely implicated (structural — control-window eligibility is created by venison itself, so `riskDifference ≤ 0` by construction; verified under ±2h jitter, UTC-day straddle, and 3×-relogged bouts), and `computeTrialFacts` flags exactly the 3 beef feedings off-diet with zero false flags and `trialDietRefusal: null` (the story genuinely dodges the B-494 hold).
- **Four blockers** (§2.1) must land as spec amendments before PR 1 is built — the biggest inversion: **the spec has its durability rationale backwards.** The intake-decline "safety backstop" (②) is the *fragile* finding (UTC-date bucketing + it self-destructs at the next UTC midnight via the client's own stale-cache regen), while the "drift-sensitive flagship" correlation (①) survived every time-shift thrown at it — but has zero margin at 3 exposures and four silent in-spec kill switches.
- **Every RLS boundary attacked from a JWT held.** The exposure is entirely in the service-role execution path and the runbook — which is exactly the half §9's "rls-privacy-reviewer is not required for a single-owner seed" waved off. That sentence is struck (R-13).

**PR 1 remains buildable now** — nothing found changes the two-PR shape or the zero-app-code-changes claim — but only after the §6 amendment list is ratified, because several fixes change what PR 1 must emit and assert.

---

## 1. What's going well (keep as-is — do not churn these)

1. **Credentials in the dedicated ASC Sign-In fields, never the notes; pre-confirmed account via the real signup flow.** Exactly right; removes the classic "unable to evaluate" failure for login-gated apps.
2. **The honest-firing constraint (§1/§3.3) is Apple-strength, not just clinical hygiene.** Reviewers tap things; a seed that legitimately trips the real detectors survives any amount of poking. The two properties this exists to protect both held under executed attack.
3. **The two-finding redundancy** is the correct anti-"unable to evaluate" engineering (the *rationale* needs inverting — see R-3 — but the redundancy itself is right).
4. **Date-relative, idempotent, parameterized seed (D2/§8, B-324 seam)** — the right architecture for review windows that slip and resubmission loops.
5. **The D5 inversion is correct and complete** — migration 033's owner-scoped RLS verified with no residual shared-read path; `refreshFoodCache`'s `created_by_user_id` scoping is precisely what puts the demo's foods in the reviewer's picker and nobody else's.
6. **§4's rendering-path table is almost entirely accurate**, including the subtle background-regen-on-open parenthetical (`hooks/useSignal.ts:175-185`). One dead row (R-11) and one off-by-one (nice-to-have list).
7. **The B-494 dodge is real, not hand-waving** — `generate-report` v14 confirmed live; a found-trigger + mild-dip story genuinely does not need the held refusal band, and the adversarial run confirmed `trialDietRefusal: null` on the seeded data. Keep the "do not reshape into a refusal case" warning verbatim.
8. **D9's discipline** (show what ships; never allowlist a flag-dark preview) is the right instinct — its collision with the screenshot plan is a doc conflict to reconcile (DB-1), not a flaw in the principle.
9. **The tier structure (D8)** — a defensible floor plus additive toggles is exactly how the consultant would have structured it; less seeded surface = fewer re-verification obligations per re-seed.
10. **No path fabricates an AI verdict** — the vomit read and the Signal both come from the real functions under the demo user's identity. (§5's "the seed writes… one `event_ai_analysis`" wording is tightened in §6 so this stays true on paper too.)

---

## 2. Findings (deduplicated across the four lanes)

### 2.1 Blockers — gate PR 1's build / the live run

**R-1 — Seeded `food_items` get silently reaped ~30 minutes after the reviewer's first sync, cascading away both findings.** `ai_extraction_status` defaults to `'pending'` (`007:22`); `reapStalePendingFoods` (`lib/sync.ts:1039-1067`) hard-deletes owned pending foods older than 30 min **on every sync cycle**; `diet_trial_foods` CASCADEs with the food (`040:159`) and `meals.food_item_id` SET-NULLs (`001:135`). Net: venison/beef rows, the allowed set, and the correlation's protein exposure all vanish.
*Fix:* the emitter always writes `ai_extraction_status = 'manual'` (the migration-007 backfill precedent); §5 convention + §13 AC + a jest assertion on the emitted SQL.

**R-2 — The delete-then-insert idempotency step is an unguarded service-role hard-DELETE in a production DB whose only other tenant is the PM's two real pets.** One wrong `pet_id` cascades through meals/attachments/analyses with no tombstone (hard delete — a knowing exemption from "soft deletes only on events" that must be named in PR 1's description), and orphans Storage objects permanently (B-121's sweep doesn't exist). `user_profiles.timezone` is user-scoped — a swapped id re-zones the PM's real account and moves every B-421 local-midnight boundary under their live record.
*Fix bundle (all cheap):* one transaction around the whole seed; an assertion prelude before any write (demo-email pattern + pet-ownership check — the migration-033 `DO $$` house style); **ratify the demo-email convention as part of D4** (the assertion can't exist until an email pattern is fixed); a dry-run counts pass before execute; an emitter-level unit test that no `DELETE`/`UPDATE` lacks a `WHERE` naming both the demo pet **and** the demo user. Note: adopting R-7's deterministic-UUID upsert design makes the destructive DELETE disappear entirely, which collapses most of this finding's blast radius — another reason to take it.

**R-3 — The intake-decline finding (②) is the fragile one, and the spec's durability rationale is backwards.** Measured, not inferred: `detectIntakeDecline` buckets recent days by **UTC calendar date** (`detection.ts:2631`), not local midnight as §5 claims — a seed run at an early UTC hour (including the *default* local-day-anchored seed with `America/New_York` timestamps, run before ~08:00 local) produces **no ②** at all. And ② expires at the next UTC midnight: the client's stale-cache auto-regen (`useSignal.ts:175-185`) then **overwrites the good cache with the degraded one** — no re-seed needed; it self-degrades. ① meanwhile has a 180-day lookback and no `now`-dependence: it survived every time-shift.
*Fix:* the emitter anchors the two dip days on `UTC-date(now)` and `UTC-date(now)−1`, clamping any generated instant to `≤ now − 5 min`; runbook precondition on seed-run UTC hour; the re-seed protocol becomes a **standing daily cadence** while a submission is pending (R-12d); dip ratings specified with margin (baseline predominantly `all` ≈ 4.0, dip days `some` + `picked` → delta ~2.25, vs. the spec's "≥1 WSAVA point" which sits *exactly on* `minDeclineDelta`); and PR 1's Deno validation asserts both findings fire **for every `now` across a 24-hour sweep of UTC hours** — the test that would have caught this.

**R-4 — The flagship correlation (①) has zero margin and four silent in-spec kill switches.** Executed: (a) 3 beef exposures is the exact floor — lose one to anything and ① vanishes with no error; (b) `proteins`/`primary_protein` unset on **either** food → `detectCorrelations` bails before considering anything (§11 S3 calls this "cosmetic"; it is load-bearing); (c) §3.2 gives no meal times — a legal reading (one 07:00 meal/day, 20:00 vomits) leaves every control window empty and ① dies; (d) extra "realism" contraband on days adjacent to vomit days contaminates the control arm.
*Fix:* **seed 4–5 beef exposures** (measured safe band; **6 flips the card to `established`** — do not, Early is the intended tier); upgrade §3.2 from prose to an explicit executable event table — per-day meal times, counts, per-day intake ratings, protein fields as hard AC; no contraband on control-adjacent days. This table *is* the story module's content, so the amendment and PR 1's fixture are the same artifact.

### 2.2 Should-fix

**R-5 — `signal_design_v2`: two same-day-ratified docs contradict each other.** Demo spec D9: never allowlisted for the review account. Screenshot plan §0.5/§2 (D-SS4): "goes ON for the demo account — consistently for capture AND review" once SR deems v2 presentable. They coincide today only because v2 isn't presentable; the moment it is, whichever doc executes second silently violates the other — and the bad failure mode (capture-on/review-off) is a Guideline 2.3 accurate-metadata exposure on the exact surface the hero frame leads with. → **Decision brief DB-1.**

**R-6 — The reviewer can permanently destroy the demo account with the app's own advertised deletion flow.** Deletion is required (5.1.1(v)), it's in Settings, and reviewers test it. If run on the demo account, every later look/appeal/resubmission hits dead ASC credentials → "credentials don't work" 2.1. The consultant rates this the single most likely uncovered real-world failure.
*Fix:* (a) a notes line — deletion is fully functional and permanent; a **second credential set** is provided in the notes for deletion testing; (b) mint that second, minimally-seeded account (nearly free via the §6 parameterization — its whole job is being deletable); (c) a runbook resurrection protocol (re-create → re-seed → update ASC credentials **before** replying in Resolution Center). → **DB-2** for the second-account scope.

**R-7 — Re-seeds destroy the Tier-2 photo/read and leave ghost rows on synced devices.** The children-first delete takes `event_attachments` + `event_ai_analysis` with it, and runbook step 6 never re-runs step 3 — after the first re-seed the notes' "vomit event → per-incident read" line points at a surface that no longer renders. Separately, only meals reconcile by absence on hydration (`lib/hydration.ts:176-201`); a delete-then-insert with fresh ids doubles the timeline on any previously-synced device and can collide the ghost `diet_trials` row with the one-active-trial UNIQUE index (23505 — no terminal-error branch in sync).
*Fix (one design, three findings):* **deterministic row ids** (`uuid_generate_v5(demo_pet_id, 'meal-D-16')`-style) + a stable storage path for the photo, making the seed `INSERT … ON CONFLICT (id) DO UPDATE` with bumped `updated_at`. Re-seeds LWW-update in place (device ghosts impossible), the photo + analysis survive (no repeated Anthropic call, no demo-JWT step in the cadence), the destructive DELETE disappears (R-2 shrinks), and the committed SQL diffs cleanly. AC gains "re-seed leaves the same row ids." Runbook keeps one line: after any re-seed, sign out/in on previously-synced *verification* devices.

**R-8 — The runbook's auth is unstated, and the natural defaults are wrong or dangerous.** Step 3's "Claude with the demo password" puts the credential in a session transcript — strictly more copies than D4's "only in ASC," none revocable; delete the branch (the PM-in-app path is named in the same sentence and is better: logging a vomit-with-photo auto-fires the analysis, `lib/analysis.ts:12`, and the Supabase MCP has no Storage upload anyway — `execute_sql` cannot write object bytes). Steps 4–5 never name a token; `generate-signal` fails closed on a service-role bearer (`getUser()` 401), **but `generate-report` has no `getUser()` gate** — a service-role bearer renders **any** pet's report with a 200, and production's one-account shape is the only thing currently masking it. Also: `generate-signal` caps at 12 calls/pet/day and over-cap **silently keeps the previous cache** — a submission-day trap.
*Fix:* step 3 becomes PM-only in-app (Claude verifies by reading `event_ai_analysis` with the service role — no password); step 4 = the demo user's JWT **or** "PM opens Home once" (the spec's own §4 fallback); a runbook rule that steps 3–5 never present the service-role key; note the 12/day cap; D4's wording tightened to "never typed into any agent session, terminal history, or repo file." The missing `generate-report` gate is filed as **B-743** (rides the B-494-held redeploy — it cannot ship independently).

**R-9 — The Tier-2 photo: provenance unspecified, EXIF strip bypassed, and content risk unmanaged.** A direct bucket upload skips `compressForUpload` (`lib/storage.ts:12-42`) — the app's *only* EXIF strip — and `analyze-vomit` reads the object **raw** across the Anthropic boundary. Separately, the age rating is 4+ with every descriptor None; a gory photo is the one artifact that could make a reviewer pause on that — and a photo showing blood/foreign material would fire `incident_red_flag`, inserting a materially scarier safety card **above** everything in the Signal.
*Fix:* provenance rule written down (purpose-taken/licensed, consented, no identifiable surroundings, named source); the photo goes in **through the app** (R-8's path — strip for free); **benign photo** — the contextual escalation floor (3 vomits + the dip) forces `worth_a_call` regardless, so the read still escalates and 4+ stays unimpeachable; QA verifies EXIF on the object **downloaded back from the bucket**. Pet profile photo, if any: stock/licensed only (`nyx-pet-photos` is the project's one public bucket).

**R-10 — Teardown names an outcome, not a mechanism — and the tempting mechanism orphans health photos forever.** A dashboard user-delete cascades rows but purges **zero** Storage objects (B-121 is open with a live repro). Only the in-app `delete-account` path covers objects.
*Fix:* §9 specifies — teardown = PM signs in on-device → Settings → Delete account, never a dashboard delete — plus a post-delete check that the demo prefixes in `nyx-event-attachments` list zero objects. (This also makes teardown the genuine 5.1.1(v) rehearsal §9 wants.)

**R-11 — The spec asserts surfaces that don't exist and mechanisms that aren't the mechanism.** (a) **Trend "compliance mode" was removed in B-417 PR 4** (`useTrend.ts:7-23`; modes are `symptom|feeding`; a trial contributes a start marker + a lowered symptom floor) — §3.1, the §4 table, and §13's AC assert it, and AC 4 as written **can never pass**. "Day N of 42" renders on the TrialStrip/pet card. (b) Day-math: `started_at` 18 days ago renders **Day 19** of 42 (day-1-inclusive, B-421). (c) `SUBSTANTIAL_MIN_*` gates only *which empty state* shows; what gets the card past "building" is a non-empty `ai_signals.findings` row — D3's run, nothing else. (d) §5's "day boundary is local midnight, so set a real timezone and keep the dip in-window *for that zone*" is wrong in the direction that matters — of the relevant detectors only ⑥ reads timezone; ② is pure UTC (R-3). (e) `logged_via: 'quick_log'` is not a valid enum value (`app|notification|reconciled|widget|intent|watch|device`) — the insert fails outright; use `'app'`. (f) The trial's in-window record starts at `started_at` (D-18), not D-21 — `transition_started_at` affects no predicate.
*Fix:* the §6 amendment list carries the exact rewordings.

**R-12 — The reviewer notes (§7) need a rebuild, not a polish.** From the consultant: (a) **a scripted, numbered 2-minute golden path** — the cheapest highest-leverage change in the plan (a numbered path *is* the story and steers the reviewer's 5–15 minutes onto exactly the surfaces the seed guarantees); (b) **drop "clinical-grade" from all reviewer-facing text** — the age rating answered Medical/Treatment = None on the grounds the app is informational; "clinical-grade" in the notes invites the 1.4.1 lens the rest of the submission was written to avoid ("vet-ready" / "a summary your vet can scan"); (c) **state the negatives** — no IAP/subscriptions/paywall, no ads/third-party analytics, no hardware and no live pet needed, all demo data fictional; (d) **trim the out-of-scope list to things a reviewer can reach** (widget: keep; notifications: keep; Ask: drop — no entry point exists, naming it invites curiosity about an unshipped feature); (e) the deletion-testing second-credentials line (R-6); (f) point "where to look" at the *cards*, not "the headline" — rank order puts ② first while fresh, and after ②'s decay the headline becomes the beef correlation. Plus runbook riders: **(g)** a credential smoke test — sign in on a clean device with the credentials *as literally entered in ASC*; **(h)** an account-freeze rule — never delete/re-create/rotate while a submission is open (ASC first if a rotation is forced); scope the `+smtp1` cleanup carefully away from the demo account; **(i)** §8's "re-seed if review slips" becomes a **standing cadence** — re-seed + re-generate every 24–48h from Submit until terminal status (skip while "In Review"), justified by PR 1's measured per-finding survival windows (a drift-tolerance assertion at `now + 48h/96h`), not folklore.

**R-13 — Governance corrections.** (a) Strike §9's "`rls-privacy-reviewer` is *not* required for a single-owner seed" — this review falsifies it (none of the operational findings are properties of "single owner"); replace with "runs against the emitted SQL + runbook before first live execution," and add it to PR 1's gate list. (b) D5's stated mechanism over-claims: the `diet_trial_foods` `WITH CHECK` does **not** run on the service-role path (RLS bypassed; the 041 trigger checks trial↔pet, not food ownership) — the seed must *self-enforce* food ownership with an emitter assertion + unit test; reword D5/§0.1 to match §5's already-correct text.

**R-14 — The demo account can read the entire `app_config` table, including allowlist UUIDs.** `app_config_read_authenticated` is `USING (true)` for all authenticated users; seeded rows carry `allowlist: [<user-uuid>…]`, and the PM's own uid is in `ask_enabled`'s live allowlist — so Apple's reviewer (credentials held indefinitely) can enumerate every unshipped flag, `paywall_enabled`, the `ai_caps` numbers, and another user's stable identifier. Not a boundary break (a uid unlocks nothing), but §9's "it can see only its own pet" is false of this table.
*Fix:* pre-handover runbook line — confirm no non-demo uid appears in any `app_config` allowlist at the moment credentials are entered in ASC (consistent with D9: the demo needs none). Structural hardening (allowlists behind a `SECURITY DEFINER` membership check) filed as **B-744**.

### 2.3 Nice-to-have (accepted unless the PM objects; land with the matching PR)

- **Credentials ergonomics:** mint `appreview@getculprit.app` (Cloudflare Email Routing exists; the reviewer sees the address in-app — no "nyx" leakage), and a strong but *typeable* password (no `l/1/I O/0`, keyboard-friendly — reviewers type on physical devices).
- **Step-10 checklist rider:** add the widget from the gallery on the demo device and confirm the "No pet in this slot yet" empty state is in the cut binary (the notes promise it; B-712 PR 2 must be in the submission build).
- **5.1.1 standby line** for the rejection playbook: why signup requires a *name* ("it appears on the vet report the app generates — core to the artifact, not marketing data"); consider name-optional post-v1.
- **Emitter hygiene:** dollar-quote/escape string literals + an apostrophe-label property test ("Cooper's Venison LID" — generic infrastructure for B-324); **Deno entry points at `scripts/` top level** (`scripts/emit-demo-seed.deno.ts` — the `scripts/*.deno.ts` tsc/deno-check globs don't recurse, so a Deno-global file under `scripts/demo/` would be tsc-checked and deno-checked by nothing); pure modules in `scripts/demo/` with `.ts`-extension imports; jest story tests follow the B-514 timezone-fixture idioms (they run under the non-UTC CI job); seeded `occurred_at` at story-local mid-day except where R-3 pins UTC dates.
- **Spec precision:** "the one thing not hydrated is `ai_signals`" is off by one (`event_ai_analysis` is also server-read — harmless, but teaches a wrong model); §5's "seed writes one `event_ai_analysis`" → "the `event_ai_analysis` row that `analyze-vomit` produces — the seed itself never writes it"; optionally the seed clears `ai_signals` for the pet so a forgotten regen shows the honest "building" state; the emitter renders **run-time-relative** SQL (`now()`-interval arithmetic) so the committed artifact is timeless and "re-run" means re-run, never silently "re-emit then re-run."
- **Cold read on the right artifact:** `vet-report-cold-read` runs on what the **deployed v14** renders, not a repo-side render (repo report code is deliberately ahead under the B-494 hold — a repo render validates an artifact the reviewer will never see).
- **Screenshot-plan cleanup:** §2.5's seed addendum ("the demo spec never mentions `diet_trial_foods`") is stale — spec v2 seeds it; and the plan's "Day 18" references shift to Day 19 per R-11b. One-line Tier-2 edits, ride the DB-1 reconciliation.

---

## 3. The consultant's Tier 2/3 ruling (closes §3.5's open item, pending PM ack)

Rule applied: *seed exactly what a reviewer meets on the golden path in the first five minutes; leave everything they'd have to hunt for as a designed empty state* (every seeded surface is a re-verification obligation per re-seed).

| Item | Ruling | One-line why |
|---|---|---|
| Vomit AI read (1 photo) | **Tier 2 — IN** | Strongest "not a generic tracker" proof; escalate-only posture *defuses* 1.4.1. Condition: benign photo (R-9). |
| Weight trend (2 checks) | **Tier 2 — IN** | Populated Patterns card + report substance; zero risk, already in §3.2. |
| Stool events (2 normal) | **Tier 2 — IN** | Timeline realism (reviewers scroll History); can't trip any detector. |
| Medication course | **Tier 3 — OUT** | The spec's "cheapest promotion" is rejected: the ratified screenshot plan freezes the capture Home with **no MedStrip** — seeding meds forks the reviewer's Home from frame 6 or forces recapture, for zero added review value. |
| Vet document | **Tier 3 — OUT** | Two taps deep where a 10-minute review never goes; costs a real Storage upload in the runbook. |
| Notifications | **OUT (nothing to seed)** | Default-off *is* the product; keep the §7 permission note. |
| Ask / Signal-v2 / widget | **OUT per D9** | Ask additionally drops from the *notes* (no entry point — R-12d); Signal-v2 per DB-1; widget stays notes-mentioned + step-10-verified. |
| Second pet | **OUT** | Single-pet matches the capture plan (no header chevron); multi-pet is demo account #2 (B-324). |
| **NEW: second minimal account** | **IN (scope add)** | Deletion-testing armor (R-6) — the one scope this ruling *adds*. → DB-2. |

**Net: the §3.5 table's own recommendations stand — Tier 1+2 ship, Tier 3 skips, no promotions.** The line is confirmed, not moved; what the ruling adds is the *reason* the med promotion is rejected (screenshot coupling) and the second account.

---

## 4. Decision briefs (PM) — **ALL RULED 2026-08-11 (Step 0 ratified)**

> **DB-1 → (A):** `signal_design_v2` **OFF everywhere** for submission #1; D9 stands; plain-cards hero; enriched hero = v1.1 recapture. Reconciled in both docs.
> **DB-2 → (B):** **no second demo account** — the notes carry a deletion heads-up and the runbook carries the resurrection protocol. (For the record: the risk this brief covered is *reviewer*-initiated deletion of the primary account mid-review, not our own deletion QA — the ruling stands with the protocol as the mitigation.)
> **DB-3 → (A):** the §6 amendment batch ratified; applied as spec v2.1 (2026-08-11, same PR #626).
> **DB-4 → ruled with one recalibration:** email = **`support@getculprit.app`** (PM's pick — verified free of existing auth users; exact-match assertion guard; already-routed inbox). The proposed password was **declined as-proposed**: it was a dictionary-pattern credential on an account whose email is *public* (it's the listed support address), and having been typed into a session it was burned under the tightened D4 regardless. The PM mints a strong-but-typeable password **directly in ASC** (two unrelated words + digits + a symbol; no `l/1/I`/`O/0`), never in any session.

*(Original briefs below, kept as presented.)*

**DB-1 — `signal_design_v2` on the demo account: D9 vs. the screenshot plan's D-SS4 carve-out.**
- **Deciding:** which ratified text governs the flag when SR deems v2 presentable before capture — they currently contradict (R-5).
- **Options:** **(A) — recommended:** first submission ships v2 **OFF everywhere**; D9 stands unamended; the hero uses the screenshot plan's own plain-cards fallback; the receipt-rich hero is a v1.1 recapture when v2 is GA. *Why: zero 2.3 exposure, zero coupling of submission timing to the SR track.* **(B):** amend D9 — allowlist the demo for **both** capture and review once presentable. *(The only forbidden state is capture-on/review-off.)*
- **Consequence:** (A) decouples submission from SR entirely; (B) buys the richer hero at the cost of showing a flag-dark design to review. Either way: one reconciling sentence lands in **both** docs.

**DB-2 — Second demo account for deletion testing (R-6).**
- **Deciding:** whether the submission ships two credential sets (primary + a minimally-seeded deletable account named in the notes).
- **Options:** **(A) — recommended:** yes — nearly free via the §6 parameterization; kills the most likely real-world failure (reviewer deletes the demo account; later look hits dead credentials). **(B):** primary only + the resurrection protocol (runbook re-create/re-seed/update-ASC) — still an improvement, but reactive.
- **Consequence:** (A) adds one runbook account-creation step and one notes line; (B) accepts a possible dead-credentials window mid-review.

**DB-3 — Ratify the spec v2.1 amendment list (§6) + this ruling record.**
- **Deciding:** the Tier-2 edits to `nyx-demo-account-requirements.md` (and the two one-line screenshot-plan edits) — the four blockers R-1..R-4 all land as spec text, so PR 1 builds against the amended story.
- **Options:** **(A) — recommended:** ratify §6 as a batch; the amendments are applied in PR 1's session (docs + code, one PR, per house rules). **(B):** ratify selectively — anything held back that touches R-1..R-4 keeps PR 1 gated.
- **Consequence:** (A) makes PR 1 immediately buildable with the panel's fixes baked into its fixtures/ACs; the §3.5 open item closes (the consultant line = the spec's own recommendation + the second account).

---

## 5. The refined build plan — step by step / PR by PR

*What changed from §12: the shape survives (two committed PRs + a PM-gated runbook); every delta below is a panel finding folded in. Items marked ⟵ carry the finding that produced them.*

### Step 0 — PM ratifies (no session needed)
DB-1, DB-2, DB-3 above, plus the **demo-email convention** (recommend `appreview@getculprit.app` + a typeable password) ⟵ R-2, nice-to-haves.

### PR 1 — Demo story + seed emitter + honest-firing validation · `[PR]` · **adversarial-mandatory + rls-privacy-reviewer** ⟵ R-13
- **Spec v2.1 amendments ride this PR's session** (Tier-2 edits, PM-ratified via DB-3).
- **Deliverables:**
  - `scripts/demo/demoStory.ts` — pure-data declarative story, parameterized `(userId, petId, timezone, now)`, **explicit event table** (per-day meal times/counts/ratings, 4–5 beef exposures, protein fields, dip days anchored to UTC dates with the ≤ now−5min clamp, benign-photo slot) ⟵ R-3/R-4/R-9. **Deterministic row ids** (uuid-v5 from pet_id + story-slot key) + stable storage path ⟵ R-7.
  - `scripts/demo/emitSeedSql.ts` (+ entry point at `scripts/emit-demo-seed.deno.ts` — the glob trap) — renders **run-time-relative**, transaction-wrapped, upsert-based SQL with the assertion prelude (email pattern + pet ownership + food-ownership self-check) and a dry-run counts mode ⟵ R-2/R-7/R-13b. Foods written `ai_extraction_status='manual'` ⟵ R-1. Escaped/dollar-quoted literals + apostrophe property test.
  - **Deno validation** (`supabase/functions/generate-signal/demoStory.detection.test.ts`): ① fires Early (pairs 4–5, never Established) + ② fires `consecutive_low` + venison washes out — **swept across all 24 UTC seed-hours** and at `now + 48h/96h` (the survival-window record that justifies the cadence) ⟵ R-3/R-12i.
  - **jest validation** (`scripts/demo/demoStory.test.ts`): `computeTrialFacts` → exactly the beef feedings off-diet, venison permitted, `trialDietRefusal` null (stays out of the B-494 hold); emitted-SQL assertions (scoping ban — no unscoped DELETE/UPDATE; `'manual'` status; `logged_via='app'`; deterministic ids stable across emits). B-514 timezone idioms (runs under the non-UTC CI job).
- **Gates:** `adversarial-reviewer` (counterexample stated: the 26-variant sweep is the template) + `code-reviewer` + **`rls-privacy-reviewer` on the emitted SQL + runbook** ⟵ R-13a. No `nyx-voice` (no owner-facing copy).
- **AC (replaces §13's equivalents):** both validations green in CI incl. the UTC-hour sweep; re-seed = same row ids (upsert, no deletes); Tier-1 surfaces per the **corrected** renderings — TrialStrip/pet-card day counter (**Day 19**), Trend **symptom chart + trial-start marker** (not "compliance mode"), Patterns cards, Timeline, report renders ⟵ R-11; foods per-account + `'manual'`; the seed is not a migration; PR description names the hard-delete-exemption... which no longer exists (upserts) — name the service-role write instead.
- **Unblocked now**; independent of DB-1/DB-2.

### PR 2 — Reviewer notes (rebuilt) · `[PR]` · can ride PR 1's session or ship standalone
- `docs/app-review-notes.md` per the consultant's outline: 2-sentence what-it-is (**no "clinical-grade"** — "vet-ready"/informational posture, mirrors the 4+ Medical=None answer) → account statement → **the numbered 2-minute golden path** → the AI/health posture paragraph (escalate-only, never reassures, disclaimer accepted at onboarding) → the negatives block (no IAP/ads/hardware/live pet; fictional data) → permissions → **deletion-testing note + second credential set placeholder** → reachable-but-empty surfaces (widget + notifications only; Ask dropped) → contact ⟵ R-6/R-12.
- **Gates:** `nyx-voice` + `clinical-guardrails` + a "no 'clinical-grade' in reviewer-facing text" check.
- **AC:** Culprit-branded; placeholder credentials only; under the ASC notes field limit; golden-path steps match the seeded reality (Day 19, card order ② then ①).

### Live-execution runbook v2 (PM-gated — not PRs) ⟵ R-2/R-6/R-8/R-9/R-10/R-12/R-14
1. **[PM]** Create the demo account (ratified email convention) via real signup + onboarding; **create the second deletion-test account** (DB-2); credentials → ASC only. Pet photo: stock/licensed only.
2. **[Claude]** Resolve ids by email; **dry-run counts → review → execute** the emitted seed via MCP `execute_sql` (assertion prelude protects the wrong-id case; transaction rolls back on any failure).
3. **[PM]** Log the one vomit-with-photo **in-app** (benign photo, provenance rule) — the analysis auto-fires; the app's pipeline strips EXIF. **[Claude]** verifies the `event_ai_analysis` row + EXIF on the object downloaded back from the bucket. *The demo password never enters a session.*
4. **[PM or Claude]** Populate the Signal: PM opens Home once (stale-cache regen lands) **or** Claude POSTs `generate-signal` under the **demo user's JWT** — never the service role. Note the 12/pet/day cap: over-cap silently keeps the old cache.
5. **[Mixed] Verify:** `ai_signals.findings` carries ② and ①; TrialStrip/pet card + Trend marker + Patterns + Timeline on-device from the mirror; report renders (deployed v14) → `vet-report-cold-read` on **that** artifact → CLINIC-READY; Tier-3 surfaces show designed empty states; **credential smoke test** — sign in on a clean device with the ASC-entered strings; **`app_config` allowlist check** — no non-demo uid in any allowlist at handover.
6. **[Claude] Standing cadence:** re-seed + re-generate every 24–48h from Submit until Approved/Rejected (skip while "In Review"); upserts mean the photo/read survive every run. **Account freeze:** no delete/re-create/rotate while a submission is open. **Resurrection protocol** on standby (R-6c).
7. **[PM] Teardown (post-approval, optional):** in-app Settings → Delete account, never a dashboard delete; verify zero demo objects remain in `nyx-event-attachments`.

### Independent riders (tracked, not on this critical path)
- **B-743** — `generate-report` `getUser()` gate (rides the B-494-held redeploy; until then the runbook rule is the mitigation).
- **B-744** — `app_config` allowlist read exposure (structural fix; the runbook check is the interim).
- **Screenshot-plan edits** — the DB-1 reconciling sentence + the stale §2.5 addendum + Day-19 (one small Tier-2 doc pass after DB-1).
- **Step-10 checklist rider** — widget empty-state verified in the cut binary.

### Sequencing & parallelism
PR 1 (with the v2.1 amendments) is the only gate on the live phase and is **fully offline** — buildable the moment DB-3 lands. PR 2 is independent and can ride the same session. DB-1/DB-2 gate nothing in PR 1. The runbook waits only on the PM's account creation (+ email-convention pick). B-743/B-744 are fire-and-forget backlog rows.

---

## 6. Proposed spec amendments — `nyx-demo-account-requirements.md` v2 → v2.1 — **RATIFIED (DB-3 A) & APPLIED 2026-08-11** (same PR; item 15's DB-1 sentence landed per ruling A; the §7/§12.3 items adjusted for DB-2 B — deletion heads-up + resurrection protocol instead of a second credential set)

1. **§3.2 → explicit event table** (times/counts/ratings/proteins; **4–5 beef exposures**, none on control-adjacent days; dip days = UTC-date(now)/−1, ratings `some`+`picked` against a predominantly-`all` baseline; benign-photo condition) ⟵ R-3/R-4/R-9.
2. **§3.2 "why two findings" inverted:** ① is the durable finding (180d lookback); ② is fragile (UTC-dated, expires at next UTC midnight) and is why the cadence exists ⟵ R-3.
3. **§3.1/§4/§13:** delete "Trend compliance mode" (removed in B-417 PR 4) → "symptom chart + trial-start marker + lowered floor; the day counter renders on the TrialStrip/pet card"; **Day 18 → Day 19**; trial record starts at `started_at` (D-18) ⟵ R-11.
4. **§3.3:** "clears SUBSTANTIAL_*" → "volume upgrades the empty state from `building` to `no_pattern`; only a successful `generate-signal` run produces `live`" ⟵ R-11c.
5. **§5:** timezone sentence corrected (② is pure UTC; only ⑥ reads timezone); `logged_via` example → `'app'`; foods written `ai_extraction_status='manual'`; "one `event_ai_analysis`" → "the row `analyze-vomit` produces — the seed never writes it" ⟵ R-11/R-1/R-8.
6. **§2 D5 + §0.1:** mechanism reworded — the `WITH CHECK` does not run on the service-role path; the emitter self-enforces food ownership (assertion + test) ⟵ R-13b.
7. **§8:** delete-then-insert → **deterministic-id upsert**; "re-seed if review slips" → the standing 24–48h cadence with measured survival windows; seed-run UTC-hour precondition ⟵ R-3/R-7/R-12i.
8. **§9:** strike the "rls-privacy-reviewer not required" line (replace per R-13a); teardown = in-app deletion only + zero-objects check; add the `app_config` caveat + handover check ⟵ R-10/R-14.
9. **§11:** S1 resolved (upsert, transaction, assertion prelude, dry-run); S3 upgraded — proteins are **load-bearing AC**, not cosmetic; S4 confirmed (committed SQL + MCP), plus the D4 tightening ("never typed into any agent session…") and the ratified email convention ⟵ R-2/R-4/R-8.
10. **§12.2 PR 1:** gates += `rls-privacy-reviewer`; deliverables/AC per §5 above (UTC-hour sweep, drift assertions, scoping-ban test, deterministic ids) ⟵ all.
11. **§12.3:** runbook v2 as in §5 above (auth named per step; PM-in-app photo; smoke test; freeze rule; cadence; resurrection protocol; second account) ⟵ R-6/R-8/R-12.
12. **§13 AC set:** replace per PR 1's AC above (the corrected surfaces + upsert idempotency + `'manual'` + sweep) ⟵ R-1/R-3/R-7/R-11.
13. **§3.5/D8:** record the consultant ruling (§3 of this doc) — Tier 1+2 ship, Tier 3 out, med promotion rejected on the screenshot coupling, second minimal account added ⟵ §3.
14. **§7:** replace the outline with the rebuilt notes structure (golden path, no "clinical-grade", negatives, second credential set, Ask dropped) ⟵ R-12.
15. **D9:** one reconciling sentence per DB-1's outcome (mirrored in `store-screenshot-plan.md` §2) ⟵ R-5.

---

## 7. Backlog rows added this session (Backlog Protocol — added immediately, no PM approval needed)

- **B-743** — `generate-report` lacks the `getUser()` caller gate `generate-signal` has (service-role bearer renders any pet's report, 200, silently; masked today only by production's one-account shape). Rides the B-494-held redeploy.
- **B-744** — `app_config` is readable by every authenticated user including allowlist UUIDs; move allowlist membership behind a `SECURITY DEFINER` check or service-role-only surface. Interim: the runbook handover check.

---

## Persona sign-off (DoD)

- **App Store submission specialist ✓** — Tier ruling delivered (§3); tried the "what does a reviewer actually do in 15 minutes" walk against the plan → the golden-path gap, the deletion-testing hole, and the re-seed cadence assumption surfaced (R-6, R-12).
- **Adversarial reviewer ✓ (executed, 26 variants)** — tried venison-in-every-case-window co-attribution → **held structurally** (`controlExposed == pairs` by construction); tried 00:30/06:00-UTC seed runs and +25h/+72h re-reads → **② broke** (UTC bucketing; TTL self-degradation); tried 2-exposure/07:00-meals/unset-proteins/adjacent-contraband variants → **① silently deleted** in each; tried 3×-relogged bouts → episode collapse held (pairs=3, not 9).
- **Dir. of Engineering ✓** — verified §4 against code + live project (v14/v27 confirmed); tried the "can Deno import scripts/demo?" topology question → dissolved by the `lib/dietTrial.ts` precedent under current CI flags; found the reap cascade (R-1) by tracing the food cache path.
- **rls-privacy-reviewer ✓** — attacked every JWT boundary (foods/events/signals/attachments/confused-deputy on all four functions/share tokens) → **all held**; attacked the service-role seed path → R-2/R-8/R-13b; attacked teardown → R-10.
- **Trust & Safety ✓** (via the same lane) — D4 tightened; EXIF/provenance rule; `app_config` disclosure corrected.
- **Designer / Dr. Chen / QA** — carried in-context: the benign-photo ruling keeps the Signal's story honest without a scarier card the narrative doesn't intend (Dr. Chen); the notes' escalate-only framing preserved (clinical-guardrails); AC set corrected so QA gates on surfaces that exist (R-11).

**Tests:** N/A — review/docs session; no app code changed. The adversarial lane's 26-variant scratch suite was executed against the shipped engine and removed (its assertions are specified into PR 1's validation deliverables).
