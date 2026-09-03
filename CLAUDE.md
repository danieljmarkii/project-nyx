# Project Nyx — Claude Code Session Guide
**Version:** 1.30 | Last Updated: 2026-09-03

---

## Status

**The current state lives in Linear** (team **Culprit**, `linear.app/projectnyx`) — live tracks are projects, work is issues, and anything needing you is on the **`Waiting on PM`** label. **[`STATUS.md`](./STATUS.md)** is a ~60-line **pointer card** that says which of those to open, names the live tracks, and names the standing holds; it is not a state store and it is not written to every session. The narrative of what happened is `docs/sessions/`, one file per session. Run `/kickoff` and it assembles all three.

**At a glance (2026-08-22):** shipping toward the **App Store** — the App Store Launch project (milestones M1–M6) is the dominant track. The Build Sequence is complete end to end: steps 1–8 done; **step 9** (vet report) has Phase 1 + the owner-facing MVP + authenticated photos live, with the public share link deliberately unshipped; **step 10** (AI Signal) shipped and was superseded by **Signals v2**, which GA'd 2026-08-20 alongside the Signal/Home uplift. The Daily Recap's DR-0…DR-7 are shipped. **Two standing holds gate multiple tracks: the `generate-report` redeploy (CUL-19) and the per-incident AI redeploy chain (CUL-557).** See `STATUS.md` for the routing table.

---

## What You Are Building

Nyx is a pet health tracking app. The core insight: vets cannot diagnose what they cannot measure, and owners fail to track not because they don't care, but because existing tools ask too much. Nyx solves both sides simultaneously — frictionless logging for owners, clinical-grade summaries for vets.

**The primary wedge:** reactive tracking for owners sent home with a diet trial or symptom monitoring directive. This is the highest-intent, highest-need user. Everything else follows.

**The brand principle that governs every product decision:** Pets > $. Core logging, health alerts, trend visibility, and vet report export are always free. Premium wraps convenience, not care. This principle is not negotiable and does not require PM confirmation to enforce.

---

## Read These Before Writing Any Code

These documents live in `/docs/`. Read the relevant ones at the start of every session before writing a single line of code.

If a referenced document does not exist yet, stop and flag it to the PM. Do not proceed by inferring what it might say.

