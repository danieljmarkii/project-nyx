# App Review Demo Account — Requirements

**Version:** v2.1 · **Created:** 2026-07-11 · **Last Updated:** 2026-08-11 · **Owner:** PM, with Data Scientist / Trust & Safety / Dr. Chen / Designer / QA lenses
**Backlog:** B-271 · **Guide:** [`docs/app-store-submission-guide.md`](./app-store-submission-guide.md) step 11 · **Register:** [`docs/app-store-readiness.md`](./app-store-readiness.md) Tier 2
**Status:** **v2.1 — panel-reviewed, amended, build-ready (2026-08-11).** v1 decisions D1–D7 ratified 2026-07-11 (#336); the v2 deltas (D5 inversion, D8–D10, the tiered scope menu) ratified 2026-08-09. **2026-08-10: a four-lane convened specialist review** (App Store consultant / adversarial-executed / Dir. Eng / rls-privacy — full record **[`docs/demo-account-plan-review-2026-08.md`](./demo-account-plan-review-2026-08.md)**, #626) verified the architecture, **executed** the story against the shipped engine, and produced the v2.1 amendments now folded in throughout. **Step-0 rulings ratified 2026-08-11 (PM):** DB-1 `signal_design_v2` **OFF everywhere** for submission #1 (D9 stands; plain-cards hero) · DB-2 **no second demo account** (resurrection protocol is the mitigation) · DB-3 the amendment batch · DB-4 demo email = **`support@getculprit.app`** (verified free of any existing auth user), password minted by the PM **directly in ASC** (strong-but-typeable; never in any session or repo). **The §3.5 consultant line is set — no open items.** Next work: PR 1 (seed) and PR 2 (reviewer notes).

---

## 0. What changed in v2 (read this if you knew v1)

**v2.1 (2026-08-11) in one paragraph:** the convened panel review (`docs/demo-account-plan-review-2026-08.md`) *executed* the Cooper story against the shipped engine and found the plan's durability rationale backwards — the intake-dip finding (②) is the fragile one (UTC-date bucketing; it expires at the next UTC midnight), the correlation (①) is the durable one but had zero margin at 3 exposures. v2.1 folds in the fixes: an executable §3.2 event table (**4 beef exposures**, pinned times/ratings/proteins, UTC-anchored dip days), `ai_extraction_status='manual'` on seeded foods (the reap cascade), a guarded **deterministic-id upsert** replacing the service-role delete-then-insert, a standing re-seed **cadence**, the corrected Trend/still-building mechanisms, the rebuilt §7 reviewer notes, the §12.3 runbook v2 (auth named per step; the password never enters a session), and `rls-privacy-reviewer` added to PR 1's gates. The §3.5 consultant line is ruled. Nothing about the two-PR shape changed.

The v1 plan was written against migrations 001–029, before the wedge feature had a write path. Five things moved the ground under it:

1. **`food_items` is per-account now (migration 033 / B-354), so v1's D5 is *inverted*.** The old rule was "reference existing *global* food rows only, never create any" — because a food row was visible to everyone. That is no longer true: food rows are owned (`created_by_user_id`), RLS default-deny to other accounts. So the demo now **creates its own** venison/beef rows — and *must*, because the `diet_trial_foods` RLS `WITH CHECK` rejects a food the demo user doesn't own.
2. **The diet-trial lifecycle shipped (B-417, PRs #450–#481).** `diet_trials` held zero rows when v1 was written; the story faked a bare row. It now seeds the **real** schema — `diet_trials` (with `indication`, `phase`, `ended_at`, `transition_started_at`), the dated **`diet_trial_foods`** allowed set, and `target_protein` (053) — and the "contraband beef" is caught by the **shipped** off-diet detector (`lib/dietTrial.ts`), not a fake.
3. **The trial tables are now mirrored on-device (B-417 PR 2).** v1's §4 said `diet_trials` wasn't hydrated; it is now (in `LOCAL_WIPE_TABLES`). Server-side seeding still reaches every on-device surface — the conclusion holds, the mechanism is updated.
4. **The bar is now tiered (D8).** v1 treated "make the Signal genuinely fire + ~50 events" as *the* standard. v2 restructures around a **defensible minimum → optional richness** menu (§3.5) so the App Store consultant sets the line, rather than baking in the maximal seed.
5. **Rebrand Nyx → Culprit** + a wave of new surfaces (Ask, notifications, Vet Files, med strip/history, the widget, the Signal redesign). Each gets an explicit in/out call in the tier menu (§3.5) and the exclusions list (§10). The one that's a *correction* not a choice: **Ask is out because its client screen isn't shipped** (A5 ⬜), so it isn't reviewable regardless.

---

## 1. Context — why we're doing this

Culprit is **login-gated**: after the B-251 revamp, App Review's first screen is Landing → account → pet setup. Nothing real is reachable without an account. There are three escalating reasons a seeded demo account is a submission gate, not a nicety:

1. **Apple requires working credentials (Guideline 2.1).** Any login-gated app must supply demo sign-in credentials in App Review Information, or it's rejected on sight.
2. **An *empty* account is nearly as bad as no account.** Every surface that differentiates Culprit is an *intelligence* surface that needs weeks of data to render anything — the Home Signal, Trend, Patterns, the vet report all show designed empty states on day one (Principle 3). A reviewer who can't make the app do its distinctive thing writes the stock rejection *"we were unable to evaluate the app's features"* — the most common rejection for data-driven apps.
3. **The demo account is Apple's only window into the wedge.** Our whole positioning is that we're *not* a generic tracker — logging becomes a clinical-grade Signal and vet report. That claim is invisible in an empty account. This is the one chance to show the reviewer the Signal firing and the report rendering. **New in v2:** the wedge is now a *genuinely shipped feature* (the diet-trial lifecycle), so the demo shows the real thing working, not a hand-built row.

**Bonus:** a pre-seeded, already-confirmed account sidesteps the B-152 email-confirmation dependency — the reviewer never has to receive and click a confirmation email.

The hard part — and the reason this needs a spec rather than "insert some rows": **the Signal must *genuinely* fire, and the `clinical-guardrails` invariants forbid faking it.** The detection engine only emits a finding when a real pattern clears real thresholds, and n=1 never reassures. So the demo data has to tell an honest clinical story that legitimately trips a detector. That's a product-narrative decision with a clinical-integrity constraint on top — §3.

---

## 2. Decisions

**v1 (ratified 2026-07-11, #336):**

| # | Decision | Rationale |
|---|---|---|
| **D1** | **v1 story = a diet-trial dog** (Cooper), leading with the flagship food↔symptom correlation Signal + a safety intake-decline backstop. | The literal primary wedge; lights up the most surfaces. **v2:** now seeds the shipped B-417 lifecycle, not a bare row. Cat (picky-vs-sick) is held for demo account #2 (§6). |
| **D2** | **Seed as an idempotent, date-relative, parameterized SQL script** (`scripts/seed-demo-account.sql`), re-run right before submission. | Detectors read recent windows + the Signal cache has a 24h TTL, so fixed dates age out (§8). Parameterization is what makes "multiple demo accounts later" cheap (§6, B-324). |
| **D3** | **`generate-signal` is invoked for the demo pet after seeding** — the Home Signal is a **server cache**, not computed on-device. | Seeding rows is necessary but not sufficient; without the Edge Function run, the reviewer sees a "still building" card (§4). |
| **D4** | **Credentials live only in App Store Connect — and the password is never typed into any agent session, terminal history, or repo file** (tightened v2.1: "not in version control" alone is what let a "Claude signs in with the demo password" runbook branch through). The account is created through the real signup flow; `docs/app-review-notes.md` uses a placeholder. **Ruled 2026-08-11 (DB-4):** demo email = **`support@getculprit.app`** (exact-match — the seed's assertion prelude refuses any other target; verified free of existing auth users); password strong-but-typeable (no `l/1/I`/`O/0` ambiguity), **minted by the PM directly in ASC**. | Trust & Safety: no secret in version control *or any transcript*; the ratified email is what makes the seed's refusal guard possible. |
| **D6** | **Seed 1–2 real event photos**; leave live camera as the reviewer's own demo (pointed at in the notes). | Timeline looks alive without shipping a fake camera flow; one photo also feeds the per-incident vomit read (D7). |
| **D7** | **Include the per-incident vomit AI read** (run `analyze-vomit` on one photo'd vomit event). **Skip** the medication/adherence thread for v1 review. | (a) is another visible "intelligence" moment for cheap; (b) is scope the reviewer doesn't need. **v2:** now governed by the D8 tier menu — the vomit read is Tier 2, medication is Tier 3. |

**v2 (ratified 2026-08-09):**

| # | Decision | Rationale |
|---|---|---|
| **D5** ⟳ | **INVERTED. Seed the demo account's OWN `food_items`** (a venison staple + a beef "contraband" row). | Migration 033 (B-354) re-scoped `food_items` to per-account: demo rows are RLS-scoped to the demo user and **cannot** leak into any real user's picker (read-side verified under attack, review R-boundary pass). *Mechanism corrected v2.1 (R-13b):* the `diet_trial_foods` RLS `WITH CHECK` (040) does **not** bind the service-role seed path (RLS bypassed; 041's trigger checks trial↔pet only, not food ownership) — so the **emitter self-enforces** food ownership (assertion + PR-1 unit test); client-read RLS + the 041 trigger are the live enforcement. The old hazard became the new requirement, enforced by the seed itself. |
| **D8** ✚ | **Tiered scope.** Build the seed as a **defensible minimum (Tier 1) + optional additive richness (Tiers 2–3)**; the App Store consultant sets the line (§3.5). | PM steer 2026-08-09: "we don't necessarily need data in every feature." The doc becomes a decision surface for the consultant, not a fixed maximal spec. Tiers 2–3 are additive toggles in the script. |
| **D9** ✚ | **Ask OUT of the demo; Signal-v2 and the widget NOT allowlisted for the review account.** | **Ask** — its client surface (A5) isn't shipped, so it isn't reviewable (a correction, not a choice). **Signal-v2** (`signal_design_v2`) is flag-dark/GA-held — the reviewer should see what actually ships (the classic Signal); allowlisting to preview an unshipped design is wrong. **Widget** — per the B-712 beta ruling, don't allowlist the review account; adding the widget shows the neutral "No pet in this slot yet" empty state, which is honest. **DB-1 reconciliation (PM, 2026-08-11):** this ruling conflicted with `store-screenshot-plan.md` §2's D-SS4 carve-out ("`signal_design_v2` ON for capture AND review once presentable") — **D9 governs for submission #1: v2 stays OFF everywhere**, the hero uses the screenshot plan's plain-cards fallback, and the receipt-rich hero is a v1.1 recapture at GA. The one forbidden state either way: capture-on/review-off (Guideline 2.3 exposure on the lead frame). Mirrored in the screenshot plan §2. |
| **D10** ✚ | **Seed against the shipped diet-trial lifecycle**, not a bare `diet_trials` row: one active trial + a dated `diet_trial_foods` allowed set + `target_protein`; the off-diet exposure is **detected** by `lib/dietTrial.ts`, never asserted. | The wedge shipped; the demo must exercise the real feature (card v2, TrialStrip, trend compliance mode, off-diet detection) so the reviewer sees the product, and so the seed can't drift from production behavior. |

---

## 3. The v1 demo story — "Cooper"

**The owner & pet.** A reactive owner (Jordan persona) whose dog **Cooper** (~12 kg, medium breed) was sent home on a **novel-protein elimination trial** to chase down a food trigger behind his vomiting. This is the exact wedge scenario.

### 3.1 The trial (seeded against the real B-417 schema)

One active `diet_trials` row for Cooper:
- `status = 'active'` (the one-active-trial UNIQUE index means exactly one — 040 §3)
- `indication = 'gi'` (vomiting is a GI sign; ENUM, not free text — 040 §1)
- `phase = 'elimination'`, `food_label = 'Venison LID'`
- `started_at` = 18 days ago; `target_duration_days = 42` (owner-set 6-week target → the **TrialStrip / pet-tab card** render the day counter, **"Day 19 of 42"** — day-1-inclusive, B-421; the Trend zone contributes a trial-start marker on the symptom chart and a lowered symptom-mode floor — its "compliance mode" was **removed in B-417 PR 4**, corrected v2.1/R-11)
- `transition_started_at` ≈ 25 days ago (a realistic ≥1-week transition before exclusive feeding)
- `target_protein = 'venison'` (migration 053 / B-704 → the trial card names the protein)

Plus the **allowed set** in `diet_trial_foods` (D3 / 040 §2):
- the venison food as `role = 'primary_diet'`, `allowed_from` = `started_at`, `food_label` captured at write time

The **beef treat is deliberately NOT in the allowed set** → the shipped off-diet predicate (`lib/dietTrial.ts`) flags each beef feeding as an **off-diet exposure**, dated correctly against membership. This is the real feature detecting a real contraband, not a fabricated flag.

### 3.2 The ~3-week event sequence (v2.1 — executable, not prose; every value below is load-bearing)

(Relative to "now"; all timestamps stored UTC; regular events sit at story-local mid-day-ish hours per B-514 so no window straddles a midnight — **except the dip days, which are UTC-anchored by rule**.) The design encodes two honest findings and a rich, scrollable timeline. The adversarial review *executed* this sequence against the shipped engine (26 variants; review doc §2.1 R-3/R-4) — the values below are the measured safe band, not taste:

| Day | Events | Why it's there | Detector effect |
|---|---|---|---|
| D-21 → D0 | **2 venison trial meals/day at 08:00 and 18:00 story-local**, rated **`all`** (an occasional `most` is fine; the baseline must read ≈4.0) | Establishes the ≥4-meal baseline **with explicit times** — an in-spec "1 meal at 07:00" reading leaves every correlation control window empty and silently kills ①. As the daily **staple** venison **washes out structurally** (see §3.3). In-allowed-set adherence runs from **D-18** (trial start); the D-21..D-19 meals predate the trial window and serve Timeline/baseline only | baseline for ① and ②; trial adherence |
| **D-16, D-12, D-8, D-3** | a **beef** treat ~16:00, each followed **~2–4h** later by a **vomit** (12h attribution window — comfortable) | **4 exposures — the measured safe band.** 3 is the exact detector floor (zero margin: lose one to anything and ① vanishes silently); **6 flips the card to `established`**, which is not the intended tier. Spacing ≥3 days apart so no beef day sits adjacent to another vomit day (**control-arm contamination** kills ①). Not in `diet_trial_foods` → each is an **off-diet exposure** | **① food↔symptom correlation** (Early tier) — *"beef may be linked to Cooper's vomiting"* + the trial's off-diet-exposure surface |
| D-3 vomit | + a **photo** attachment — **benign** (no visible blood / foreign material; provenance rule §9) | Feeds the per-incident read (D7, Tier 2) + timeline realism. Benign is deliberate: the contextual escalation floor (repeated vomits + the dip) forces `worth_a_call` regardless, a gory photo risks the 4+ rating's credibility **and** would fire `incident_red_flag` — a scarier safety card the story doesn't intend | **`analyze-vomit`** → `event_ai_analysis` read (worth_a_call / monitor — never reassuring) |
| D-20, D-6 | two **weight_checks** | Two samples = trend + coloured verdict allowed | Patterns weight card + Profile weight trend |
| D-14, D-7 | a normal **stool** each | Timeline realism | — |
| **`UTC-date(now)` and `UTC-date(now)−1`** | both trial meals each day rated **`some` / `picked`** against the `all` baseline (delta ≈ 2.25 — comfortably past `minDeclineDelta = 1`; the old "≥1 WSAVA point" spec sat *exactly on* the threshold) | The second finding. **UTC-anchored by rule, not story-local "yesterday/today":** `detectIntakeDecline` buckets on **UTC calendar dates** (`detection.ts:2631`), so a local-day-anchored seed run before ~08:00 local produces no ② at all. Any generated instant is clamped to **≤ now − 5 min** so today's meals are never future-dated | **② intake_decline** (`consecutive_low`) — *"Cooper's eating less than usual"* |

**Hard AC (not cosmetic — R-4):** `proteins` / `primary_protein` set on **both** foods. The correlation detector bails before considering anything unless ≥2 distinct proteins exist in the record — an unset protein field on either food makes ① structurally impossible.

**Why two findings — durability rationale inverted in v2.1 (measured, R-3).** v2 had this backwards. **① is the durable finding**: 180-day lookback, calendar-relative control matching, no `now`-dependence — it survived every time-shift the adversarial pass threw at it. **② is the fragile one**: it is only true until the **next UTC midnight**, and past the 24h cache TTL the client's own background regen *replaces* the good cache with the degraded one — it self-destructs, no re-seed needed. ② still earns its place (it fires from far less data, ranks first as safety, and covers submission-day freshness), but it is why §8's **standing cadence** exists rather than a one-off re-seed. Both findings are clinically honest — a real trigger being *found*, a real dip being *flagged*, zero reassurance — and both compose in one Signal run (no crowd-out: safety findings are never dropped; the reviewer sees ② first, ① second, so the reviewer notes point at the *cards*, not "the headline").

**Why this story dodges the B-494 hold.** The live `generate-report` (v14) still carries the pre-refusal-band heuristic (the B-494 redeploy is held; see the diet-trial review). That hold bites a *refusing* patient — an empty safety band read as reassurance. Cooper is a **found-trigger + mild-dip** story, not a refusal, so the held detector isn't the one his report needs, and the report renders correctly at v14. (Do not reshape the story into a refusal case to "show more" — that would walk straight into the held gate.)

### 3.3 The honesty check (Data Scientist + Dr. Chen)

The trial food (venison) washing out of the correlation is the exact correctness property the `nearest-preceding-meal` bug violated and the adversarial reviews exist to protect — and the 2026-08-10 review **verified it under executed attack**: the washout is *structural*, not statistical. A control window is only eligible if it contains a feeding, beef days are excluded as symptom days, so the only thing that can make a control window eligible is venison itself — `controlExposed(venison) == pairs` in every matched set and its risk difference is ≤0 **by construction** (held under ±2h jitter, UTC-day straddles, and 3×-relogged bouts). *Nuance for future story profiles (B-324):* this guarantee comes from the single-food diet — a second daily food loses it automatically, so any new profile re-runs this verification. The vet report must read clinic-grade cold (`vet-report-cold-read`, on the **deployed** function's artifact), and no surface may reassure on the *absence* of a red flag (n=1 invariant).

Event volume (~50+ events over 21 days) comfortably clears `SUBSTANTIAL_MIN_EVENTS = 8` / `SUBSTANTIAL_MIN_DAYS = 7` — but note the corrected mechanism (R-11c): that volume only upgrades the *empty state's copy* from `building` to `no_pattern`. **What gets the card to `live` is a non-empty `ai_signals.findings` row — D3's `generate-signal` run, nothing else.**

### 3.5 The tiered inclusion menu (D8 — **RULED 2026-08-10/11: the line is set**)

**The consultant call is made** (review doc §3, PM-ratified with Step 0): **Tier 1 + Tier 2 ship; Tier 3 stays out; no promotions.** The one promotion the spec had flagged as cheapest — a medication course — is **specifically rejected**: the ratified screenshot plan freezes the capture-account Home with *no MedStrip* (§2 item 4), so seeding meds would fork the reviewer's Home from frame 6 or force a recapture, for zero added review value. Single pet confirmed (matches the capture plan's no-chevron state; multi-pet is demo account #2, B-324). **DB-2 ruled (B): no second deletion-test account** — the reviewer-initiated-deletion risk (a reviewer testing the required 5.1.1(v) flow destroys the account and later looks hit dead ASC credentials) is instead covered by a deletion heads-up line in the notes + the §12.3 **resurrection protocol**. The table below stands as the record of what each tier takes:

The seed is built so the tiers below are **additive toggles**. Tier 1 is the defensible submission floor. Nothing here is a hard blocker except Tier 1.

| Tier | Surfaces | What it takes | Recommendation |
|---|---|---|---|
| **Tier 1 — must-have (the floor)** | Working credentials · a non-empty account · the **wedge visible**: the diet-trial card + Trend compliance mode + a populated Timeline + Patterns rendering + the **Signal firing** (② at minimum, ① as flagship) + a **vet report that renders** | The §3.1–§3.2 trial + event sequence + `generate-signal` run | **Ship this.** It's the line between "evaluated" and the "unable to evaluate the app's features" rejection. |
| **Tier 2 — nice-to-have (cheap intelligence)** | The per-incident **vomit AI read** (1 photo, D7) · the **weight trend** · **stool** events | 1 photo'd vomit + `analyze-vomit` run; 2 weight_checks; 2 stool events (all already in §3.2) | **Include** — low cost, high "not a generic tracker" payoff. Already in the story. |
| **Tier 3 — skip for v1 (present as designed empty/neutral states)** | **Medication** (strip/history) · **Vet Files** · **Ask** · **Signal-v2** · **home widget** · **notifications** | Nothing — these render their designed empty/neutral states with no seed | **Skip.** Each is honest empty (or, for Ask/Signal-v2/widget, not shown per D9). Consultant may promote any to Tier 2 (med course + vet doc are the cheapest promotions). |

---

## 4. The two rendering paths (the mechanism that must be right)

Seeding is split by *how each surface renders*. Getting this wrong is how the reviewer ends up staring at empty states on a fully-seeded account.

| Surface | Renders from | Requirement |
|---|---|---|
| **Home Signal** + AI Summary | **Server cache** (`ai_signals`), read cache-only — never computed on open (`hooks/useSignal.ts`) | Events seeded **AND** `generate-signal` POSTed for the pet (or Home opened once so the background regen lands) |
| **Trend zone** | On-device, hydrated SQLite (last 14 days) | ≥3 distinct days with any event; an active trial adds a **trial-start marker** + drops the symptom-mode floor to 1 (its "compliance mode" was removed in B-417 PR 4 — the "Day 19 of 42" counter renders on the **TrialStrip / pet card**) |
| **Diet trial card + `TrialStrip`** | On-device, the **local `diet_trials` + `diet_trial_foods` mirror** (B-417 PR 2) | the seeded active trial + its allowed set sync down on login (see hydration below) |
| **Patterns dashboard** | On-device, hydrated SQLite (last 30 days) | ≥1 symptom **or** feeding **or** weight; coloured verdict needs ≥2 samples |
| **Timeline** | On-device, hydrated SQLite | any non-deleted events |
| **Vet report** | Generated on demand → writes a `vet_reports` row + PDF (`generate-report` v14) | substantive events inside the report's date range |
| **Per-incident vomit read** | `event_ai_analysis`, written by `analyze-vomit` (service role) | run the function on a photo'd vomit event |

**Hydration (B-054 + the B-417 mirror).** On the reviewer's device, login → `syncNow()` → down-sync pulls the account's rows into local SQLite. The current mirrored set (`lib/hydration.ts` `LOCAL_WIPE_TABLES`) now includes `events, meals, event_attachments, vet_visit_attachments, medication_*, weight_checks, diet_trial_foods, diet_trials, vet_documents, vet_visits, feeding_arrangements, notification_preferences` + the food cache. So **server-side seeding reaches every on-device surface, including the diet trial**. Precisely (v2.1): everything the seed writes is either mirrored on-device or read live from the server — `event_ai_analysis` is server-read too, not hydrated — and `ai_signals` is the one that *additionally* requires the explicit regen, which is exactly why D3's `generate-signal` run is required. One hydration caveat the seed design absorbs (R-7): only `meals` reconciles by **absence** on hydration — a server-side hard delete never propagates to an already-synced device, which is one of the reasons §8 now upserts on deterministic ids instead of delete-then-insert. (Re-verify the exact mirrored set against `lib/sync.ts` / `lib/hydration.ts` at build time; it grows.)

---

## 5. Data model & conventions

The seed writes to (schema through migration 055): `user_profiles` (set `timezone` — detector ⑥ reads it; **scoped `WHERE id = <demo user>` under the §8 assertion prelude** — it is user-scoped, and a swapped id would re-zone a real account's every local-midnight boundary), `pets` (`is_active` true), `events` (`deleted_at` NULL; `occurred_at` + `occurred_at_confidence`; `logged_via`), `meals` (`intake_rating` enum), `weight_checks`, **`food_items` (the demo user's own — per-account)**, **`diet_trials`** + **`diet_trial_foods`** (the allowed set), and — for Tier 2 — one `event_attachments` row. **The seed itself never writes `event_ai_analysis`** — that row is produced by the real `analyze-vomit` run at runbook step 3; a seeded row would be a fabricated AI read (`clinical-guardrails`). Conventions that must hold:

- **All timestamps UTC**; the app converts at display using `user_profiles.timezone`. *(Corrected v2.1, R-11d — the old sentence here was wrong in the direction that matters:* the app's day boundary is local midnight (B-421), but **`detectIntakeDecline` buckets on UTC calendar dates** and only detector ⑥ reads the timezone — so the dip days are **UTC-anchored** per §3.2 and the §8 seed-run-hour rule applies; all other events sit at story-local mid-day-ish hours per B-514 so no window straddles a midnight in any zone.)*
- **Soft-delete asymmetry:** `pets` uses `is_active` (boolean); `events` use `deleted_at` (NULL = active). Seed active rows.
- **`meals.intake_rating`** ∈ `refused | picked | some | most | all` (WSAVA 5-point); **`events.occurred_at_confidence`** ∈ `witnessed | estimated | window` — vary it (some witnessed, some discovered) so the timeline is realistic and the per-incident/timing detectors have honest inputs. **`logged_via` = `'app'`** — the enum is `app | notification | reconciled | widget | intent | watch | device`; the previously-suggested `'quick_log'` is not a value and fails the insert (`meals` carries its own `logged_via` too).
- **Every seeded `food_items` row is written `ai_extraction_status = 'manual'`** (R-1 — **the highest-severity build finding**): the column defaults to `'pending'`, and `reapStalePendingFoods` hard-deletes owned pending foods older than 30 minutes on *every sync cycle* — the delete CASCADEs the trial's allowed set away and SET-NULLs every seeded meal's `food_item_id`, silently destroying both findings ~30 minutes after the reviewer's first sync.
- **`food_items` are PER-ACCOUNT (D5 inverted).** Create the demo user's own venison + beef rows (`created_by_user_id` = the demo user). They are RLS-scoped and invisible to every other account, so there is **no** catalog-leak hazard — the opposite of v1's rule. The `diet_trial_foods` allowed-set rows must reference these owned food ids (the RLS `WITH CHECK` enforces it).
- **`diet_trial_foods` membership is DATED.** `allowed_from` on the venison primary-diet row = the trial start; do not backdate edits (040 §2 — dated membership is what stops a retroactive rewrite of exposure history).
- **RLS:** everything is the demo user's own pet data; the seed runs with the **service role** via the Supabase MCP (`execute_sql`), so it isn't RLS-gated on write, but the *shapes* must satisfy the same ownership graph (`pet_id ∈ pets WHERE user_id = <demo user>`, and `food_item_id ∈ food_items WHERE created_by_user_id = <demo user>`).

---

## 6. Multi-account architecture (PM steer — "multiple demo accounts in the long term")

The PM's note that we'll likely want several demo accounts is a **v1 design constraint**, not just a future item: build the seed so a second account is a *config*, not a rewrite.

- **Parameterize** the script by `(target_user_id / email, story_profile)` — the account identity is an input, never hardcoded (contrast `scripts/export-pet-timeline.sql`, which hardcodes a prod `pet_id`).
- **Story profiles as data.** Cooper (diet-trial dog) is profile #1. The picky-vs-sick **cat** (Sam persona — a single below-baseline day fires the safety Signal) is the obvious profile #2, and a two-pet household (multi-pet is free — B-086) a profile #3. Each profile is a declarative event list the same engine applies.
- Tracked as **B-324** (Later) so the expansion is on the record; v1 ships one profile but with the seam in place.

Why it matters beyond convenience: multiple honest stories let us demo different surfaces (correlation vs. the picky-eater safety read vs. multi-pet-is-free) and give resubmission flexibility if a reviewer asks to see something specific.

---

## 7. Reviewer notes — `docs/app-review-notes.md`

A short doc the PM pastes into ASC → App Review Information → Notes (the demo **credentials** go in the dedicated *Sign-In Required* username/password fields, not the free-text notes). **Rebuilt v2.1 per the consultant review (R-12)** — the two structural changes: a *scripted numbered golden path* instead of an unordered "where to look" (a numbered path IS the story, and it steers the reviewer's 5–15 minutes onto exactly the surfaces the seed guarantees), and **no "clinical-grade" anywhere in reviewer-facing text** (the age rating answered Medical/Treatment = *None* on informational-posture grounds; "clinical-grade" in the notes invites the 1.4.1 lens the rest of the submission was written to avoid — use "vet-ready" / "a summary your vet can scan"; internal docs may keep the phrase, the ASC notes may not). Outline, in order:

1. **What Culprit is** (2 sentences, listing-consistent, informational posture stated affirmatively): logging → trends, pattern findings, and a summary report the owner brings to their veterinarian; *"informational only — it does not diagnose, treat, or replace veterinary care."* (Brand = **Culprit**.)
2. **Account statement:** the demo account is pre-confirmed — no email access needed; a fresh self-created account requires clicking a confirmation link, which is why the demo exists.
3. **The numbered 2-minute golden path:** ① sign in → Home; the Signal cards (counts + "not a diagnosis" framing — the safety card ranks first by design) → ② the diet-trial card ("Day 19 of 42", the allowed list, a detected off-diet exposure) → ③ Trend + Patterns → ④ Timeline → the photo'd vomit → the per-incident read (*"it only ever suggests monitoring or a vet call — by design it never says a pet is fine from one photo"*) → ⑤ generate the vet report → share sheet → ⑥ optional: log your own meal/symptom with a photo (the camera-permission demo; their entries are treated as real data and findings recompute on a daily cadence).
4. **The AI/health posture paragraph** (the 1.4.1 pre-emption): all AI output is one-directional — may suggest monitoring or a vet call, never diagnoses, never recommends treatment, never declares a pet healthy; disclaimer presented and accepted at onboarding; AI runs only on data/photos the owner logs.
5. **The negatives** (silence makes reviewers hunt — R-12c): no in-app purchases/subscriptions/paywall (everything shown is free), no ads, no third-party analytics, no external hardware, no live animal needed to evaluate anything, all demo data fictional (2.3.9-consistent).
6. **Permissions the reviewer may see:** camera/photo prompt only when attaching a photo to a log entry; notifications off by default — a prompt appears only if enabled in Settings (Culprit never nags; Principle 4).
7. **Deletion heads-up (DB-2 ruled B — no second account):** account deletion (Settings) is fully functional and **permanent** — deleting this account removes the seeded demo history. *(The honest warning also discourages casual deletion; if it happens anyway, the §12.3 resurrection protocol is the recovery.)*
8. **Reachable-but-empty surfaces — only things a reviewer can actually reach (R-12d):** the home-screen widget shows a neutral "No pet in this slot yet" state on this account; medication / vet-document / notification features render their designed empty states. **Ask is dropped from the notes entirely** — no entry point exists in the build, so naming it only invites curiosity about an unshipped feature.
9. **Contact:** `support@getculprit.app`, same-day response.

Runs through `nyx-voice` + `clinical-guardrails` (no reassuring phrasing) + the "no 'clinical-grade' in reviewer-facing text" check; stays under the ASC notes field limit.

---

## 8. Freshness, lifecycle & the re-seed protocol

Detectors read recent windows (intake = 14d, worsening = 7d, chronicity = 56d, descriptive = 60d) and `ai_signals` has a **24h TTL**. Consequences the script must handle (§ rewritten v2.1 — R-2/R-3/R-7/R-12i):

- **Date-relative seeding** — every timestamp computed from "now" (the emitter renders **run-time-relative** `now()`-interval SQL, so the committed artifact is timeless and "re-run" literally means re-run, never silently "re-emit then re-run"), with the dip days UTC-anchored per §3.2.
- **Idempotency = deterministic-id UPSERT, not delete-then-insert.** Every row id is derived from the demo `pet_id` + a story-slot key (`uuid_generate_v5(demo_pet_id, 'meal-D-16')`-style); the seed is `INSERT … ON CONFLICT (id) DO UPDATE` with a bumped `updated_at`. This one design closes three findings at once: re-seeds LWW-update in place on any already-synced device (no ghost timeline, no second locally-active trial — hydration has no absence-reconcile outside `meals`); the Tier-2 photo attachment + AI read **survive** every re-seed (stable ids + stable storage path — no repeated Anthropic call, no credential needed in the cadence); and the destructive service-role `DELETE` disappears, collapsing the blast radius that made the old design a blocker. Note `food_items` are scoped by `created_by_user_id`, not `pet_id` — the upsert covers them under the same assertion prelude.
- **Safety rails on every run (R-2):** the whole seed runs in **one transaction**; an **assertion prelude** executes before any write — the target user's email must equal `support@getculprit.app` (the DB-4 ruling) *and* the target pet must be owned by that user, else `RAISE EXCEPTION`; a **dry-run counts** pass is read back before the real execution; and a PR-1 unit test bans any emitted `DELETE`/`UPDATE` lacking a `WHERE` naming both the demo pet and the demo user. **Seed-run hour rule (R-3):** don't run before ~09:00 UTC, or accept the clamp placing the first dip meal minutes after UTC midnight.
- **A standing cadence, not "re-seed if review slips" (R-12i):** from Submit until a terminal status (Approved/Rejected), **re-seed + re-run `generate-signal` every 24–48h**, skipping any run while ASC shows "In Review" (transitions arrive by email; a fixed morning run rarely collides). Review start is unannounced and ② is only true until the next UTC midnight — the cadence is what keeps the Signal honest for whichever day the reviewer actually opens the app, and it also covers a reviewer returning days later on a Resolution Center thread. PR 1's validation measures each finding's survival window at `now + 48h/96h` so the cadence is justified by numbers, not folklore.
- **Re-run `generate-signal` after every re-seed** (D3) — a fresh cache, not a 25-hour-stale one. Mind the **12 calls/pet/day cap**: over cap the function returns early and silently leaves the previous cache in place — a submission-day trap during debug loops.

---

## 9. Trust & Safety (rewritten v2.1 — the review's operational findings live here)

- **No secret in the repo — or any transcript** (D4, tightened): the password is minted by the PM directly in ASC and is *never typed into any agent session, terminal history, or repo file*; placeholder in the notes doc. Runbook steps that need the demo user's identity are PM-in-app by design (step 3) or use the demo JWT the PM establishes (step 4) — never a password handed to an agent.
- **Account isolation — pet data, yes; `app_config`, no (R-14).** The demo account is a normal, RLS-scoped user for every pet-data surface (all JWT-side boundaries held under the review's attack pass). But `app_config` is readable by *every* authenticated user, allowlist UUIDs included — so the pre-handover check below is mandatory, and the structural fix is **B-744**. The service-role `execute_sql` step is guarded by §8's assertion prelude + transaction + dry-run — and **`rls-privacy-reviewer` runs against the emitted SQL and the runbook before the first live execution** (a PR-1 gate; the v2 sentence waiving it is struck — none of the operational findings were properties of "single owner").
- **Pre-handover check (the moment credentials are entered in ASC):** `select key, value from app_config;` — no non-demo uid may appear in any `allowlist` (consistent with D9: the demo account is allowlisted for nothing).
- **The Tier-2 photo (R-9):** provenance rule — a purpose-taken or licensed image, consented, no identifiable surroundings, source named at runbook time; it enters **through the app** (the PM logs the vomit-with-photo — which is also the app's only EXIF strip; a direct bucket upload bypasses `compressForUpload` and `analyze-vomit` then reads the object raw across the Anthropic boundary); QA verifies EXIF on the object **downloaded back from the bucket**. Any pet-profile photo: stock/licensed only (`nyx-pet-photos` is the project's one public bucket — a permanent unauthenticated URL).
- **Catalog hygiene is automatic on the read side (D5 inverted)** — per-account `food_items` (033) keep demo rows out of every real user's picker by construction — while **write-side ownership is the emitter's job** (the D5 row's v2.1 correction: the `WITH CHECK` doesn't bind the service role).
- **Post-launch teardown (R-10 — mechanism, not just outcome):** teardown = the PM signs into the demo account **on-device** and uses Settings → Delete account (the B-039 path — the only path that purges Storage objects), **never** a dashboard user-delete (which cascades rows but orphans the photos forever; B-121's sweep doesn't exist). Post-delete verification: the demo pet's prefixes in `nyx-event-attachments` list zero objects. Run this way it doubles as a genuine 5.1.1(v) rehearsal. Or keep the account for future submissions (the cadence stops either way).

---

## 10. Deliberately excluded from v1 (with rationale)

- **Ask (the AI Q&A surface)** — **not a choice: its client screen (A5) isn't shipped**, so there is no entry point in the build to review. If we want Ask in front of Apple, that's a "ship A5 first" decision, not a seeding one.
- **The Signal redesign (`signal_design_v2`)** — flag-dark, GA held. The reviewer sees the shipping (classic) Signal; we do **not** allowlist the demo to preview an unshipped design (D9).
- **The home-screen widget** — not allowlisted for the review account (D9 / B-712 ruling); adding it shows the neutral "No pet in this slot yet" empty state. (It's also native — only present in a fresh TestFlight build cut, not via OTA.)
- **Medication / adherence thread, Vet Files, notifications data** — real surfaces, but the reviewer doesn't need them to evaluate the app; they render designed empty states. Tier-3 (§3.5); consultant may promote the cheapest (a med course or one vet document) to Tier 2.
- **Descriptive timing detectors (⑤/⑥)** as an explicit target — they need witnessed vomit onsets ≤30 min post-meal and a set timezone; nice if they fire from the data, not worth contorting the story for. ① + ② are the committed findings.
- **A fabricated "improving/healthy" reassurance state** — forbidden by `clinical-guardrails`; the honest story is a trigger being found + a dip being watched. (And a refusal story would hit the B-494 hold — §3.2.)

---

## 11. Sub-decisions (all resolved v2.1)

- **S1 — idempotency mechanism: RESOLVED — deterministic-id upsert** (§8; the review reversed the v2 lean — delete-then-insert was the blocker-grade half of R-2 and broke on synced devices, R-7). Transaction + assertion prelude + dry-run are part of the mechanism, not optional hardening.
- **S2 — exact breed / name / weight** for Cooper: still the builder's pick (unremarkable and real) — with two rules that stopped being cosmetic: the **photo fixture is benign** (no visible blood/foreign material — escalation comes from context; R-9) and any profile photo is stock/licensed (§9).
- **S3 — the demo's food rows: RESOLVED with a correction** — create the venison staple + beef contraband as the demo user's own `food_items`, **`proteins`/`primary_protein` set on both as a hard AC** (load-bearing, not "reads cleanly" — ① is structurally impossible without ≥2 distinct proteins; R-4), **`ai_extraction_status='manual'`** (R-1), realistic labels (the emitter's escaping property test uses an apostrophe label — "Cooper's Venison LID" — since this is B-324 infrastructure).
- **S4 — how the script runs: CONFIRMED** — committed `.sql` executed via the Supabase MCP `execute_sql` (service role) at PM-gated time. This is also the only path with provisioned credentials (the service key lives in `supabase secrets`, not any session env). One layout rule (Eng F8): Deno-global entry points live at `scripts/` **top level** (`scripts/emit-demo-seed.deno.ts`) — the `scripts/*.deno.ts` tsc-exclude and deno-check globs don't recurse, so a Deno entry under `scripts/demo/` would be tsc-checked and deno-checked by nothing; the pure modules live in `scripts/demo/` with `.ts`-extension imports.
- **S5 (new, ruled 2026-08-11 — DB-4): the demo account identity** — `support@getculprit.app` (already routed via Cloudflare to the PM's inbox; verified free of any existing auth user; the reviewer-visible account address is Culprit-branded; the seed's assertion prelude exact-matches it). Password: strong-but-typeable, minted by the PM directly in ASC (D4). One scoping note: the pending `+smtp1` test-user cleanup must be **exact-match scoped** — it shares nothing with `support@` today, but the rule stands: user deletions near the demo account name their target exactly, never by pattern.

---

## 12. Build plan — PR-by-PR + live-execution runbook

The work is **two committed-code PRs** + a **PM-gated live-execution runbook**. Note what it is *not*: **a data seed, not a migration.** Nothing goes in `supabase/migrations/`; the seed writes rows to existing tables and is run with the service role via the Supabase MCP `execute_sql`, never `apply_migration`. The account-creation dependency (B-152) is cleared (email confirmation ON, SMTP verified), so the only gate on the live phase is the account existing.

**At a glance:** PR 1 (seed + validation) → PR 2 (reviewer notes) → live runbook (steps 1–6). Phase A (story design) is done — it's this doc.

### 12.1 The one implementation decision that shapes PR 1 — single source of truth (resolves S4)

The whole point of this plan is that the Signal fires **honestly and verifiably** (§3.3). A seed whose validation drifts from what it actually writes would defeat that. So PR 1's structure is a real choice:

- **Recommended — one declarative story module.** A pure-data TypeScript module (`scripts/demo/demoStory.ts` — no I/O, no runtime-specific imports) is the single source of truth for the story: the pet, the demo's own `food_items`, the `diet_trials` + dated `diet_trial_foods` + `target_protein`, and the date-relative event/meal/weight/stool sequence — parameterized by `(userId, timezone, now)`. Three consumers import the *same* module: the SQL emitter, the Deno detection test, and the jest off-diet test. Drift is impossible by construction.
- **Lighter — pure `.sql` + a parallel fixture.** A hand-written `scripts/seed-demo-account.sql` plus a separate detection fixture. Simpler to eyeball, but the two can silently diverge — exactly the failure mode §3.3 exists to prevent. If chosen, add a guard test that diffs the two shapes.

**Recommendation: the declarative module — CONFIRMED, and the topology question is dissolved (Eng review §3).** The repo already proves the cross-runtime import in the harder direction: `generate-signal/index.ts:64` imports `../../../lib/dietTrial.ts` and CI's exact current flags (`deno test --lock=deno.lock --cached-only --allow-read=supabase/functions`) are green with that graph — `--allow-read` governs runtime file APIs, not static module loading. So: the Deno validation lives at `supabase/functions/generate-signal/demoStory.detection.test.ts` importing `../../../scripts/demo/demoStory.ts` (`.ts` extensions mandatory); the jest validation lives at `scripts/demo/demoStory.test.ts` (jest's ignore pattern blocks *discovery* under `supabase/functions/`, not imports); the module stays runtime-neutral (no `Deno`, no node builtins) and `tsc` double-checks it for free.

### 12.2 Committed-code PRs

**PR 1 — Demo story + seed emitter + honest-firing validation** · `[PR]` · **adversarial-mandatory + rls-privacy-reviewer** (v2.1)
- **Goal:** produce the Tier-1+2 seed *and* prove, before any live account is touched, that it fires the two findings honestly — **for every hour of the day and for days after seeding**, not just at the moment of emit.
- **Deliverables:**
  - `scripts/demo/demoStory.ts` — the declarative story per the §3.2 executable table (4 beef exposures; pinned times/counts/ratings; UTC-anchored dip days with the ≤ now−5min clamp; proteins on both foods; `'manual'` extraction status), parameterized `(userId, petId, timezone, now)`, **deterministic row ids** (uuid-v5 from `pet_id` + story-slot key) + a stable storage path for the photo slot.
  - `scripts/demo/emitSeedSql.ts` + entry point `scripts/emit-demo-seed.deno.ts` (the S4 glob rule) — renders **run-time-relative**, transaction-wrapped, **upsert-based** SQL with the assertion prelude (email exact-match `support@getculprit.app` + pet ownership + food-ownership self-check) and a dry-run counts mode. Escaped/dollar-quoted literals + the apostrophe property test.
  - **Deno validation** (`supabase/functions/generate-signal/demoStory.detection.test.ts`): ① fires **Early** (pairs=4, never `established`) + ② fires `consecutive_low` + the venison staple washes out — asserted **across a 24-hour sweep of UTC seed-hours** (the test that would have caught R-3) and at **`now + 48h` / `now + 96h`** (the measured survival windows that justify §8's cadence).
  - **jest validation** (`scripts/demo/demoStory.test.ts`): `computeTrialFacts` flags exactly the 4 beef feedings off-diet / venison permitted / `trialDietRefusal` null (stays out of the B-494 hold); emitted-SQL assertions — the scoping ban (no `DELETE`/`UPDATE` without both demo scopes), `'manual'` status, `logged_via='app'`, deterministic ids stable across emits. B-514 timezone-fixture idioms (the suite runs under the non-UTC CI job).
- **Gates:** `adversarial-reviewer` **mandatory** — must state the counterexample it tried against "staple washes out / never reassures on absence" and why it held (the 2026-08-10 26-variant sweep is the template) + `code-reviewer` + **`rls-privacy-reviewer` against the emitted SQL + the §12.3 runbook** (R-13a). No `nyx-voice` (no owner-facing copy).
- **AC:** both validations green in CI including the UTC-hour sweep; **re-seed leaves the same row ids** (upsert — no deletes anywhere in the emitted SQL); the seed references only the demo user's own `food_items` (D5, self-enforced); it is not a migration; the PR description names the service-role write path explicitly.
- **Depends on:** nothing external — runs entirely offline against the engine. **Buildable now** (Step-0 rulings landed 2026-08-11).

**PR 2 — Reviewer notes** · `[PR]` · can ride PR 1's session or ship standalone
- **Goal:** the doc the PM pastes into App Store Connect.
- **Deliverables:** `docs/app-review-notes.md` per the rebuilt §7 — the 9-item outline: informational-posture opener (**no "clinical-grade"**), account statement, the numbered golden path, the 1.4.1 posture paragraph, the negatives block, permissions, the deletion heads-up (DB-2 B), the trimmed reachable-surfaces list (Ask dropped), contact. **Placeholder credentials only** (D4).
- **Gates:** `nyx-voice` + `clinical-guardrails` (no reassuring phrasing) + the "no 'clinical-grade' in reviewer-facing text" check.
- **AC:** Culprit-branded; no real credentials; nyx-voice-clean; under the ASC notes field limit; golden-path steps match the seeded reality (Day 19; card order ② then ①).

### 12.3 Live-execution runbook v2 (PM-gated — not PRs; auth named per step — v2.1, R-8)

Runs once the account exists. Standing rule: **steps 2–5 never present the service-role key as a caller identity** — `generate-signal` 401s it, and `generate-report` currently *accepts* it for any pet (the missing `getUser()` gate, **B-743**, rides the B-494 redeploy — until then this rule is the mitigation).

1. **[PM] Create the demo account** — **`support@getculprit.app`** (DB-4; the Cloudflare route to your inbox already exists — confirm the emailed confirmation link arrives; it is *sent from* `support@` *to* `support@` via Resend, which should deliver, but watch spam on the first send) — via the real signup flow, then create Cooper through onboarding so `onboarding_completed_at` is set. Mint the password **directly in ASC** (strong-but-typeable; never in a session). Pet photo, if any: stock/licensed.
2. **[Claude] Resolve the demo `user_id` / `pet_id`** (`execute_sql` lookup by email), run the **dry-run counts** and read them back, then **run the emitted seed** via the Supabase MCP (service role; the assertion prelude + transaction are the guard). Re-run is safe — upsert on deterministic ids.
3. **[PM] Tier-2 photo + AI read — in-app:** log one vomit-with-photo (benign; provenance per §9) in the app; the analysis auto-fires on log and produces the `event_ai_analysis` row through the real pipeline (and the app's upload path strips EXIF). **[Claude]** verifies the row exists + EXIF is absent on the object downloaded back from the bucket — no password needed for either. The read must not reassure.
4. **[PM or Claude] Populate the Signal (D3):** simplest — the PM opens Home once signed in (the stale-cache background regen lands); or Claude POSTs `generate-signal` under the **demo user's JWT**. Mind the 12/pet/day cap (§8).
5. **[Mixed] Verify (Phase E):** `ai_signals.findings` carries ② and ① (verified, not assumed); the diet-trial card/TrialStrip ("Day 19 of 42") + the Trend trial-start marker render on-device from the mirror; the vet report renders over a real range → `vet-report-cold-read` **on the deployed function's artifact** → CLINIC-READY; Timeline/Patterns populated; Tier-3 surfaces show designed empty/neutral states; **credential smoke test** — on a clean device, sign in with the credentials *as literally entered in ASC* (catches typos/trailing spaces); **pre-handover `app_config` check** (§9). Spot-check on the reviewer-facing install; after any re-seed, sign out/in on previously-synced verification devices (hydration has no absence-reconcile).
6. **[Claude] The standing cadence (§8):** re-seed + re-`generate-signal` every 24–48h from Submit until Approved/Rejected, skipping runs while "In Review". **Account freeze:** the demo account is never deleted, re-created, or password-rotated while a submission is open (if a rotation is forced: update ASC first, then rotate).
7. **Resurrection protocol (standby — DB-2 ruled B, no second account):** if the account dies mid-review (e.g. a reviewer tests deletion despite the notes' heads-up), re-create `support@getculprit.app` → re-run steps 1–5 → **update the ASC credential fields before replying in Resolution Center**.

### 12.4 Prerequisites & dependencies
- **Cleared:** B-152 (email confirm ON, SMTP verified) · B-054 hydration · B-417 trial mirror · B-272 (ASC record) · the Step-0 rulings (DB-1..DB-4, 2026-08-11).
- **PM dashboard item in the same submission window (not a demo blocker, but a reviewer sees it):** auth email templates still say "Nyx" (hardening audit §B7) — rename before a reviewer creates their own account. Also delete the `+smtp1` test user (STATUS housekeeping) — **exact-match scoped** (S5's rule for any user deletion near the demo account).
- **Feeds:** submission-guide step 12 (store screenshots are captured on this account — **with `signal_design_v2` OFF per DB-1**: the hero uses the plain-cards fallback for submission #1).
- **Tracked riders (not on this critical path):** **B-743** (`generate-report` `getUser()` gate — B-494 redeploy) · **B-744** (`app_config` allowlist hardening) · the screenshot-plan reconciliation (done with DB-1) · the step-10 built-artifact check that the widget's "No pet in this slot yet" state is in the cut binary (the notes promise it).

### 12.5 Sequencing & parallelism
- **PR 1 is fully unblocked** — offline against the engine, all rulings in. **PR 2** can ride the same session (no code dependency).
- The **live runbook** waits only on the PM creating the account (step 1) — everything before it is offline.

---

## 13. Acceptance criteria (QA — replaced v2.1; the old set asserted a surface that no longer exists)

- [ ] Seed script is **idempotent by upsert** — re-run leaves the **same row ids** (no duplicates, no deletes anywhere in the emitted SQL) — and **date-relative** (run-time-relative SQL; findings stay in-window whenever run, **verified across the 24-UTC-hour sweep** and at +48h/+96h).
- [ ] On the seeded pet, **both findings fire** after `generate-signal` — ② `intake_decline` (`consecutive_low`) and ① the beef correlation at **Early** (never `established`). Verified in `ai_signals.findings`, not assumed.
- [ ] The trial-food staple (venison) **washes out** of the correlation (no false implication) **and** the off-diet beef feedings (all 4) are flagged by `lib/dietTrial.ts` with `trialDietRefusal` null — adversarial-reviewer confirmed with the counterexample stated.
- [ ] Every seeded `food_items` row carries `proteins`/`primary_protein` **and** `ai_extraction_status='manual'`; the rows are per-account scoped to the demo user (verified: absent from another account's picker) and survive 30+ minutes of sync cycles (the reap does not fire).
- [ ] **Tier 1 — no surface shows an empty state:** Home Signal **`live`** (a non-empty findings row — not `building`/`no_pattern`), the **diet-trial card / TrialStrip ("Day 19 of 42") + the Trend trial-start marker** (rendered from the seeded lifecycle, not a bare row), Patterns (cards), Timeline (populated), vet report (renders with a real date range on the **deployed** function).
- [ ] The per-incident vomit read renders on the event detail, **does not reassure** (n=1 invariant), and its photo carries **no EXIF on the stored object** (verified on the download-back). *(Tier 2)*
- [ ] The emitted SQL passes the **scoping ban** (no `DELETE`/`UPDATE` without both demo scopes) and the assertion prelude refuses any target other than `support@getculprit.app`.
- [ ] `docs/app-review-notes.md` exists, is nyx-voice-clean, Culprit-branded, contains **no real credentials** and **no "clinical-grade"**, and its golden path matches the seeded reality.
- [ ] `vet-report-cold-read` returns CLINIC-READY on the report rendered by the **deployed** `generate-report`.

---

## 14. References & backlog reconciliation

- **B-271** — App Review demo account + reviewer notes (this spec is its build-ready plan).
- **`docs/demo-account-plan-review-2026-08.md`** — the 2026-08-10 convened-panel review whose findings v2.1 folds in (the R-numbers cited throughout resolve there); its §4 records the Step-0 rulings. **B-743** (`generate-report` `getUser()` gate) + **B-744** (`app_config` allowlist hardening) were filed from it.
- **B-324** (Later) — multiple demo accounts / parameterized story profiles (the §6 expansion).
- **B-417** — the diet-trial lifecycle the demo now seeds against (migrations 040/041; `lib/dietTrial.ts`). **B-354** — per-account `food_items` (migration 033, the D5 inversion). **B-704** — trial `target_protein` (migration 053).
- Guide **step 11** (`docs/app-store-submission-guide.md`); register **Tier 2** (`docs/app-store-readiness.md`).
- Depends on: **B-152** (email confirmation ON — done), **B-054** (hydration, done), **B-272** (ASC record, done).
- Thresholds sourced from `supabase/functions/generate-signal/detection.ts` `DEFAULT_CONFIG`; realistic-sequence shape from `detection.test.ts` (the correlation golden fixture); off-diet detection from `lib/dietTrial.ts`; hydration from `lib/sync.ts` / `lib/hydration.ts`; the diet-trial schema from `supabase/migrations/040_diet_trial_lifecycle.sql`.