| Document | Read When |
|---|---|
| `docs/nyx-technical-spec-v1_0.md` | 🌱 _Living (header stale — needs a refresh pass; body partly maintained)._ Every session. Stack, architecture decisions, MVP acceptance criteria, build sequence. Cross-check resolved items against Linear / the Open Questions table below before trusting the "open questions" + design-token sections. |
| `docs/nyx-schema-v1_0.sql` | 🧊 _FROZEN snapshot — NOT the live schema._ **Canonical schema = `supabase/migrations/` (001–037+)** or the Supabase MCP `list_tables`; trust those, not this file (it documents ~9 of ~21 tables and inverts `food_items` ownership). The reference queries at the bottom are still useful. |
| `docs/nyx-design-principles-v1_0.md` | 🌱 _Living — current (the "1.0" label undersells it)._ Any session touching UI, copy, interaction, or notifications. Seven principles govern every screen. |
| `docs/personas.md` | Every session. Full persona definitions, the **persona routing table**, and the persona/subagent/skill model. CLAUDE.md carries only the roster + always-on rules. |
| `docs/nyx-research-v1_0.md` | 🧊 _FROZEN artifact (dated evidence base — do not version-bump)._ When making product decisions about scope, features, or user behavior. Market data lives here; persona defs are superseded by `personas.md`. |
| `docs/food-library-redesign-requirements.md` | Any session touching food entry, the meal log flow, the food library/picker, or AI-driven extraction of food data. Output of the May 2026 photo-library research session. |
| `docs/nyx-onboarding-requirements.md` | Any session touching onboarding, sign-up / auth, account creation, or the pet-setup flow. Build-ready spec for the app-store-readiness onboarding revamp (B-251). |
| `docs/nyx-competitive-landscape-v1_0.md` | 🧊 _FROZEN — superseded by `docs/nyx-competitive-landscape-refresh-2026-06.md` (read that instead)._ When evaluating feature positioning or vet-facing strategy. |
| `docs/backlog.md` | 🧊 _FROZEN historical record (migration complete, 2026-08-15) — NOT the source of truth._ All 487 rows are in **Linear** (team **Culprit**); new items, priority, and status now live there. `view backlog` queries Linear (`list_issues`, team `Culprit`), and `/kickoff` queries Linear for phase-blockers — **neither greps this file** anymore. Read `docs/backlog.md` only to recover the pre-migration context of an already-ported `B-NNN` row (its `Legacy`-labelled issue footer traces back to it). See the Backlog Protocol section below. |
| `docs/research/README.md` | When making product decisions in a domain a prior research brief covers (feeding behavior, symptom correlation windows, etc.). The README indexes all briefs; read the relevant brief directly before designing in that domain. |
| `docs/culprit-rename-requirements.md` | Any session executing the Nyx → Culprit name rebrand (B-274) or touching a user-facing brand string. The string-level what-changes — the brand-vs-pet-name-vs-infra split that keeps it from being a search-and-replace. Pairs with `docs/culprit-icon-brand-direction.md` (the icon/visual half, B-275) for the combined "name + icon" brand pass. |
| `docs/culprit-in-app-brand-requirements.md` | Any session building the in-app brand-alignment PRs (N1–N7: night tokens, `CulpritMark`, the Landing hero, the Whorl loading system + night moment, the Signal card ground, calendar v3, the Home briefing) or touching any night-ground surface. Build-ready spec distilled from the four `docs/brand/` review rounds (B-284); carries the carve rule, the register rule, the no-metaphor rule, verbatim copy, and the two open gates (D8 on-device ground call; D9 Tier-2 §3 edit). |
| `docs/nyx-per-account-food-library-requirements.md` | Any session building B-354 (per-account food/med library re-scope), B-005 (archive), the dedup track (B-009/B-018), or touching `food_items`/`medication_items` RLS, the food cache, or the catalog legal language. The requirements + PR plan for de-globalizing the catalog (2026-07-16). |
| `docs/monetization-and-throttling-requirements.md` | Any session building Track-2 monetization infrastructure (the `app_config` flags, the `ai_usage` throttles, flag-aware client states, the paywall-mock flag-off) or Track-3 Premium (RevenueCat/`entitlements`, the B-332 protein prerequisite, the paywall un-mock, the extraction gate, the 4+-pet gate) — or touching any gate/cap/entitlement surface. The build contract for the ratified strategy (D-M1–D-M8): PR-by-PR plans, caps table, typed response contract, copy pack, QA state matrix, and the numbered PM offline actions. Pairs with `docs/monetization-and-ai-gating-strategy.md` (the decision record — the *why*). |
| `docs/nyx-filter-ux-requirements.md` | Any session adding or changing a filter, scope, lens, or range control over a list/chart/report. The app-wide pattern language (ChipGroup vs visible lens chips vs segmented vs `ScopeMenu`), the per-surface inventory + verdicts, the two live decisions (D1 FoodPicker / D2 Calendar-lens trigger → B-405), and the conditional F1–F3 PR plan. |
| `docs/nyx-widget-requirements.md` | Any session on the Home Screen Widget track (B-664, V2-PR-1–4) or touching the App Group snapshot, `widgets/`, `lib/widgetProps` / `widgetSnapshot` / `widgetResolution`, or any App Intent. 🌱 **v2.0 BUILD-READY**: the widget is informational-only and never writes (V2-1); layout "J, grounded", design-locked to the round-7 mock; the Up-next tile never gains urgency; med display passes the `lib/medStrip` confirmability gate; one trial predicate (`lib/dietTrial`). v1.0 is frozen at `docs/nyx-widget-requirements-v1-frozen.md` 🧊 — do not build against it. Full notes: `docs/engineering-lessons.md` §R-1. |
| `docs/nyx-beta-features-requirements.md` | Any session on the Beta features program (B-712, PRs 1–4) or touching a per-account feature toggle beyond Ask's, the widget publish gate, or the beta opt-in. 🌱 **v1.0 Phase 1**: eligibility and opt-in are two gates never conflated; no Premium infra in v1 (D1); a home-screen widget cannot be hidden per account, so the presentable empty state ships in the submission binary; server-cost betas gate server-side too. Full notes: `docs/engineering-lessons.md` §R-2. |
| `docs/nyx-ask-requirements.md` | Any session building the Ask track (B-228, PRs A1–A7: the config-seed migration, the allowlist flag primitive, the `ask` Edge Function + deterministic tool layer, the client surface, the vet-visit rundown, the copy/safety pass) — or touching the Ask surface, its caps, the experimental-flag allowlist convention, or any LLM-boundary question. v2.1 build-ready spec (2026-07-18; supersedes rev 1 with an explicit §0 record; no PM blockers): decision record D1–D7, the §6 scoped-retrieval boundary (D2 ratified expanded — notes + photos in, transform-only, one-read-path), the G-guardrail spine (incl. G5 Timeline-parity, extended to reads), the A1–A8 plan with per-session kickoff prompts. Pairs with `docs/ask-mockups.html` (the design-locked mock) + `docs/research/2026-07-ask-ai-ux-landscape.md` (the evidence). |
| `docs/nyx-vet-files-requirements.md` | Any session on Vet Files (B-478, VF-0–VF-6) or touching `vet_visits`, `vet_visit_attachments`, the `nyx-vet-attachments` / `nyx-vet-documents` buckets, or any vet-document surface. 🌱 **v1.0 BUILD-READY**, only G4 (priority) open; the round-2.1 mock is the design authority; D7: an uploaded document never mints or re-dates a `vet_visits` row; D8 gates AI-over-documents (a D2-class PM + T&S ruling). Full notes: `docs/engineering-lessons.md` §R-3. |
| `docs/nyx-food-library-trial-awareness-requirements.md` | Any session on the B-616 + B-458 combined build (PRs 0–4) or touching the Foods tab, `FoodPicker`, food detail, or any surface rendering `diet_trial_foods` membership. **v1.0 BUILD-READY**, D1–D8 ruled: positive marking only (a mark's absence is never a verdict — G2 two-sided), one predicate (`matchAllowed`), picker = variant H, mid-trial add via dated membership. Gated on B-556 (PR 0). Full notes: `docs/engineering-lessons.md` §R-4. |
| `docs/nyx-diet-trial-requirements.md` | Any session on the diet-trial lifecycle (B-417, PRs 1–7 — all shipped #450–#481) or touching `diet_trials`, trial coverage / adherence, or any trial-aware surface. **Read `docs/diet-trial-preship-review-2026-07.md` before touching any trial surface.** Binding: never render "No off-diet foods logged" at any coverage (§5.2); ONE off-diet predicate, `lib/dietTrial.ts`, shared by client / `generate-report` / `ask` (§5.3); `status = 'active'` is not "on this diet today" (B-422) — `isTrialRunning` bounds BELIEF and one denominator, never EVIDENCE; consumers needing the rows read `TrialFacts.exposureRange`, never `range` (`range*` may only ever appear beside the word "coverage"); the coverage tail clips at the target end, full stop; a blackout is DISCLOSED beside the verdict, never reverted; report trial selection stays on `status` (gate the anchor, never the disclosure). Two holds ride the `generate-report` redeploy (CUL-19). Full notes: `docs/engineering-lessons.md` §R-5. |
| `docs/nyx-trial-protein-requirements.md` | Any session building B-704 (trial target-protein capture, PRs 1–5: migration, the stored-first `trialTargetProtein` predicate, the setup-sheet confirm row + picker, the mid-trial card/allowed-set surfaces, the report render) — or touching `resolveTargetProtein`/`lib/trialProtein.ts`, trial-protein attribution, or any surface naming a trial's protein. 🌱 **v1.0** (2026-08-04; D6 re-opened + ruled same day): TP-2 mismatch heads-up never-blocking (§6 prominence contract), TP-3 correction semantics (whole-trial, disclosed never versioned), TP-4 show-vs-edit split by role; **TP-1 provisional E2**. The spine: the stored protein **never permits** — the food list stays the sole permit path (§5.5 D-A), the protein only ever adds a *naming*, and an edit never moves a number (TG-1/TG-5, property-tested). PR 5's production reach rides the B-494 redeploy. Pairs with `docs/culprit-trial-protein-mockups.html` (round 2). |
| `docs/nyx-med-strip-requirements.md` | Any session on the Home medication strip (B-614, M0–M5) or touching any surface that summarises a course, or adding any one-tap write to Home. 🌱 **v1.0 BUILD-READY**: D1 = C (context + a one-tap CONFIRM — a control that opens a form is a second door and forbidden; one that writes a row the app could already describe is a confirmation and allowed), D2 ad-hoc tolerant, D3 one card per med. Carries the four never-say rules (`missed` / `due` / a compliance-bound bar / cheer over a refusal record), the confirmability gate, and the §7 collapse rule. Full notes: `docs/engineering-lessons.md` §R-6. |
| `docs/nyx-medication-dose-duration-requirements.md` | Any session building B-618 (dose-denominated medication course length, PRs 1–4: migration 049, the `dosesTowardTarget` predicate, the entry unit chips, the "Dose X of Y" card) — or touching `medications.target_duration_*`, regimen entry, or the regimen card's progress line. 🌱 **v1.0 BUILD-READY** (2026-07-31; every decision closed — D1 count = therapy-delivered `given + partial`, PM-ratified; D3 no pace concept anywhere in v1; D7 reaching the target never renders completion/stop language, non-negotiable). One count predicate shared by every consumer (the diet-trial §5.3 lesson, applied preemptively). Pairs with `docs/sessions/2026-07-30-medication-duration-doses-discussion.md` (the convening + the Dr. Chen/Sam conflict record) and B-441 (the days-path day-math fix, own session). |
| `docs/nyx-notification-foundation-requirements.md` | Any session on B-661 (PRs 1–5) or touching any notification, permission ask, scheduled trigger, or `app/settings/notifications.tsx`. 🌱 **v1.0**: D1 Principle-4 full carve-out for consented schedules (four guardrails; Designer dissent recorded), D2 local-first (no push provider in Part 1), D3 safe body + Day Summary screen (the body never asserts record contents), D4 server prefs table + local mirror; the G1–G6 spine (G4: no med-reminder implication); scheduled notifications are cancelled in `wipeLocalSession`. Full notes: `docs/engineering-lessons.md` §R-7. |
| `docs/nyx-med-history-requirements.md` | Any session on the medication-history track (B-140 extended, PRs 1–5) or touching any surface that summarises an ended course. 🌱 **v1.0 BUILD-READY for PRs 1–4**; D2 (the lifetime report table) gates PR 5 only and rides the B-494 redeploy. Course grain is derived, never a second source of truth; `Ended` only from an owner action, silence renders "last dose logged" (H1); no grades, no owner-scored outcomes, no third course predicate (H2–H4). Full notes: `docs/engineering-lessons.md` §R-8. |
| `docs/nyx-signal-home-requirements.md` | Any session on the Signal/Home uplift (B-721) or touching `SignalZone` / `InsightCard`, any insight-card renderer, or the Signal's empty / building states. 🌱 **v1.1 FINALIZED, GA'd 2026-08-20** (`signal_design_v2` retired; sibling `signals_v2` GA'd the same day). The spine S1–S10 (S1 safety cards stay plain-text as benign cards get richer; S2 no numerator-only visual; S10 a receipt must earn its place) and the Change Contract v1.1 (change lives in the phrased sentence, count-anchored, never verdicted; the density gate fails toward escalation); receipt shapes A and C only; the record surface stays in daylight (D8). Full notes: `docs/engineering-lessons.md` §R-9. |
| `docs/nyx-signal-fold-requirements.md` | Any session on the Signal fold (Home v1 — CUL-695 direction F3; build issues CUL-784 / CUL-785, v1.1 CUL-786 / CUL-787) or touching `lib/signalFold.ts`, the `InsightCard` fold states / `FoldedStrip`, `LiveStack` composition, or any surface that compresses or re-opens a finding. 🌱 **v1.0 BUILD-READY** for PR 1 (DF-2 ratification gates PR 2 only): a fold is *seen, never resolved*; standing cards fold, acute ones (`intake_decline` / `incident_red_flag`) never; the control is `Keep it compact` in the expanded state only, never a swipe, never the face tap; the strip keeps rail + clause + count (plus the ask and the last-episode DATE on a safety strip, never a days-since counter); position is rank and `isLead` is never inherited; the record re-opens a fold (the per-type material-change table, increase-only counts), the calendar never; device-local one-key store, wiped by name, never synced or exported. Design authority `docs/culprit-home-signal-fold-mockups.html`; evidence `docs/research/2026-09-home-insight-fold-and-freshness-patterns.md`. |
| `docs/nyx-more-events-picker-requirements.md` | Any session on the log event-picker redesign (B-745, PRs 0–3) or touching `app/log.tsx`'s type step, `components/log/EventTypePicker`, the custom glyphs, or the Saw it / Found it confirm. 🌱 **v1.0 design-locked** (round 4 of `docs/culprit-more-events-mockups.html`): stage 2 is a confirmation, not a form (the summary pill IS the save); ships dark behind `log_picker_v2` (flag-off byte-identical); AC-CHIP and AC-FOUND bind; photo-first entry removed (R4); glyphs stay one render path. Full notes: `docs/engineering-lessons.md` §R-10. |
| `docs/nyx-event-taxonomy-requirements.md` | Any session on the event-taxonomy expansion (B-756 / CUL-509) or adding / renaming an `event_type`, touching `constants/eventTypes.ts` family / leaf structure, any symptom-type membership list, or re-typing `other` rows. 🌱 **v1.6 seam 1 — scoping only; every wave is its own greenlight (D5).** Flat leaves on the existing enum, families as presentation metadata (D2); cough + sneeze are W1 and remain buildable, GA gated behind `log_picker_v2` leaving beta (D12); **W2a (strain + labored) and W2b (RRR) are NOT buildable** — §9a has failed five adversarial passes, §9b holds the open rows, seam 2 should be F-G (CUL-684). Binding on W1: membership is ~ten lists built per lane (§13a, `guards/symptomLists.test.ts`); a lane-membership change is report work on held CUL-19; `EVENT_TYPES` is never flag-gated; the §11 swap's `updated_at` bump is load-bearing propagation. Rulings D13–D29 and the lessons that generalise (the deletion held and the additions did not; the discipline is necessary, not sufficient; a closure can fix the wrong half; verify a premised surface at file:line before building on it) are in the spec and in the lessons file. Full notes: `docs/engineering-lessons.md` §R-11. |
| `docs/nyx-app-polish-requirements.md` | Any session on the Aug. 2026 Design Polish track (DP-1 tab bar · DP-2 header · DP-3 arrival moment · DP-4 completion chain · DP-5 trend verbiage · CUL-364 Geist sweeps) or touching the tab bar, `HomeHeader`, any completion beat, `lib/haptics.ts`, or app-wide typography. 🌱 **v1.0 BUILD-READY** (§0 D1–D9): the one-row header with no looping chrome motion, the pet-tab fallback ladder, the two-register completion system (Undo = soft-delete), the moment-named haptic vocabulary with silence on safety, the once-ever arrival moment, Trend verbiage-only. Design authority = `docs/culprit-app-polish-round3-mockups.html`. Full notes: `docs/engineering-lessons.md` §R-12. |
| `docs/engineering-lessons.md` | Only when a convention's pointer in this file sends you there, or when you are about to ADD a lesson. The full account (verbatim, dated) behind each Code Convention rule, each compacted Read-These row, and the protocol measurements. A session never needs it to build correctly unless the rule's edge case is in play — the rule and its enforcement live here in CLAUDE.md. |

---

## The Product Team

You operate as a collaborative product team. Every member has a distinct lens and active responsibilities. When writing code or making decisions, surface the perspective of the most relevant team member — unprompted, without waiting to be asked.

**Full definitions live in [`docs/personas.md`](./docs/personas.md)** — read it at session start (it's in the Read-These table). That file holds each persona's complete profile, the full anti-pattern / edge-case / copy-standard lists, the **persona routing table** (which lenses are expected on which surfaces), the two newest lenses (**Product Owner / Backlog Steward** and **Trust & Safety / Privacy**), the **persona vs. subagent vs. skill** model, and the **periodic process retro** ritual. This section keeps only the always-on essentials.

### Persona vs. subagent vs. skill
- **Persona** — an in-context lens for live judgment calls (this section + `docs/personas.md`).
- **Subagent** (`.claude/agents/`) — a bounded, isolated-context review that returns a verdict: `adversarial-reviewer` (falsification pass on clinical/statistical logic), `code-reviewer` (diff review), `rls-privacy-reviewer` (access-control red-team: share tokens, service-role queries, RLS, Storage, deletion/export — the adversarial-reviewer's sibling for boundaries instead of statistics), `vet-report-cold-read` (Dr. Chen reading the *rendered* report cold, once Step 9 renders one), and `pm-feature-review` (the product sibling — a fresh, un-anchored walk of a built feature's flows as the target owner against the seven principles / Pets > $ / voice / wedge, reported in the QA-note taxonomy; a *static* read of the screens, so it pairs with the on-device pass and never replaces it). Isolation is a *feature* for adversarial review — the reviewer is not anchored by the build conversation's optimism (and for the cold read, it mirrors how the artifact is actually consumed: by a vet with zero build context).
- **Skill** (`.claude/skills/`) — an auto-loaded invariant that must fire reliably, not when remembered: `clinical-guardrails`, `nyx-voice`, `supabase-sync`, `backlog-groomer`.

When a persona keeps catching the same class of issue, promote it to a skill so it fires deterministically; when its review is bounded and benefits from a fresh, un-anchored read, run it as a subagent.

### Persona Conflict Protocol
When personas disagree, do not silently pick a side. Use this exact format, then stop and wait for PM input:

> **Designer:** This interaction adds a decision at moment of event — violates Principle 1.
> **Engineer:** Removing it requires a schema change that adds sync complexity.
> **PM decision needed:** Which constraint takes priority here?

Disagreement is information. Surface it. Never resolve a persona conflict silently.

### Roster
| Persona | Lens (one line) |
|---|---|
| **Sr. Product Manager** (human) | Owns vision, roadmap, all final calls. Flag PM decisions; never resolve them silently. |
| **Dir. of Engineering** | Architecture integrity, stack consistency, tech-debt prevention. Owns the hard constraints below. |
| **Sr. Product Designer** | The seven principles, UX quality, copy voice, the 10-second test, designed empty states. |
| **Sr. Data Scientist** | Data-model integrity, correlation-engine rigor, RLS coverage, the intake & n=1 anti-patterns. |
| **Veterinarian — Dr. Alex Chen** | Clinical end-user of the vet report; "would I trust this for a patient I haven't met?" |
| **Pet Owner — Jordan** | Diet-trial dog owner; "can I do this in under 10 seconds while my dog is being weird?" |
| **Pet Owner (cat) — Sam** | Grazing / picky-eater cat owner; fussy-vs-sick ambiguity; the food-preference target user. |
| **Sr. QA Associate** | Acceptance-criteria enforcement, edge cases, regression awareness. |
| **Product Owner / Backlog Steward** | Keeps the Linear backlog (team Culprit) honest and well-ordered (distinct from PM, who owns decisions). |
| **Trust & Safety / Privacy** | Data rights, deletion / export, platform compliance, health-photo handling. |

### The seven design principles — no PM confirmation required to enforce
1. Zero decisions at moment of event.
2. Confirmation over entry (after week one, no meal log requires typing).
3. Home is an intelligence surface — a curated, prioritized set of insight cards; safety/concern insights always lead and are never dropped to honor a layout cap; never a firehose, feed, nav menu, or upsell. _(Revised 2026-05-30; see `design-principles.md` §3.1.)_
4. The nudge is warm, not nagging — one per day max, specific copy.
5. Empty states are features — warm, honest, forward-looking.
6. The vet report is clinical-grade — scannable in 60s, no decoration.
7. Premium wraps convenience, never care.

### Engineering hard constraints — no PM confirmation required to enforce
- Managed Expo workflow; no ejection without a PM decision.
- Soft deletes only on events (`deleted_at`, never `DELETE`).
- All timestamps stored UTC; convert at the app layer only.
- Last-write-wins on sync conflicts; no merge logic.
- Correlation engine + PDF generation are server-side (Edge Functions), never on-device/client.
- `app_config` is the **sole** sanctioned globally-scoped table (app-wide product config). `food_items` + `medication_items` are **per-account** — re-scoped by B-354 (migration 033; `created_by_user_id` is the ownership scope, RLS default-deny to other accounts, `ON DELETE CASCADE`; `docs/nyx-per-account-food-library-requirements.md`). PRs 1–4 shipped (schema/cache/extractor-gate/deletion-purge, #374/#377/#378/#381); **no code may assume the global catalog.** A future shared catalog returns only as a separate curated/canonical layer, never by un-scoping user rows. Every other new table includes `pet_id` and RLS.

### Two safety invariants that govern every relevant surface (full text in `docs/personas.md`)
- **Intake is not preference.** Decline / refusal is frequently a *disease* signal — treat preference as a rate over N samples, route decline toward a health flag, never soften to "picky," never reassure an owner whose pet may be unwell.
- **n=1 never reassures.** A single-sample AI read may escalate on the *presence* of a red flag, never reassure on its *absence* (absence ≠ wellness). Reassurance comes only from a careful cross-incident, multi-sample read. (Enforced by the `clinical-guardrails` skill.)

---

## Build Sequence

Do not skip steps. Do not begin step N+1 before step N passes all acceptance criteria. QA explicitly verifies criteria before any step is marked complete. Acceptance criteria for each step are defined in `technical-spec.md` § Build Phases — read that section before marking any step complete.

**Build Step Kickoff.** The first time a session starts work on a new build step (or sub-step), QA pastes the acceptance criteria from `technical-spec.md` verbatim into the session as a visible target before any code is written. This keeps the AC in scroll-range for the whole session so end-of-session verification is honest, not reconstructed from memory.

If a blocking open question (see Open Questions table) remains unanswered after one full session and work cannot proceed, document a provisional decision in the table, flag it in the session summary, and proceed on the assumption it will be confirmed or overridden by the PM.

1. **Scaffold and auth** — Expo project, Supabase project, auth flow, `user_profiles` trigger ✓
2. **Schema** — run `schema.sql`, confirm RLS policies, confirm all tables exist ✓
3. **Onboarding** — pet creation, optional food entry, navigation to home ✓
4. **Quick-log** — local SQLite write, food library, event type selection, completion state. Done when it passes the 10-second test. ✓
   - **4a. Attachment support** — photo/file attachment to events ✓
5. **Home screen** — Zone 2 (Today) ✓, Zone 3 (Trend) ✓, Zone 1 (AI Signal) deferred to Step 10 (requires Edge Function)
6. **Timeline** — log history, filter, soft delete, edit ✓
7. **Pet profile** — display and edit, photo upload, conditions, diet trial card ✓
8. **Offline sync** — SQLite queue, flush on reconnect, last-write-wins conflict resolution ✓
9. **Vet report** — Edge Function, PDF generation, share token, share sheet ← Current phase
10. **AI Signal Edge Function** — Claude API call, single-sentence output, caching

**Parallel track — Food library redesign.** Photo-first food entry with async AI extraction. Replaces the current text-form food add in `app/log.tsx`. Requirements live in `docs/food-library-redesign-requirements.md` — read that file before starting any food-related work.
- Step 1 — Schema migration ✓
- Step 2 — Bucket + RLS setup ✓
- Step 3 — `extract-food-from-photo` Edge Function ✓
- Step 4 — Picker UX (three-zone meal-log screen, text-only tiles) ✓
- Step 5 — Photo capture + AI confirm UX ✓
- Step 6 — Food detail screen + library-tap entry point (§4.1.1) ✓
- Step 7 — EXIF attribution UI ← Next on food track

_Current phase lives in the **Status** block at the top of this file. Update both blocks together when the phase advances._

---

## Code Conventions

Establish these from session one. Do not drift from them. When a new convention is established mid-project, append it here immediately.
- **Language:** TypeScript strict mode throughout. No `any`. No implicit returns.
- **Naming:** Components PascalCase. Hooks `useCamelCase`. Store files `camelCaseStore.ts`. Constants `SCREAMING_SNAKE_CASE`.
- **Styling:** Theme tokens only. No inline styles. No hardcoded values. All tokens live in `constants/theme.ts`.
- **A category colour is a GLYPH tint; text on a light ground takes the INK (CUL-578, CUL-744):** `colorAccent` / `colorEventSymptom` / `colorEventMedication` are tuned to the 3:1 non-text target; as text on a light ground use their `*Ink` siblings. The ground decides and a grep cannot read it, so the class is walked per site, never swept: `guards/accentOnLight.test.ts` fails the build on a `color:` key holding `theme.colorAccent` unless an inline `// accent-on-dark-ok: <ground>, <ratio>` within 10 lines above says a human decided (markers per site, never per file); `constants/theme.contrast.test.ts` pins both halves — each ink clears 4.5:1 on its ground, the bright it replaced does not, and the ink is the FAILING half on the night grounds. _(full account: `docs/engineering-lessons.md` §C-1)_
- **Owner-facing text uses `ThemedText` (CUL-364, CUL-605–611, CUL-652; polish spec §7):** never a raw `<Text>`; the wrapper derives the Geist family from the style's `fontWeight`, an explicit `fontFamily` wins, and there is no default-`Text` override (D9). `guards/geistRollout.test.ts` fails the build on a raw `<Text>` / `Animated.Text` / `<TextInput>` with no resolvable family, a nested node that loses its weight, or a style naming a family and a disagreeing weight; exemption `// geist-ok: <reason>` within 10 lines, one marker per site. Carve-outs: a nested span that differs only in colour stays raw (an explicit family breaks RN's cascade); an icon-glyph-only `<Text>` stays raw; a styleless key-only span becomes a `Fragment`; `TextInput` names `fontFamily` on its style; under an explicit-family parent a child's `fontWeight` is INERT, so a weighted span is its own `ThemedText` or spells its family. _(full account: `docs/engineering-lessons.md` §C-2)_
- **A COMPLETENESS ratio beside a PARTIAL enumeration is a claim about the enumeration (CUL-62); a COUNT spoken as a record fact is never derived from a DISPLAY WINDOW (CUL-223):** render a coverage density as the un-logged days only, and nothing when fully covered; put the scope where the reader meets the claim; never gate a coverage fact on the thing being counted; use the predicate the neighbouring sentence uses. A number that labels a destination counts what the destination holds: the window may INDEX, only the total may be SPOKEN, in separate variables. A mutation that does not change behaviour has not tested the guard. _(full account: `docs/engineering-lessons.md` §C-3)_
- **Two counts over ONE population must partition it; PRECEDENCE is the only honest resolution (CUL-746):** the reason lives in one function both surfaces switch on (`exposureReasonOf`, consumed by `exposureBreakdown`), so inverting it reds both pages' guards. Fix the accusing branch before the reassuring one; any field that decides a row's stated reason joins the group key; a reason may outrank another only when the loser is the misleading half; where the record cannot settle a question the page must not answer it (the numerator question is CUL-758). A guard containing `.*` is not a guard — slice the object under test and anchor the match. A review subagent shares your working tree: tell it to `cp -r` before mutating, and snapshot first. _(full account: `docs/engineering-lessons.md` §C-4)_
- **Adjacent controls must not share hit area (CUL-612, CUL-579, CUL-621, CUL-618, CUL-688, CUL-756):** two touchable siblings need `gap >= facing hitSlop(a) + facing hitSlop(b)`; prefer asymmetric `hitSlop` (`HITSLOP_ACTION_LEFT` / `HITSLOP_ACTION_RIGHT`, `lib/completionCard.ts`) over widening the row. Pick the tool by the geometry: flush controls, or controls already at the 44pt floor, grow the box (`minHeight`) or drop the slop; a wrapping row splits `gap` into `columnGap` / `rowGap`. Pin the geometry the floor depends on with an explicit `minHeight`; assert the RENDERED gap off the flattened style, never tokens restated in the test; a `marginLeft: 'auto'` beside `flexGrow` resolves to zero; re-check the neighbour's arithmetic after growing a box; after any change that lets a container wrap, re-enumerate which controls now face each other and derive the new separation from the reach (`CHIP_STACK_GAP = CHIP_REACH * 2`). _(full account: `docs/engineering-lessons.md` §C-5)_
- **`fireEvent.press` cannot prove a region is tappable (CUL-579):** RTL-RN's press can reach a handler by DESCENDING from an enclosing composite, so a press on an inert label can fire a sibling button and the test passes over the defect. To assert tappability walk UP to the nearest responder host and compare node identity (`owningTouchable(label) === owningTouchable(value)`, or `!== null`). _(full account: `docs/engineering-lessons.md` §C-6)_
- **`disabled` is an accessibility CLAIM, not a way to hide chrome (CUL-682, CUL-728):** RN copies it into `accessibilityState.disabled` and VoiceOver speaks "dimmed", so it asserts a control exists and is unavailable — where that is true, pair it with a label saying why. Where no control exists for that state, SPLIT BY HOST: the interactive branch keeps the touchable, the inert branch is a plain `View` with `accessible` (so its children still announce as one sentence) and no `disabled`. Read the branch, not the contradiction: a branch that renders no affordance and still renders a touchable is the defect. Give a real button its role; never invent a label that differs from the visible text. _(full account: `docs/engineering-lessons.md` §C-7)_
- **A truncated `Text` still announces its FULL string (CUL-726):** `numberOfLines` is layout and never edits what a screen reader reads (iOS builds the label from the whole attributed string; Android reads the full `Spanned`), so a label added to "rescue" truncation is a placebo. A label is right when it says something the visible text does not, or when splitting one `Text` into two fragments the announcement and a label rejoins them. Truncation costs the sighted reader: when a compound string must yield, the half stated fewest times on the surface is protected (`flexShrink: 0` + `maxWidth: '100%'`), and `numberOfLines={2}` cannot be combined with "the type shrinks first". _(full account: `docs/engineering-lessons.md` §C-8)_
- **A record-scoped surface names the RECORD's pet, never the active one (CUL-574):** resolve with `resolveRecordPetName(pets, record.petId)` (`store/petStore.ts`), never off `activePet`; a blank name counts as a miss, and there is NO active-pet rung — every store mutator keeps `activePet` inside `pets`, so the fallback could only fire when the record's pet was not the active pet either. Derive the name in the render body rather than mirroring it into state. **Guarded since CUL-659 / CUL-711: `guards/recordPetName.test.ts` fails the build on the `?? activePet?.name` fallback shape** (exemption `// record-pet-ok: <reason>` within ten lines above). Correct-but-anonymous beats confidently wrong, and a record screen should still SAY whose record it is (CUL-660). _(full account: `docs/engineering-lessons.md` §C-9)_
- **A defaulted timestamp is the app's claim, and a displayed one is a promise (CUL-576, CUL-701, CUL-708):** a clock-seeded `occurred_at` writes `occurred_at_source: 'now'`, never `'manual'`; every point-time edit routes through `sourceAfterPointEdit` (a peek-and-save is a real gesture that changed nothing). A stale clock default is RE-DERIVED on re-entry (`refreshedNowPoint`), never re-stamped at save — the meal one-tap path is the counterexample, not the precedent; only a `'now'` point ever moves. `occurred_at_source` is REQUIRED on `updateEvent` with no runtime fallback, because it describes the value the call always writes; `severity` / `notes` / `confidence` preserve on omission because they do not. _(full account: `docs/engineering-lessons.md` §C-10)_
- **Symptom-key lists are discovered, decided, and guarded (CUL-676):** any array / Set / Record enumerating ≥3 symptom leaf keys must be registered in `guards/symptomLists.test.ts` AND carry a per-leaf decision row in the §13a membership walk (`constants/eventTypes.membership.test.ts`); the guard fails the build on an unregistered list (exemption `// symptom-list-ok: <reason>`). A transitive consumer is invisible to the scan — name it in the walk row of the list it rides on; registration without a walk row is half-registration. _(full account: `docs/engineering-lessons.md` §C-11)_
- **Single-select chips:** closed-set single-select pickers (form / route / format, etc.) use the wrapping, accessible `components/ui/ChipGroup` — never a horizontal `ScrollView` of chips. A silent h-scroll hides options off-screen, so owners pick from only what they can see (B-146). Horizontal scrolling is for browsing media/recents only, and always carries a visible "there's more" cue (paging dots or an edge-fade), never a bare hidden-overflow row.
- **Filters & scopes (the lens shapes — 2026-07-24, `docs/nyx-filter-ux-requirements.md`):** a *lens over a list* picks its shape by set size, not one-shape-fits-all. ≤5 short always-visible options on a hot path → visible `ChipGroup` chips; 2–3 fixed equal windows → segmented control; a long (≳5), growable, or long-labelled set — or a scarce header — → `components/ui/ScopeMenu` (pill + bottom sheet; the History pattern, #421). Every filter shows a visible active cue when non-default (ScopeMenu's tint rule), defaults are explicit options, and an option that expands dependent inline UI stays a visible chip. The B-146 edge-fade carve-out History once had is deleted — no hidden-overflow option row anywhere, ever.
- **Loading indicators:** use `components/brand/WhorlSpinner` (B-284 N3), never `ActivityIndicator` — the one exception is `components/ui/PrimaryButton`'s own loading prop. Pick the tier by expected duration: **skeletons** (`components/ui/Skeleton`) for content-shaped waits under ~1s; **`WhorlSpinner`** (`sm` inline / `md` in-place, `ground="day"`; `tint={color}` on a coloured/dark button where a teal whorl would vanish) for ~1–10s; the **`NightMoment`** (`components/brand/NightMoment`) only for a full-screen wait that is all three of blocking + expected >~2s + real work on the pet's behalf (cold start, vet-report build, photo extraction). Every animated loader defines a reduced-motion static frame and pauses on app blur (`hooks/useReducedMotion` + `hooks/useAppActive`).
- **A read that hasn't answered is never an empty record (CUL-575):** a surface reading local storage has three states below "has rows" — a skeleton while in flight, error + retry on failure, the designed empty state only once a read answered with nothing. A `loading` flag alone cannot carry it (the first frame is `rows=[] && !loading`), so pair it with a `loaded` flag (`app/(tabs)/history.tsx`; `SkeletonRows`, hidden from assistive tech). Downward: an optimistic rollback restores every store it touched and re-reads the active pet fresh from the store, never from the closure, and a failed write is always said. _(full account: `docs/engineering-lessons.md` §C-12)_
- **A value returned before its write has landed is an INTENT, and its name must say so (CUL-699):** a fire-and-forget write cannot report whether it took, so its return is named for what it means to be (`intendedSnapshotKg`); returning `null` on the one synchronous gate is the opposite false claim. Assert the return in the REFUSED case, not only on the happy path. _(full account: `docs/engineering-lessons.md` §C-13)_
- **A component already inside a `Modal` never presents another one (CUL-662):** a second RN `Modal` from the same presenter is unreliable on iOS and wedged the beta log sheet for every multi-pet account. A surface reusable in both positions splits into a panel plus a thin Modal wrapper (`PetSwitcherPanel` / `PetSwitcherSheet`). A layer declares `accessibilityViewIsModal` and its host sets `importantForAccessibility="no-hide-descendants"`; anything the layer navigates to dismisses the host first (`onNavigateAway`); a self-animating layer resets on the way OUT; the test pins exactly one Modal with the layer open and closed, and was run red against the pre-fix tree. _(full account: `docs/engineering-lessons.md` §C-14)_
- **A shared surface reused by a capture host drops whatever LEAVES that host, and names the real scope (CUL-678, CUL-680):** `captureSurface` on `PetSwitcherPanel` (default off) hides the `Add a pet` / `Archived pets` rows on the log sheet and FAB menu and carries the disclosure that a switch re-points the whole app. Name the prop for what the host IS, never for what it hides; hide admin, never a pet; drop the query with the row and assert the call, not the row; keep a defect-guard wiring even when the gate makes it unreachable; check the door map before removing an entry point. In disclosure copy prefer the scope contrast to an enumeration. _(full account: `docs/engineering-lessons.md` §C-15)_
- **Haptics (CUL-604, CUL-601; polish spec §5.6):** never import `expo-haptics` at a call site — use the moment-named verbs in `lib/haptics.ts` (one verb per moment, the export list pinned by `lib/haptics.test.ts`; a symptom commit is a soft impact, never a success). Silence on safety is structural: `guards/haptics.test.ts` fails the build if a safety component imports the module (exemption `// haptics-guard-ok: <reason>`); the one exemption, `SignalZone` (CUL-601), is paid for with a gate and a test, never by moving the call to an unscanned file. Every verb is fire-and-forget; a commit haptic fires at the moment store's reveal, not at the call site. _(full account: `docs/engineering-lessons.md` §C-16)_
- **Completion surfaces speak the record, not "Logged" (CUL-606, CUL-614; polish spec §5):** a confirmation names what was written, derived from the payload's structured `LoggedRecord` through `lib/completionCard` → `lib/logCopy` → `describeOccurredAt`; the R1 card cannot be handed a display string and the R2 `SheetLogBeat` cannot be left without a required `title`. "Change time" splits by what the record holds: witnessed / estimated / unclassified omit the confidence key, an open window moves its discovery bound with the point, a two-sided window renders no picker. A completion surface names the pet. _(full account: `docs/engineering-lessons.md` §C-17)_
- **Every commit path routes through its completion card (CUL-613), and every guard is proven by MUTATION (CUL-621, CUL-712):** an `insertMeal(` / `insertMedicationDose(` call site must reach `showMeal` / `showMedication`; `guards/completionCard.test.ts` enforces it (exemption `// completion-card-ok: <reason>`; `MedStrip.tsx` holds the one). Run a new guard against the tree it was written for before trusting it, and prove it by breaking the source rather than by reading the test; split a new test by required direction (a guard reds pre-fix, a refactor-safety test is green before and after). A detector fixture lives OUTSIDE the scanned tree via `guards/fixtureRoot.ts` (`createFixtureRoot`, a REQUIRED `root` parameter, teardown guarded by provenance and containment), and the live scan is proven by dropping a real violation into the real tree. _(full account: `docs/engineering-lessons.md` §C-18)_
- **A record-anchored DATE is free; a DURATION is guarded (CUL-69):** re-anchoring a claim to the record's earliest entry costs nothing as a date, but a duration inherits the detection engine's floors or is DISCLOSED beside the engine's span — never re-derived at the render layer. A year-less date is safe only inside a bounded range; stamp the year once per band, never per date or conditionally; a pointer to another section is not a licence to generalise. On a safety surface re-run the falsification pass after every correction and prove each new guard by mutation. _(full account: `docs/engineering-lessons.md` §C-19)_
- **Every soft delete goes through the one shared reversal (CUL-641):** call `reverseLoggedEvent` (`lib/undoLog.ts`), never `softDeleteEvent`; `guards/reversePath.test.ts` fails the build otherwise (exemption `// reverse-path-ok: <reason>`; `lib/widgetBridge.ts` holds the one), so a side-effect added to a write path is inherited by every delete surface. A delete site never has to know what it removed (`reconcileWeightSnapshotAfterDelete` self-guards, reading the parent's `event_type`); a record-scoped store patch uses `patchPetById`, never `updatePet`; a denormalized snapshot with two writers is only ever un-written by the record that wrote it — compare the deleted row's own value first — and absent vs `null` read apart with an explicit `undefined` check. _(full account: `docs/engineering-lessons.md` §C-20)_
- **Every destructive action carries exactly one safety net — a confirm before, or a way back after (CUL-645):** the app's destructive actions are consistent under confirm XOR reversal. A one-tap destructive action is earned by recreatability, so a photo-bearing record's Undo confirms and NAMES the photo (`NamedPayload.hasAttachment`). The rigid haptic belongs on the confirm (`undo()` fires it); a dialog over a self-dismissing surface holds it open (`pauseDwell`); an `'ignored'` after an explicit confirm is spoken. _(full account: `docs/engineering-lessons.md` §C-21)_
- **A one-shot navigation request is consumed in a REF, never in state (CUL-170):** held in state, an already-scheduled passive effect re-enters with the pre-clear closure and fires twice. The request lives in a ref cleared BEFORE the side effect, and state carries only a tick. A component that must be measured takes an `onLayout` passthrough (`Card`), never a wrapper View; anchors in different coordinate spaces compose in one tested helper (`medFocusScrollY`); count calls, since `toHaveBeenCalledWith` cannot see an identical second fire. _(full account: `docs/engineering-lessons.md` §C-22)_
- **Widget layouts (`widgets/*.tsx`, 2026-07-24, widget PR W5):** a `'widget'`-directive function is **not** a React component and does **not** run in the app process — babel-preset-expo stringifies it and the iOS widget extension evaluates that string in a bare JavaScriptCore context whose only globals are `@expo/ui/swift-ui`, its modifiers, and a JSX shim. So: **no imports are in scope at runtime** (a theme token, a helper, anything module-scope, is a ReferenceError on device — inline it inside the function), **no filesystem and no network** (a press returns a props patch; capture goes through the outbox in `lib/widgetBridge.ts`, never a direct write), and a **dynamic child list must be passed as one flat array expression** (the native child walker drops nested arrays). Every widget layout gets a test that evaluates its emitted string in a stand-in of that context (`widgets/CulpritWidget.test.ts`) — that eval, not review, is what keeps the constraint honest.
- **New local SQLite tables (2026-07-26, B-424):** a table's DDL goes in a **schema constant** — `BASE_SCHEMA_SQL` (`lib/localSchema.ts`), `MEDICATION_SCHEMA_SQL`, or `DIET_TRIAL_SCHEMA_SQL` — never a bare inline `execAsync`, and the table goes in **`LOCAL_WIPE_TABLES`** (children before parents). Both are now enforced: `hydration.test.ts` builds a real `node:sqlite` DB from those constants and derives the wipe set from `sqlite_master`, then scans the app source for a `CREATE TABLE` the constants don't produce. A table that skips either step **fails the build**, which is the point — the wipe is what stops a shared device leaking the prior account's health record, and the list still fails *open* at runtime. An exemption is a Trust & Safety decision: name it in `NOT_WIPED_ON_SIGN_OUT` with the rationale, never by omission. Same rule for account state outside SQLite (AsyncStorage keys, in-memory caches, the App Group) — it goes in `wipeLocalSession`.
- **A push marks the VERSION it sent, never the row (CUL-691):** `markSynced` and `applyFailurePolicy` (`lib/sync.ts`) match `WHERE id = ? AND updated_at IS ?` (`IS`, null-safe), so an owner edit inside the network gap is never stranded at `synced = 1`. Every re-queueing mutation must MOVE `updated_at` (scanned by `syncQueue.test.ts`); the unguarded set is a runtime array the type derives from, pinned in both directions; a test replays the captured statement against a real row whose `created_at` differs from its `updated_at`. _(full account: `docs/engineering-lessons.md` §C-23)_
- **A queue drains ONE AT A TIME, and the wait is bounded (CUL-622):** a new push entry point goes through `serializeQueuePush` (`lib/sync.ts`) — one active drain per table. A caller arriving mid-run gets one TRAILING run whose slot is released when it STARTS; past `QUEUE_PUSH_WAIT_CEILING_MS` a trailing run goes anyway, degrading to the old concurrency rather than a new failure; the trailing slot is checked before the in-flight slot; the trailing run calls `startDrain`, never `serializeQueuePush` or a bare `drain()`; the slot release is identity-checked. Test by counting upserts at the moment the next caller arrives. Strong on the row queues, partial on the object queues (CUL-743). _(full account: `docs/engineering-lessons.md` §C-24)_
- **Canonical keys — Class A vs Class B (2026-07-24, B-414 ruling; full text `docs/nyx-multi-protein-requirements.md` §10 D3a + the `lib/protein.ts` header):** when two values may be merged onto one key, the line is *does justifying the merge require knowing anything about animals?* **Class A** (orthographic/artifact — casing, padding, boundary punctuation, form-qualifier spellings) is permitted **always, on read, retroactively**; leaving these split is pure data loss. **Class B** (semantic — two different tokens asserted to be the same animal) is **write-path only, never retroactive**; a wrong call pools two species across the whole record invisibly. Every canonicalizer is **convergent** (`f(f(x)) === f(x)`), enforced by a cross-product **property test** — an example list is what let B-414 ship a `chicken -` key under a docstring claiming idempotence. Each Class-A re-key ships with a before/after affected-row count.
- **Imports:** Absolute imports from project root. No relative `../../` chains longer than one level.
- **State:** Zustand for global state. Local `useState` for component-only state. No prop drilling beyond two levels.
- **Error handling:** Every async function has explicit error handling. No silent failures in sync or API calls.
- **Owner-facing copy is guarded, not just reviewed (CUL-445, CUL-651):** `guards/ownerFacingCopy.test.ts` fails the build when a display sink reads a string off an error (one local hop followed; a helper function is a known limit), when rendered owner copy carries a `!`, when error copy uses an untranslated clinical term, or when a STORED error field (`ai_extraction_error`, `syncError`, `last_error`) reaches a sink. Map through an `authErrorCopy`-style mapper; exemption `// copy-guard-ok: <reason>`. When a fix makes a hidden state visible, follow the CONTROL that widening exposes, not just the state it reveals. _(full account: `docs/engineering-lessons.md` §C-25)_
- **A shared module's boundary is what IMPORTS it, not what its name suggests (CUL-717):** owner-facing copy never goes in `lib/utils.ts`, which three Edge Functions import; the closure is `grep -rho '\.\./\.\./\.\./lib/[a-zA-Z]*\.ts' supabase/functions`. When `guards/edgeFunctionDeploy.test.ts` goes red on a change that touched no Edge Function, move the code — never bump the ledger. _(full account: `docs/engineering-lessons.md` §C-26)_
- **A service-role query names its subject by id PAIRED WITH ITS OWNER (CUL-696):** on the service-role path scope as `WHERE p.id = '<uuid>' AND p.user_id = (SELECT id FROM auth.users WHERE email = '<owner>')`, written exactly once (a CTE; a preflight reads the CTE, never re-typed literals). A name match and a bare id are not ownership checks; zero rows is ambiguous and never means "empty"; scoping the subject does not scope the JOINS (CUL-736); whether to guard `scripts/*.sql` is CUL-739. _(full account: `docs/engineering-lessons.md` §C-27)_
- **An adversarial rewrite of owner-facing copy re-enters the voice pass (CUL-778):** when a clinical or statistical pass changes a string an owner reads, the Designer / `nyx-voice` read runs again on the result and the DoD persona line says so — a clause squeezed under a length cap loses its "why" first. A worst-case fixture pins every variable the editor cannot see (month-name length), and a negative guard calls the layer that owns the behaviour. _(full account: `docs/engineering-lessons.md` §C-28)_
- **Comments:** Comment the why, not the what. Schema decisions and architectural rationale warrant comments. Obvious code does not.
- **Testing:** Unit tests for all store logic and Edge Functions. `jest` + `@testing-library/react-native` for component tests. Test files co-located as `ComponentName.test.tsx`. No E2E tests in MVP scope.
- **Timezone-honest fixtures (B-514):** the day boundary is LOCAL midnight, so a fixture for a local-day question is never a UTC literal: pass an explicit `timeZone` where the helper takes one, or build the instant from local components; never widen a production signature to make a test pinnable; where one value is read two ways use UTC literals at the same time of day. Enforced by the `App (jest, non-UTC timezones)` CI job (UTC+14 / +12:45 / −10); add a zone rather than assume the extremes cover the middle. _(full account: `docs/engineering-lessons.md` §C-29)_

---

## Environment and Secrets

- Client-side environment variables use Expo's `EXPO_PUBLIC_` convention: they are read directly via `process.env.EXPO_PUBLIC_*` and inlined into the bundle at Metro start. `lib/supabase.ts` fails fast with an actionable error if `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are missing or still placeholders. Editing `.env.local` requires restarting Metro with `npx expo start -c` (the `-c` clears the cache so new values get inlined). Never hardcode keys or tokens in source files.
- `.env.local` for local development. This file is gitignored — never commit it.
- Supabase URL and anon key live in `.env.local` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The `EXPO_PUBLIC_` prefix makes them available client-side; anything without that prefix is server-only.
- Edge Function secrets (service role key, Claude API key) are set via `supabase secrets set` and never stored in the repo.
- When a new secret is required, document it here and flag to the PM to provision it in EAS Secrets before the next production build.

### Secrets Register

Single source of truth for every secret the project uses. Update this table inline the moment a new secret is introduced — do not wait for the session summary. When you reference a secret in code, sanity-check it against this table; if it's missing here, add it and flag a PM Action Item to provision it.

| Name | Location | Used by | Provisioned? | Notes |
|---|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `.env.local` (local), `eas.json` `build.*.env` (build) | Client | ✓ local; ✓ build (eas.json env, all 3 profiles, 2026-06-07) | Public; safe to expose. Committed in `eas.json` — fine, it's inlined into every client bundle regardless. Was the cause of the first TestFlight crash-on-launch (env unset → `lib/supabase.ts` fail-fast throw at startup). |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` (local), `eas.json` `build.*.env` (build) | Client | ✓ local; ✓ build (eas.json env, all 3 profiles, 2026-06-07) | Public; RLS-gated. Committed in `eas.json` — same rationale; rotate via Supabase dashboard if ever needed. |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase secrets` | Edge Functions | ✓ | Server-only; never ship to client |
| `ANTHROPIC_API_KEY` | `supabase secrets` | `extract-food-from-photo`, `extract-medication-from-photo` (drug-label vision, Sonnet 4.6 — B-117 PR 5), `analyze-vomit`, `analyze-stool` (stool vision, Sonnet 4.6 — B-247 PR 4, deployed v1 2026-07-17), `generate-signal` (AI Signal phrasing, Haiku 4.5), `ask` (Q&A over the pet's record — Sonnet 4.6 tool-loop, B-228 A4; model id overridable via the `ASK_MODEL` env; **A8 live photo reads route through `analyze-vomit`/`analyze-stool`** — the same key, the same per-incident caps, no new key) | ✓ — already provisioned; reused by `ask` (B-228, no new key needed). | Server-only. `generate-signal` degrades to deterministic templates if unset; `ask` degrades to the honest `llm_unavailable` deflection if unset (non-fatal, no credit burned). A8's live read invokes the shipped analyze-* functions over HTTP with the caller JWT — those functions hold the key + do the vision call, so `ask` itself never needs it for a read. |
| Resend SMTP credentials (`smtp.resend.com` / user `resend` / password = a Resend API key `re_…`) | Supabase Dashboard → Authentication → Emails → **SMTP Settings** (encrypted at rest by Supabase) — **NOT in repo, not in EAS** | Supabase Auth: every transactional email (signup confirmation, password recovery once B-280 ships, magic links, invites) | ✓ — provisioned 2026-07-25; **verified by a live send** (`POST /auth/v1/signup` → HTTP 200 + `confirmation_sent_at`, delivered to the PM's inbox) | Server-only; the app never sees it. Sending domain `getculprit.app` is verified in Resend (DKIM + SPF; DMARC `p=none` until there is sending history). Sender `support@getculprit.app` / `Culprit`, PM-ratified 2026-07-25 (`docs/culprit-website-requirements.md` §5.2). Rotate by minting a new API key in Resend and re-pasting into Supabase; Supabase never displays the stored value, so re-verify with a live send, never by eye. |
| `EXPO_TOKEN` | Codespace env (optional) | `eas update`, `eas build` CLI | ✗ — interactive `eas login` works fine for now | Only needed if we automate EAS publishing from CI. For manual `eas update` from Codespace, `eas login` once per Codespace is sufficient. |
| Apple Developer account | EAS / App Store Connect | iOS TestFlight / standalone builds | ✓ — enrolled 2026-06-07; first TestFlight build installed | Enables TestFlight + standalone iOS builds. With a real build in place, `eas update --branch preview` now reaches it OTA (Runtime A). Per-push on-device testing still uses Runtime B (Metro + tunnel). |
| `SUPABASE_ACCESS_TOKEN` (Supabase account PAT, `sbp_…`) | Codespace secret / shell env — **NOT in repo** | `scripts/deploy-edge.sh <name> --deploy` (test → bundle → verify → upload in one command) | ✓ — provisioned 2026-07-27 as a Codespace secret scoped to `project-nyx`; old `nyx-cli-deploy` PAT revoked (B-485). **Not present in cloud-session env** — large-function deploys run from the Codespace; the MCP inline path stays the small-function fallback. | Server-only; never commit. **Preferred deploy path since 2026-07-26** (B-455); the MCP `deploy_edge_function` fallback takes the bundle inline, which is unsafe past a few tens of KB (`generate-report` is 240 KB). Mint at dashboard → Account → Access Tokens; revoke there too. |

**Columns:**
- **Location** — exact mechanism (`.env.local`, `supabase secrets`, EAS env, EAS Secrets). If it lives in more than one place, list both.
- **Provisioned?** — ✓ if set in that location and known working; ✗ or "needed" if not yet. When ✗, file a Linear issue on the `Waiting on PM` label.
- **Notes** — public vs server-only, rotation cadence, anything non-obvious.

---

## Git Workflow

**Branch naming:** `feat/short-description` for new features, `fix/short-description` for bug fixes. Example: `feat/attachment-support`, `fix/offline-sync-conflict`.

**Flow:**
1. Create a feature branch off `main`
2. Make changes via Claude Code
3. Push branch → open PR with a detailed description (see PR format below)
4. Test via Expo QR code on device
5. Merge PR to `main`

**PR descriptions must include:**
- What changed and why (not just what — the why is the important part)
- The `CUL-NNN` Linear issue(s) this advances — reference each in the PR **title or description** (e.g. `Fixes CUL-183`, or a bare `CUL-183`) so Linear's native GitHub integration auto-links the PR and moves the issue's status. See the merge→Linear-status rule below.
- Which build step or sub-step this advances
- Any schema changes made
- Any open questions this raises or resolves
- Manual test steps (what to verify via QR code before merging)

**Rules:**
- PRs required before merging to `main`. No direct commits to `main`.
- **CI runs on every PR (B-390, `.github/workflows/ci.yml`):** `App (typecheck + jest)` and `Edge Functions (deno test)` are required checks on an Active `main` ruleset with an empty bypass list (plus `App (jest, non-UTC timezones)`; making it required is CUL-586), so a red check blocks the merge. The Deno job's `npm ci` and its `--allow-read=supabase/functions` are load-bearing, not cruft; actions are SHA-pinned (bump the SHA and its version comment together); never fix a red run by weakening the check (`--no-check`, `continue-on-error`, dropping a suite) without saying so in the PR.
- Schema changes always get their own PR — never bundle a schema change with UI work.
- Squash merge to keep `main` history clean and linear.
- Do not merge a PR if QA criteria for the current build step are not yet met.
- **One PR per session.** The end-of-session `docs/sessions/` record (and any STATUS.md / CLAUDE.md / doc edits) ride in the session's *existing* work PR — committed to its branch before merge — not a separate "record the merge" PR afterward. Write the session record's outcome as `shipped via #<n>` (the PR number is assigned at creation, drafts included), never as `merged to main (#<n>)` — the post-merge phrasing is what forces the second PR. **Exception:** if the work PR was already merged mid-session, the status update is a small standalone follow-up. This is orthogonal to the schema-isolation rule above — STATUS.md is not schema. (Mechanics in `/wrap`.)

**PR check-ins — arm at most one, never a standing chain (instituted 2026-07-25).** A session that opens a PR may schedule a self check-in to catch what webhooks miss. Bound it:

- **Arm at most one check-in, ~90 minutes out, and only while sibling sessions are actively landing on `main`.** If nothing is in flight, arm nothing — there is no event to catch.
- **Stop after one check-in that finds nothing.** Do not re-arm on a no-op. A chain that re-arms unconditionally can only terminate on merge, and PRs here sit open for weeks.
- **Never arm one at `/wrap`**, and never leave one armed overnight. The PM merges by hand, in the morning; `main` does not move while they sleep, so an overnight check-in is guaranteed to find nothing.
- **Never poll on an interval shorter than ~90 minutes.** An hourly cadence lands past the prompt-cache TTL, so every wake re-sends the session's entire context at full price to learn nothing.

Measured before this rule existed: 102 check-ins in three weeks, of which three did any work, all of it base-drift repair after `STATUS.md` collisions that no longer exist (see `docs/sessions/README.md`).

**Merge → Linear status — reference `CUL-NNN` in every PR (instituted 2026-08-16).** Linear (team Culprit) owns issue status, and the native GitHub↔Linear integration moves an issue Todo/Backlog → In Progress → Done automatically **when a PR references it** — verified: CUL-15 auto-linked PR #655 and transitioned in lockstep with the merge. So:

- Put the issue identifier (`CUL-NNN`, or a closing magic word like `Fixes CUL-NNN`) in **every PR's title or description**. One PR advancing several issues names all of them, so they all move together.
- Where the session controls the branch name, prefer Linear's suggested `gitBranchName` (e.g. `danieljmarkii/cul-NNN-…`, on the issue) so the link fires off the branch too. **Agent sessions run on a fixed `claude/<slug>` branch that does not reference the issue** — for those, the PR-body reference is the only trigger, so never assume the branch alone linked it.
- **Backstop when auto-link didn't fire:** `/wrap` explicitly sets each touched issue's status and attaches the PR via the Linear MCP (`save_issue` state + `create_attachment`). See `/wrap` Step 4.
- **Do not build a custom GitHub Action for this** — it would duplicate the native integration and fight it on status writes.

**Migration Safety Pre-flight.** Any PR containing a schema migration must include, in the PR description:
- **Rollback plan** — exact reversal steps (e.g. `DROP COLUMN X`, `DROP TABLE Y`) or `Irreversible — back up first` if not.
- **Destructive y/n** — `y` if the migration drops, renames, or alters a column with existing data; `n` if it's purely additive.
- **Backfill** — if existing rows need values, the SQL or script that produces them; `N/A` if not.

If destructive=`y`, the PR description also names the table(s) affected and the row-count check the PM should run before applying. Migrations are the highest-blast-radius action in this repo; this pre-flight is non-optional.

---

## Session Protocol

### Session Start

**If running interactively (conversational session with the PM present):** Ask these three questions explicitly before reading docs or writing code:

1. "What build step are we on?" — confirm and update the Current Phase line in the Build Sequence above
2. "Is there anything from last session's open questions that's been decided?" — update the Open Questions table if so
3. "Any change in scope or priorities since last session?" — surface before building, not after

**If running non-interactively (CI trigger, background agent, GitHub Action):** Skip the check-in. Read `technical-spec.md` and proceed based on the Current Phase line in this file.

Before asking the three questions, surface the canonical state in the opening message — the live tracks and in-flight work from **Linear**, anything on the **`Waiting on PM`** label that gates the obvious next task, and any blocking Open Question — i.e. everything the PM would need to recap. `STATUS.md` gives you the routing; Linear gives you the answers. This lets the PM answer "no change" and move directly into work instead of recapping.

Then read the relevant docs for the confirmed build step before writing any code.

**Shortcut:** run `/kickoff` to auto-generate this orientation — it queries Linear (team Culprit) for the live projects, the in-flight issues and the `Waiting on PM` label, cross-reads `STATUS.md` + the newest `docs/sessions/` records, and proposes a concrete first task. It's the mirror of `/wrap`.

### Starting from a Linear issue (instituted 2026-08-16, CUL-528)

Most sessions now begin by pasting an issue from Linear (team Culprit) via its **"copy as prompt"** action. The workspace's coding-tool prompt template (Linear → Settings → Code & reviews) is a deliberately **thin router** — a *work-path* config a session never `Read`s (per the read-path→git / work-path→Linear rule); it front-loads the launch ritual and defers every rule back to this manual. The durable rules live here. The ritual is **claim → orient → name the mode → close out**:

0. **Claim the issue — first, before reading anything else** (instituted 2026-08-30, CUL-624). `get_issue CUL-NNN`, then set `In Progress` (`save_issue`) **and** post the claim comment (`save_comment`), whose first line is the machine-greppable marker:

   > **Claimed** — branch `claude/<slug>`, `<ISO-8601 UTC>`, mode BUILD|DISCOVERY.
   > A different session reading this: stop and surface rather than starting. Released by this session's `/wrap` outcome comment.

   **`In Progress` on its own is not a claim; the branch name in the comment is the discriminator** (the launch path sets `In Progress` minutes, sometimes seconds, before a session's first tool call). Another branch's claim, recent, no merged PR → **stop and surface** — name the branch and the claim time and ask. Another branch's claim >24h old with no open PR → stale; say so in one line, post a fresh claim, continue. An open PR already referencing the issue → work in review, not a claim → surface before touching it. Nothing at all → claim it and carry on.

   This is the repo's only collision guardrail that covers the *issue* rather than a *file* (two sessions built CUL-599 in parallel on 2026-08-23 and opened near-identical PRs fifteen seconds apart); a session that claims and then dies leaves the issue looking taken, which the `backlog-groomer` skill adjudicates from the comment's branch.

1. **Orient** as `/kickoff` does, but scoped to *this* issue — skim `STATUS.md` for the routing, then read the "Read These Before Writing Any Code" docs for the surface it touches; don't switch to a different task. The issue's **description and its comments** are the spec; newest comment wins on conflict.
2. **Name the mode** — only once step 0's claim is yours (a contested claim is a stop, not a mode) — infer it (a `Feature`/`Fix` or `Research`/`Spec` label is a hint when present, but issues are largely unlabeled, so don't depend on one):
   - **BUILD** (feature / fix / migration / tooling) → deliver **code + a draft PR**. For anything non-trivial, **post a short plan (files touched + approach) and wait for a go-ahead before coding** — skip the plan only for genuinely mechanical fixes. **Anything touching RLS, Storage, deletion, or export is never "mechanical"**: always plan first and run the `rls-privacy-reviewer`.
   - **DISCOVERY** (research / investigation / a spec / a design-mock / a decision) → deliver a **recommendation or brief for the PM, posted to the issue** — not merged code, and never start building the thing you were asked to evaluate. Open a draft PR only if the deliverable is itself a committed file (a doc or mock).
3. **Close out** — BUILD with `/wrap`; DISCOVERY with an outcome comment on the issue (+ a `docs/sessions/` record if substantial). Either way the PR **must reference `CUL-NNN`** — the agent's `claude/<slug>` branch won't (§ Git Workflow → "Merge → Linear status") — it's one PR per session, and **out-of-scope work you discover → file a new `CUL` issue**, never folded in.

The BUILD **plan-gate** (plan before code) is the one net-new rule of the 2026-08-16 pass; the rest restates existing conventions at the moment they are most skipped. Keep the Linear prompt template a router, not a rulebook.

### Presenting decisions to the PM — decision briefs (instituted 2026-08-07, PM directive)

Whenever a PM decision is requested — an Open Questions row, a mock round's reaction prompts (R-x), a decision gate in a session summary, or an escalated persona conflict — present each decision as a **decision brief**, not a bare question:

- **Deciding:** one line on what actually changes based on the answer.
- **Options:** the 2–4 real options, each ≤1 line, with the team's **recommendation marked and its one-line why**. If there's a genuine persona conflict, name the dissent instead of a recommendation (Conflict Protocol still applies).
- **Consequence:** one line on what the ruling unblocks or forecloses (build scope, spec edits, deferrals).

Keep each brief to ~4 lines. The bar: the PM can rule from the brief alone, without re-reading the underlying doc. A bare "thoughts?" or an option list with no recommendation is not a decision request. This applies everywhere decisions are surfaced — chat wrap-ups, mock React sections, session docs, and Open Questions rows alike.

**Mock what you change (PM directive, 2026-08-07).** A design change is shown, never only described: any change to a user-facing surface lands as frames in the current mock round (republished to the same artifact URL) in the same session it's proposed, and a decision whose options differ *visually* renders those options **side by side in the mock** — the brief then points at the frames. Presenting a visual choice in words alone is the anti-pattern this rule exists to stop. (Process/code-internal changes that have no rendered surface are exempt — there is nothing to draw.)

### Definition of Done — Before Saying "Done"

Before reporting a feature, sub-step, or PR as complete, run this checklist explicitly and surface pass/fail. Do not collapse it to "looks good."

- [ ] Acceptance criteria from `technical-spec.md` for this step listed and marked pass/fail (QA persona)
- [ ] Diff scanned against the anti-pattern lists in this file — none introduced
- [ ] Types pass (`tsc --noEmit` or equivalent) and lint is clean
- [ ] **Automated tests**: if the diff touches a Zustand store, an Edge Function, or a shared utility in `lib/`, tests exist for the new logic and `npm test` passes locally. If no test was added, the DoD line reads `tests: N/A — <reason>` (e.g. "pure UI screen, no extractable logic") and the Engineer persona signs off on the exemption.
- [ ] No new secret used without an entry in the Secrets Register
- [ ] **Persona sign-off line** emitted for the feature: name which personas reviewed and what they verified. Example: `Designer ✓ (principles 1, 3) — Engineer ✓ — Data N/A — Dr. Chen N/A`. `N/A` is fine; silence is not.
- [ ] **Adversarial review (mandatory for clinically- or statistically-load-bearing logic — correlation/detection engines, AI reads, escalation thresholds, anything feeding the vet report).** A bare ✓ is not sign-off. The relevant expert persona (Data Scientist / Biostatistician / Dr. Chen) must **state the concrete counterexample they tried to break it with, and why it held** — e.g. `Biostatistician: tried a daily staple + sporadic treat → staple correctly washes out (no false signal) ✓` or `Dr. Chen: tried the clear-foam-but-not-eaten-36h cat → escalates ✓`. If no one can name a falsification attempt, the logic has not been reviewed — say so and do not claim done. _Instituted 2026-05-30 after the AI Signal "nearest-preceding meal" attribution bug shipped under three ceremonial ✓s and was caught by the PM, not the experts. Catching this class of flaw is the experts' job, not the PM's._
- [ ] **Future-self review** (for PRs introducing a *new* pattern, not just using an existing one): one-sentence answer to "would I still want this here in 12 months?" If the answer is uncertain, name the risk before merging.
- [ ] Dev Handoff block emitted, including Manual QA Script
- [ ] PM Action Items consolidated for any work only the PM can finish — **each filed in Linear with the `Waiting on PM` label**, not left as prose
- [ ] If this push completes a chunk: Next Session Kickoff prompts emitted

If any box is unchecked, the work is not done — say so explicitly rather than claiming success.

### During the Session

- When writing UI code, the Designer reviews it against the seven principles before it is considered complete
- When writing data or sync code, the Data Scientist reviews it against the schema
- When making architectural choices, the Dir. of Eng. flags anything that contradicts decided architecture
- When personas disagree, use the Persona Conflict Protocol above — never resolve silently
- When a major decision is made mid-session, update `CLAUDE.md` immediately — do not defer to the session summary
- When a feature nears completion, QA runs the acceptance criteria check and lists pass/fail explicitly

### Dev Handoff — After Every Push

After every `git push`, output the exact terminal commands the PM needs to run to get the latest code onto their phone. Format each command as a code block followed by one plain-English sentence explaining why it is being run. Do not skip commands or assume the PM remembers the sequence from a previous session.

There are **two runtimes** the PM uses, and the handoff differs for each. Pick the one that matches what the PM is doing this session, and emit only that sequence — do not dump both unless the change requires both.

The full, copy-pasteable command scripts for both runtimes — the one-time EAS/ngrok setup and the complete git "divergent branches" explanation — live in **`docs/dev-handoff-runbook.md`**. Read that file when emitting a handoff and paste the matching runtime's block. Quick reference:

- **Runtime B** (the per-push default — Metro + tunnel, for one-off PR testing): `git fetch` → `git checkout <branch>` → `git pull --ff-only` → (once per Codespace) `ngrok authtoken <token>` → `npx expo start --tunnel`, scan the QR, press `r` to reload. This is what the PM uses to test a single pushed PR on-device.
- **Runtime A** (TestFlight — a deliberate, separate "cut a new build" session, NOT per-push): `git fetch` → `git checkout <branch>` → `git pull --ff-only`, then **A-OTA** (`eas update --branch production`, JS-only) or **A-Native** (`eas build --platform ios --profile production --auto-submit`). **The channel is `production`, never `preview`**, and since the SDK-57 fence the next TestFlight cut must be A-Native. Traps + the installed-build state: `docs/dev-handoff-runbook.md` § Current build state. The PM kicks this off by hand, in its own session.

**Default to Runtime B in the handoff** — it's the per-push, test-one-PR path. Only emit a Runtime A block when the session's explicit goal is cutting a new TestFlight build. Emit only the runtime that matches the session; pull the exact commands + their explanations from the runbook.

**The one non-negotiable git rule:** always `git checkout <the handoff branch>` *before* pulling. A bare `git pull` from a different branch triggers `fatal: Need to specify how to reconcile divergent branches`; the fix is never "merge vs rebase," it's switching to the right branch. The one-time `git config --global pull.ff only` kills that prompt for good.

**When git misbehaves** (divergent-branches prompt, "local changes would be overwritten," `--ff-only` failing after a squash-merge, detached HEAD, accidental commit on `main`): see **`docs/git-first-aid.md`** — a symptom→exact-command guide keyed by the literal error message. Point the PM there rather than improvising recovery commands.

**Before pushing**, if the diff touches a store, Edge Function, or shared utility, run:
```bash
npm test
```
Confirms automated tests pass locally. Do not push a chunk-completing PR with failing or skipped tests — fix or mark `tests: N/A` in the DoD with the Engineer's exemption rationale.

**Backend deploys (Edge Functions + migrations) run from the cloud session via the Supabase MCP — no PM action item.** The recurring "paste this SQL into the SQL Editor / paste this function into the dashboard" hand-offs are retired (B-082, 2026-06-20). The full procedure — project ref, the `scripts/deploy-edge.sh` bundle step, the `deploy_edge_function` / `apply_migration` calls, verification, and the security posture — lives in **`docs/edge-deploy-runbook.md`**. Quick reference:

**When an Edge Function is included:** bundle with `scripts/deploy-edge.sh <name>`, deploy via the Supabase MCP `deploy_edge_function` (`project_id` `aigchluqluzuhtbfllgh`, **preserve the function's existing `verify_jwt`**), then verify the version bump + `ACTIVE`, the read-back sha256, and a JWT'd boot smoke-test returning a clean 4xx. Dashboard paste is the fallback only if the MCP is unavailable.

**When a Supabase migration is included:** apply via MCP `apply_migration` (`name` = the snake_case migration name), then `get_advisors` (security + performance). Migration discipline is unchanged — own PR, Migration Safety Pre-flight, and `apply_migration` is a **live write**: apply additive migrations with the schema PR, and a migration a code change depends on *before* deploying that code. Dashboard SQL Editor is the fallback only if the MCP is unavailable.

#### Manual QA Script (required, every push)

After the command sequence above, emit a numbered on-device QA script the PM can run in under 3 minutes. The script must:

- Start from a known state (e.g. "open Expo Go, reload with `r`")
- List the specific taps and inputs to exercise the change (golden path first, then 1–2 edge cases)
- Tell the PM **what to expect** at each step, so they can spot regressions without reading code
- Tie back to acceptance criteria for the current build step — call out which criterion each check verifies
- Flag any check the PM cannot perform on-device (e.g. "verify in Supabase dashboard that `events.synced=1`")

Format:

```
### Manual QA — <feature>
1. <action> → <expected> (AC: <criterion ref>)
2. <action> → <expected>
3. Edge case: <action> → <expected>
```

If the change is backend-only (Edge Function, migration, schema), the QA script is the curl/SQL/dashboard steps to verify it instead — same numbered format.

### PR Merge / Next Session Kickoff

When a PR is opened or pushed that completes a chunk of work (build step ✓, sub-step ✓, or a self-contained feature), emit a **Next Session Kickoff** block alongside the Dev Handoff. The PM uses these prompts to start the next session cleanly without re-explaining context.

Format:

```
### Next Session Kickoff
**Recommended first prompt:**
> <copy-pasteable prompt, 1–3 sentences, names the build step and concrete first task>

**Alternate prompts (if priorities shift):**
- <prompt for a parallel-track item>
- <prompt for an open question that's now ready to decide>

**Parallel / efficiencies (when the work can fan out):**
- <tracks that are independent — disjoint files, no logical dependency — and can run concurrently as separate sessions/branches; name any shared-file collision to expect (STATUS.md is no longer one for most sessions — a wrap normally doesn't touch it)>
- <a single decision that unblocks several tracks; batchable work; which items are ready-to-run vs. gated on a PM/expert call>
```

Rules:
- The recommended prompt always points at the next item in the **Build Sequence** unless a blocking open question makes that impossible — in which case the prompt is "resolve open question X."
- Each prompt is self-contained: it names the file, step number, or doc the next session should read first.
- If a PM Action Item from this session is a prerequisite (e.g. "deploy function X first"), say so explicitly in the prompt.

### Session End — Automatic Summary

Produce this summary automatically at the end of every session without being asked. If the session ends abruptly, produce a partial summary covering what was completed.

**Shortcut:** run `/wrap` to produce the whole close-out deterministically — it runs the DoD, writes the `docs/sessions/` record, reconciles the touched Linear issues (and updates CLAUDE.md if a decision changed the manual, or `STATUS.md` if a track boundary moved), emits this summary and the Dev Handoff, and always finishes with a paste-ready Next Session Kickoff prompt. Use it every session so the wrap-up is identical each time.

```
## Session Summary — [Date]

### Build Phase
[Which step you were on. Whether it is now complete or still in progress.]

### What Was Built
[Concise list of completed work with file paths where relevant]

### Decisions Made
[Any architectural, design, or product decisions made this session]

### Persona Flags Raised
[Any conflicts or concerns surfaced by the team during the session, and how they were resolved or escalated]

### Open Questions Surfaced
[New questions that emerged and need PM input — add these to the Open Questions table above]

### Known Issues / Tech Debt
[Anything intentionally deferred or left rough, with a note on why]

### PM Action Items
[Consolidated list of every action only the PM can take, deduplicated across the session. Examples: apply migration X; deploy Edge Function Y; provision secret Z; rule on open question W; run an on-device check.

**Each one gets a Linear home before the wrap ends** — either a new issue (team Culprit, `Todo`, the **`Waiting on PM`** label, the single remaining step named in the first line) or a comment on the issue it belongs to. Then list them here as `CUL-NNN — <action>`, so the summary is a set of links rather than a second, drifting checklist. That drift is exactly what this section used to feed: 102 unchecked bullets accumulated in `STATUS.md` and roughly half of them were already done. If there are none, write "None."]

### Recommended Next Steps
[Ordered list of what to tackle next session, with rationale for the ordering. **Explicitly surface parallelism + efficiencies** — which items are independent and can run concurrently (disjoint files / no logical dependency), which are gated on a PM/expert decision vs. ready-to-run, and any single decision that unblocks several tracks. Don't present a linear plan when the work can fan out.]

### Next Session Kickoff
[Copy-pasteable prompts the PM can paste into a new session — see PR Merge / Next Session Kickoff section above for format. Always include the recommended first prompt; include alternates if multiple tracks are live.]

### Documentation Updates
CLAUDE.md — [Changes made this session. Already applied inline.]

/docs/ files — [Proposed edits with specific section and proposed change described. Needs PM confirmation before writing.]

Project Brief (Claude.ai) — [Flag if the brief in project instructions needs updating. Remind PM this requires manual update via the protocol in the brief — it cannot be edited by Claude Code.]
```

---

## Documentation Update Protocol

Three tiers. Different rules for each. (For "log this for the future" items, see the **Backlog Protocol** section below — those are filed in **Linear** (team Culprit), not in any of these tiers.)

**Docs & research source of truth — read-path → git; work-path → Linear (instituted 2026-08-16).** Two homes, one test. **Build-critical artifacts a coding session must `Read` to build correctly** — the specs (`nyx-*-requirements.md`, `nyx-technical-spec`), the schema (`supabase/migrations/`, `nyx-schema`), the design principles, and the frozen research briefs (`docs/research/`) — **stay in `docs/`**: the agent reads them at session start, and they're grep-able, diff-able, and PR-reviewed alongside the code that implements them. **Linear (team Culprit) is the plan-and-work surface** — status, priority, the per-issue trail, and net-new planning / deliberation / tracking docs are born there. The single test for any artifact: **does a coding session need to `Read` this file to build correctly? Yes → git. No → Linear.**

- **Standing convention for every build-track project:** link its canonical spec as a Linear project **Resource**, with a one-line "*canonical copy is in the repo; the repo file wins on divergence*" note (already the de-facto pattern on Signals v2 / The Daily Recap — now formal). Linear points at the spec; it never holds a second copy of it.
- **Only `docs/backlog.md` is deprecated** as a source of truth (frozen, migrated to Linear 2026-08-15). The specs, schema, and research briefs are **not** deprecated — they remain canonical in git. Moving the backlog to Linear did not move the docs.

**State-file hygiene — the volatile files must net out, not only grow (2026-07-19 retro; sharpened 2026-08-22).** The Open Questions table and the Linear board are working state; `docs/sessions/`, git history and PR bodies are the archive (`docs/sessions/` is the deliberately append-only exception). Every prepend is paid for by a delete: completed items are removed, resolved or aged entries archived. `STATUS.md` left this rule on 2026-08-22 by removing the thing that made it grow; what remains under manual prune-while-you-prepend is CLAUDE.md's Open Questions table. The signal a file needs pruning: reading it costs more than the work it describes.

**Doc versioning — living vs. frozen (instituted 2026-07-19 retro).** *Living references* (`nyx-technical-spec`, `nyx-schema`, `nyx-design-principles`, the `*-requirements.md` specs) carry their version in the **header** and bump the `Last Updated` date on any material edit — never bake the version into the *filename* (a filename version never gets bumped; that is exactly why the `*-v1_0` docs froze). *Frozen point-in-time artifacts* (research dossiers, dated `docs/research/` briefs, strategy records, competitive snapshots) are **not** version-bumped — a date stamp is honest, and editing them in place destroys the "what we knew when" record. The Read-These table tags each foundational doc 🌱 living / 🧊 frozen so a session knows which ones are supposed to track reality. **How you correct a frozen brief, then (2026-08-30, CUL-671): additively, never in place.** A dated verification-pass section at the foot (`§V`) carries the corrections, and every corrected claim keeps its published wording and gains an **inline ⚠ pointer** to the row that corrects it — the §9b shape the taxonomy spec already uses. Both halves are load-bearing: the addendum alone is unread by anyone who scrolls to the claim rather than the bottom, and an in-place rewrite destroys the record the freeze exists to keep. The corollary that pays for the ceremony: a correction that lands *next to* the original also shows **what kind** of mistake the pack makes — CUL-671's seven corrections were six attributions stated one notch stronger than their source plus one dead link, which is a pattern a reader can carry to the claims nobody has checked yet. And when the brief is a **competitor** sweep, re-verify **at use, not at citation**: three of six products had moved within six days of that sweep being committed, and one "nobody does this" claim was already false on the day it shipped.

**Design mocks are Artifacts, and a mock round re-publishes to the SAME URL (2026-07-31).** The committed `docs/culprit-<track>-mockups.html` is the source of truth; the published Artifact is how the PM looks at it. Round N+1 re-publishes over round N's URL (pass `url`, or the same `file_path` inside one session); keep the `<title>` and favicon stable, name the round inside the page, and say in the page when a round supersedes an earlier one. `Artifact({action: 'list'})` recovers a URL a later session no longer has.

**When rounds stop being legible, split current from archive (2026-08-15, PM directive).** Past ~4–5 rounds on one page the PM cannot tell the live proposal from superseded frames, so split: a **current-proposal page** (`docs/culprit-<surface>-mockups.html`, its own URL; frames replaced in place, git is the history) and the old page as the **deliberation archive** (banner + link to current). Split at the moment a reaction round confuses current with legacy, not before. First instance: `culprit-daily-recap-mockups.html` (current) + `culprit-notifications-mockups.html` (archive).

**Tier 1: `CLAUDE.md`**
Update immediately when a decision is made. **Keep it a rulebook:** a convention's rule and its enforcement (the guard, the marker, the file) live here in a few lines; the story behind it — the incident, the falsification rounds, the measurements — goes in `docs/engineering-lessons.md` under the convention's pointer. A new lesson on an existing rule goes there, not here. Do not wait for the session summary. This file must always reflect the current state of the project, not the state at session start. When you append an anti-pattern, resolve an open question, or establish a new convention, write it here in the moment.

**Tier 2: `/docs/` files** (`technical-spec.md`, `schema.sql`, `design-principles.md`, etc.)
These are versioned product artifacts. Do not edit them unilaterally. When something in the codebase or a session decision should update a doc, flag the specific proposed edit in the session summary and wait for PM confirmation before writing. Use this format:

> Proposed edit to `technical-spec.md`, Open Engineering Questions table: Mark "Minimum Expo SDK version" as resolved. Value: SDK 52. Confirmed this session. Awaiting PM approval to write.

**Tier 3: Project Brief in Claude.ai project instructions**
Claude Code cannot edit this directly. Flag when it needs updating in the session summary under "Documentation Updates." The PM applies changes manually using the protocol defined in the brief itself.

---

## Backlog Protocol

**The backlog lives in Linear (migration complete, 2026-08-15).** `docs/backlog.md` grew past being a usable "where are we" answer (453 KB, session-start scans reduced to `grep`) — Linear gives real filtering/priority/status instead. **Linear (team Culprit, `linear.app/projectnyx`) is the source of truth for all backlog items; `docs/backlog.md` is now a frozen historical record.** All 487 open/in-progress rows were ported to issues `CUL-28`–`CUL-514` (verified 487/487, no rows lost, no duplicates), each tagged `Legacy` with a `_Migrated from docs/backlog.md (B-NNN)_` footer that traces it back to its original row. Rows already belonging to an active build-track project (**Signals v2 — the record, decomposed**, **The Daily Recap**) went into that project; everything else went into the **Legacy Backlog** project. **Do not add rows to `docs/backlog.md` — it is frozen. File new items in Linear** (below).

**New items go to Linear, not the markdown file, effective now:**

**When to file an issue:** any time you're about to say "we should do X later," "noted for future," or the PM says any of those phrases. File it immediately, in-session, before continuing the conversation — via the Linear MCP tools (`mcp__Linear__save_issue`). Do not batch-file at session end and do not wait for PM approval — filing an issue is reversible and cheap; losing the item is not.

**Issue shape:**

| Field | Notes |
|---|---|
| Title | Short, scannable. Keep any legacy `B-NNN` reference in the title only if the item extends/supersedes an already-migrated row. |
| Description | **Open with a `TL;DR — plain English:` section (PM directive, 2026-08-26): 2–4 sentences a non-engineer can read cold** — what this is, why it matters, what done looks like, and (when there is one) the single thing the PM must do, bolded. No file paths, no enum/lane/§ jargon, no internal codenames in the TL;DR; the technical detail follows below a `---` rule. Instituted because "sometimes your tasks are too technical for me to truly understand" — the TL;DR is for the PM; the body is for the build session. Then **Why:** one paragraph, enough context that future-you can re-evaluate without re-deriving. Add **Blocks:** the build step, phase, or condition that should trigger this — `—` if none. |
| Priority | Map `Now`→Urgent/High, `Next`→Medium, `Later`→Low (Linear's native field, no separate label needed). |
| Project | The active build-track project if the item extends one (Signals v2, Daily Recap, or a future track); **Legacy Backlog** — or a new project, PM's call — otherwise. |
| Team | `Culprit` |
| State | `Todo` for new items; `In Progress` / `Done` only for items filed retroactively about already-started work. |

**`view backlog` command:** when the PM types `view backlog`, `show backlog`, `what's in the backlog`, or any natural-language equivalent, use the Linear MCP `list_issues` tool (team `Culprit`) and present grouped by priority, surfacing anything whose description names the Current Phase at the top. Linear is the whole answer — **do not also read `docs/backlog.md`** (frozen; it only holds the pre-migration history of already-ported rows). Do not invoke this proactively at every session start — only on request, or when a scan reveals an item that blocks the Current Phase.

**Distinction from Open Questions:** Open Questions are *unresolved decisions* that need PM input to unblock work — these stay in this file's Open Questions table, not Linear. Backlog items are *resolved deferrals* — we know what to do, just not now. If an item needs a decision, it goes in Open Questions; if it needs execution at a later time, it goes in Linear.

**Working the issues in Linear — the per-issue trail (instituted 2026-08-16).** Now that the backlog lives in Linear, the decisions and scope changes that used to land only in `docs/sessions/` and backlog rows should also live **on the issue** — where the work is tracked and where the next session looks first. The convention for any session (or persona) building against a `CUL-NNN`:

- **Scope change discovered mid-build** (the feature turns out bigger / smaller / different than the issue says) → **update the issue description** with `save_issue` (use its `patch` for a surgical edit) so the issue keeps describing the real work. Don't leave the description stale while the truth sits in a comment.
- **Decisions, persona conflicts, and review findings** (a Conflict-Protocol call, an `adversarial-reviewer` / `pm-feature-review` / `rls-privacy-reviewer` verdict, a resolved Open Question that bears on this issue) → **post an issue comment** with `save_comment`. This is the deliberation trail, and it belongs where the work is.
- **Genuinely new scope** (a real deferral, not a change to this issue) → **file a new Linear issue** (`save_issue`, team Culprit, `Todo`) — never a `docs/backlog.md` row, never silently folded into an unrelated issue. (Same "when to file" rule as above, restated for the build loop.)
- **Attribute lightly.** An agent-authored comment names the lens and session behind it — e.g. `— Data Scientist lens, session 2026-08-16-<slug>` — so a human skimming the issue knows who "said" it.
- **`docs/sessions/` stays.** This is *additive and per-issue*, not a replacement: `docs/sessions/` remains the **cross-issue narrative** (what the whole session did, across every issue it touched); the issue comments are the **per-issue** slice. `/wrap` Step 4 is where both get written.

---

## Open Questions

Do not make silent assumptions about these. Surface the relevant question when you reach the step that requires an answer.

When a question is resolved, mark it resolved with the decision and date rather than deleting the row. The resolution is part of the record.

If a blocking question remains unanswered after one full session, document a provisional decision and flag it for PM confirmation rather than stalling indefinitely.

**Stale question triage.** Any question with status `Open` across **three or more sessions** gets a forced re-evaluation at the next session start: (a) still relevant — keep open; (b) no longer relevant — mark resolved with rationale; (c) ready for a provisional decision — write one and flag for PM confirmation; (d) belongs in the backlog instead — move it to `docs/backlog.md` and remove from this table. Do not let questions sit untouched indefinitely; an aged-out question is usually one of these four things, not actually "still open."

### Open

_Resolved questions are archived in **[`docs/decisions-archive.md`](docs/decisions-archive.md)** — verbatim, nothing condensed. When you resolve a question here, move the row there rather than growing this table._
| Question | Blocks | Status |
|---|---|---|
| **Diet trial (B-417) — amendments A-2 (`paused` state) and A-3 (mid-trial card state).** The four gates and six conflicts were all ruled 2026-07-25 (PM); that row is in `docs/decisions-archive.md` verbatim. | B-417 follow-ups | Open — A-2 / A-3 only |
| Minimum Expo SDK version? Document immediately after scaffold. | Step 1: Scaffold | Open |
| Push notification provider for nudge system? | Post-MVP | Open — **narrowed twice.** The 2026-07-10 discovery established local scheduling needs no provider; **2026-08-02 the PM ratified local-first for the whole notification foundation Part 1 (B-661, D2)** — so this question now covers **server-initiated push only** (Signal alerts, household activity — Part 2), and is decided when the first such notification is built. Expo Push Service is the presumptive managed-workflow default when it comes up. `plugins/withoutPushEntitlement.js` stays until then. |
| Freemium gate: which specific features sit behind a future paywall? | Post-MVP | Open — **narrowed 2026-07-06 (B-251 PR 10 paywall mock + `pm-feature-review`).** The onboarding paywall ships as a mock with convenience-only PLACEHOLDER bullets (`Custom app themes` / widgets / priority support); the review named the sub-questions the real gate must answer: (1) is **"advanced correlation views" convenience or care** (Principle 3 intelligence surface — paywalling it paywalls care)? (2) does gating **history at 90 days** silently degrade the free trend view + vet report for a >90-day diet trial / chronic case (so "trends & reports always free" stops being true)? **Multi-pet ships free (B-086) — do NOT gate it.** Reconciliation tracked as **B-263**; when decided, swap the mock's placeholders + re-run `nyx-voice`/`pm-feature-review`. |
| Pet photo upload RLS: `nyx-pet-photos` bucket was created via SQL (owner=null), causing uploads to fail with 42501 even with correct policies. Workaround: re-create bucket via dashboard UI, or implement upload via Edge Function with service role key. | Step 7: Pet profile | Open — needs resolution before photo upload ships |
| Emerging-signals tier on the Signal surface? Surface low-floor "emerging — not established" patterns (e.g. the rapid post-prandial cluster) the statistical engine can never sign. Evidence + proposed guardrails (counts always attached, escalate-or-observe only, never causal, ≤1 card, out of vet report v1): `docs/research/2026-06-fable-signal-engine-rerun.md` §6.4/§9. Product team currently dissents; PM call. **Narrowed 2026-06-11:** two of the three §6.4 artifacts turned out to be deterministically computable and were routed to the new descriptive lane (`docs/nyx-descriptive-signals-requirements.md` — detectors ⑤/⑥ + diet-structure, B-078/079/080); what remains genuinely open is **sub-floor *associational* patterns only** (e.g. the Temptations 3/52-vs-2/162 timing pattern). **Settled for the vet-report surface (2026-06-22):** the requirements spec §8.5 ratifies **`Established`-only on the report** — `Early`/emerging stays owner-side; this Open Question covers the **Signal surface only**. **Council input (2026-06-25, `docs/research/2026-06-vet-council-nyx-deep-dive.md` §9 #5):** the specialist panel adds the Temptations rapid-after-treat timing (3/96 vs 0/49) as a clean worked example of the trade — and its most cautious lenses (criticalist, skeptical GP) named exactly this class of low-n associational pattern the single biggest *false-reassurance / mis-action* risk ("swap the treats and feel fixed"). Evidence for the debate, not a resolution. | Step 10 evolution | Open — narrowed |
| **AI Signals card — scope of any LLM-over-findings surface.** Should the engine gain a bounded "gestalt reviewer" stage (Opus brief §8.1, panel-validated 2026-06-25, `docs/research/2026-06-vet-council-nyx-deep-dive.md` §9 #4): reads only *computed findings + counts* (data-minimized, never raw logs/photos), may **escalate / re-rank / veto a too-calm framing** (e.g. surface chronicity, refuse "improving") but **never reassures and never attributes cause**? Panel's lean: build the deterministic lanes first (B-182 chronicity, B-183 meal-finished-rate), reserve the LLM for the genuinely-gestalt veto/synthesis. Distinct from the emerging-signals tier (above) and from the Haiku *phrasing* layer (B-001/decided). | Step 10 evolution; B-182/B-183 | Open — surfaced 2026-06-25; PM call on whether/how to scope it. |
| **B-182 chronicity lane (detector ⑦) — D2 `minEpisodes` 6-vs-5 sensitivity ratification (Dr. Chen).** PRs 1–3 shipped and `generate-signal` v32 carries ⑦ live end-to-end, so the deploy gate is resolved (one stale in-code "do NOT redeploy" comment at `detection.ts:5826` goes with taxonomy W1-PR-3). The floor question now rides the B-755 floor contract; full history in `docs/decisions-archive.md`. | B-755 floor contract | Open — D2 ratification only |
| **Surface a council-style multi-perspective report to OWNERS?** PM-raised 2026-06-25 after the vet-council deep-dive (`docs/research/2026-06-vet-council-nyx-deep-dive.md`). Should a descendant of the specialist-panel read become an end-user surface? Recommended **staged** path: Rung 1 = the deterministic findings already *are* the report in skeleton (Signal lanes + Patterns; safe, ~built); Rung 2 = the bounded gestalt-reviewer card (above); Rung 3 = the full narrative as a **vet-report (Step 9) enrichment** + maybe a premium owner deep-insight pull-view. **Hard gates:** (a) data-minimization (computed findings + counts across the LLM boundary, **never** raw logs/photos) + consent/retention; (b) the owner-facing version is structurally **escalate-only — never reassures, never diagnoses** (the dominant hazard at scale); (c) cost/calibration + **Pets > $ — the safety insight can't be paywalled (Principle 7)**. | Step 9 / Step 10 evolution | Open — surfaced 2026-06-25; PM north-star call. |
| Medication completion card: keep the meal-card pattern (chips default `given`, auto-dismiss) or diverge for safety — land the dose `unrated` until touched / hold longer? An untouched card persists a refused critical dose as "given", which the n=1-never-reassures bar may forbid for medications. Surfaced by the `pm-feature-review` dogfood (#213). **The B-156 pet-owner review (#221, 2026-06-22) sharpened this into the same problem**: the card auto-dismisses at 5000ms and a chip tap *replaces* (not extends) it with 1500ms (`momentStore.ts:186`), so a safety prompt can't survive the time it takes to actually pill a cat. **B-156 G1 RESOLVED that part (PM, #221): the card DOES auto-dismiss, but the fail-safe is non-negotiable — an *unanswered* prompt where there's evidence against compliance (a not-finished vehicle) must record `unconfirmed`, never `given`, and resurface calmly (`clinical-guardrails` Pattern 2: no path to a reassuring verdict by construction). The standalone one-tap `given` (the owner's own affirmative tap) is fine.** Residual still open here: should a missed/refused dose of a **critical** drug (insulin/anti-seizure/cardiac) escalate even on the standalone card? Apply the same auto-dismiss + fail-safe shape when this is built. | B-117 dose-logging safety | Open (narrowed — critical-drug escalation only) |
| **B-156 combo (med-with-food) — promotion to active build.** The whole chain is shipped (Phase A, B1→B4, C1) and gates G1–G4 are resolved; the ruling history is in `docs/decisions-archive.md` verbatim. | B-156 promotion | Open — promotion only (PM call) |
| **Adopt the minimal household shared-care primitive (invite a caregiver + shared write + `logged_by` + RLS) as capture *infrastructure*?** Discovery §1.2/§5: the household is the unit of care; single-writer accounts structurally under-count (the unwitnessed spouse-treat is the canonical diet-trial contaminant), and the PM's own household already shares one credential (the B-054/B-086 evidence). Explicitly NOT a social layer (no feeds/partner-nudges/per-person stats — T&S surveillance guardrail; pet-centric visibility only). Multiplies every capture surface by caregiver count. `rls-privacy-reviewer` mandatory. | B-292; multiplies B-290/B-291 | Open — surfaced 2026-07-10; PM deferred same day pending a read of the brief |
| **Medication history (B-140 extended) — one live gate: D2** (D3 ratified 2026-08-04). The track is PM-greenlit (2026-08-04) with D1 (dose-derived courses) ratified; spec `docs/nyx-med-history-requirements.md` §0. **D2 — lifetime medication listing on the vet report** (a compact window-ignoring table beside the windowed Appendix D; Dr. Chen: lifetime is the referral-record standard; cost: report length): gates **PR 5 only** and needs a Tier-2 edit to `nyx-vet-report-requirements.md` §3.8/App-D approved before build; deploy rides the B-494 redeploy either way. **D3 — the rundown block's window — RESOLVED 2026-08-04:** PM confirmed the provisional (12 months shown by name + earlier courses folded behind a count) at PR 4's handoff; PR 4 shipped exactly that (#589). | B-140 PR 5 (D2) | Open — D2 only (D3 resolved 2026-08-04) |

## What Good Looks Like

**Design benchmark:** Calm, Linear, Oura. Not generic health apps. Not anything that looks functional rather than built to be used. When in doubt: would a designer at Calm be proud of this screen?

**Engineering benchmark:** An app a senior React Native engineer would not be embarrassed by. Clean separation of concerns, no magic, no shortcuts that become blockers in two sprints. When in doubt: would a senior engineer at Linear be comfortable maintaining this code?

If the answer to either question is uncertain, it needs more work before it ships.

---

## Version History

Most recent three versions only. Older entries archived at `docs/CLAUDE-md-history.md`. The three "Future Work / Ideas" items added to CLAUDE.md in v1.15 (detail-screen pattern for History events, Food Library as a top-level nav item, smarter library deletes) have moved to `docs/backlog.md` as B-003/B-004/B-005 (since migrated to Linear with the rest of the backlog — deferred items now live in Linear, team Culprit; `docs/backlog.md` is frozen).

| Version | Date | Summary |
|---|---|---|
| v1.28 | 2026-08-22 | **STATUS.md reduced to a pointer card; the state moved to Linear.** The PM asked whether session kickoff should be reading Linear instead of `STATUS.md`, and whether that file had become bloated. Both yes, and measurably: **239 KB / 33,000 words / 487 lines** against its own ~200-line budget — 61% of it a `Parallel Tracks` narrative of 25 tracks, ~14 of them fully shipped; a 102-item `Open PM Action Items` checklist with **zero** items checked; and a `Blocking Open Questions` section that was mostly *closed* questions. It had been pruned 210 KB → 86 KB at the 2026-07-19 retro and regrew past its starting size in five weeks, which is the finding: **a size budget without a structural fix only buys time.** The structural cause was that `/wrap` told every session to write its state here, so a file that six-plus parallel sessions rewrote could only grow — and was, by construction, also the repo's worst merge-conflict surface (v1.27 fixed the *session list* the same way, by removing the shared write). Diagnosis matched what the 2026-08-20 reconciliation had already found from the other side: `STATUS.md` still led with "Step 10 — AI Signal" and called Ask "the next main project" months after both stopped being true, while Linear held the truth. **Applied:** (1) `STATUS.md` → **61 lines**, a routing table (which question → which surface) + the live tracks + the two standing holds, and nothing Linear owns; (2) the 102 PM items **triaged, not bulk-migrated** — ~55 already had a live `CUL` issue, ~20 were verifiably done or archived, **17 genuinely un-homed actions became issues (CUL-582…598) on the `Waiting on PM` label**, and the rest were folded as comments onto the issues that own them (CUL-19, CUL-64, CUL-369, CUL-556, CUL-557). The triage paid for itself: it found **migration 052 authored and never applied** (146 live rows still NULL), and two rows — B-080, B-128(b) — that the backlog→Linear migration had dropped; (3) `Runtime in Use` → `docs/dev-handoff-runbook.md` § Current build state, where a handoff actually reads it (and the stale `eas update --branch preview` in CLAUDE.md's Runtime A quick-reference — the exact trap that section warned about — was corrected to `production`); (4) **the workflows rewired so it cannot regrow**: `/kickoff` queries Linear first and adds the `Waiting on PM` sweep, `/wrap` step 3b now says *usually you change nothing* and lists the four track-boundary conditions that justify an edit, and step 4 requires every PM action to be **filed as an issue rather than written as prose**. The retro's state-file-hygiene rule was narrowed accordingly: `STATUS.md` is out of it, because nothing writes to it any more. Process/meta only; no app code, no schema, no build-phase change. Advances CUL-563. |
| v1.29 | 2026-09-02 | **CLAUDE.md cut by more than half — the rules stay, the stories move (CUL-407, B-388).** The file every session re-sends on every turn had reached **235 KB**: 104 KB of Code Conventions narrative (43 bullets, 29 of them over 1 KB), a 34 KB Read-These table with two rows of 6–8 KB, 27 KB of Open Questions of which five rows were already resolved and two more were narrowed to a single residual, and 20 KB of Session Protocol. Every convention now keeps its rule and its enforcement — the guard, the marker, the file — in one to five lines and points at **`docs/engineering-lessons.md`**, where the full account moved **verbatim** (§C-n for conventions, §R-n for the twelve compacted Read-These rows, §P-n for the protocol measurements, the runtime / deploy quick references, the fat Secrets Register notes and the mock-round paragraphs). Five resolved Open Questions rows and the two narrowed rows' histories moved to `docs/decisions-archive.md`; the claim ritual keeps its steps and loses its measurements. Nothing was discarded: every moved paragraph is in the lessons file under its pointer, and `git log -p CLAUDE.md` has the rest. **The rule going forward, now written into Tier 1: a new lesson on an existing rule goes in the lessons file; CLAUDE.md gets the rule and the pointer.** Instituted after the 2026-09-02 quick-wins batch's token post-mortem named the per-turn baseline as the largest single cost. Process/meta only; no app code, no schema, no build-phase change. |
| v1.30 | 2026-09-03 | **Home v1 — the Signal fold spec registered (CUL-695 direction F3); Home v2 fed into the Conference Spike.** The PM re-raised the Signal complaint from dogfooding ("every time I open the app I'm beat w/ a massive message"; the spouse: Home is "boring") and phased the answer: v1 = the minimize/expand for all accounts, built now; v2 = the Home re-imagination (the existing spike project). This session ran **four isolated persona interviews** (Jordan, Sam, Dr. Chen, the Designer) against the screen as built plus a fresh research sweep (`docs/research/2026-09-home-insight-fold-and-freshness-patterns.md`), and the lenses converged on one ruling set without a PM tie-break: an explicit `Keep it compact` control in the expanded state, never a swipe; persistence per pet per finding; re-open on what the record did (a new episode, a tier change), never on what the calendar did; and — the recorded Designer↔Dr. Chen conflict — **standing safety cards fold to a sticky strip that keeps the ask and the last-episode date; acute cards never.** Dr. Chen moved from "stated action only" once the owners' evidence was in front of him (an owner will state a false "Booked" to get their screen back). New Read-These row for `docs/nyx-signal-fold-requirements.md` v1.0; mock round 1 published; build issues CUL-784/785 + v1.1 CUL-786/787 filed under CUL-695. **Process note worth keeping:** a persona conflict recorded as "PM decision needed" can often be closed by re-interviewing the lenses in isolation against the built screen and the other lenses' evidence — both moved here — which leaves the PM a ratification instead of a tie-break. No app code, no schema, no build-phase change. |
