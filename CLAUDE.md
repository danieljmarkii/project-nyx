# Project Nyx — Claude Code Session Guide
**Version:** 1.27 | Last Updated: 2026-07-25

---

## Status

**Canonical current status lives in [`STATUS.md`](./STATUS.md)** (repo root). That high-churn file is the "where are we?" answer — current phase, parallel track, blocking open questions, open PM action items, runtime in use, recent sessions. It was moved out of CLAUDE.md (2026-05-31, v1.20) so this operating manual stays stable and the volatile state has one scannable home. Update `STATUS.md` inline at session end, and any time these change mid-session.

**At a glance:** Step 10 — AI Signal (`generate-signal`); B-045 Steps 1–3 built/merged (PRs #72–#75). Step 9 (vet report) now has a build-ready requirements spec + 10-PR plan (`docs/nyx-vet-report-requirements.md`), which reshapes the old PDF-library blocker to HTML-first (pending PM ratification); the spec locks after a real-vet R1/R2 pass. See `STATUS.md` for the rest.

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
| `docs/nyx-technical-spec-v1_0.md` | 🌱 _Living (header stale — needs a refresh pass; body partly maintained)._ Every session. Stack, architecture decisions, MVP acceptance criteria, build sequence. Cross-check resolved items against STATUS.md / Open Questions before trusting the "open questions" + design-token sections. |
| `docs/nyx-schema-v1_0.sql` | 🧊 _FROZEN snapshot — NOT the live schema._ **Canonical schema = `supabase/migrations/` (001–037+)** or the Supabase MCP `list_tables`; trust those, not this file (it documents ~9 of ~21 tables and inverts `food_items` ownership). The reference queries at the bottom are still useful. |
| `docs/nyx-design-principles-v1_0.md` | 🌱 _Living — current (the "1.0" label undersells it)._ Any session touching UI, copy, interaction, or notifications. Seven principles govern every screen. |
| `docs/personas.md` | Every session. Full persona definitions, the **persona routing table**, and the persona/subagent/skill model. CLAUDE.md carries only the roster + always-on rules. |
| `docs/nyx-research-v1_0.md` | 🧊 _FROZEN artifact (dated evidence base — do not version-bump)._ When making product decisions about scope, features, or user behavior. Market data lives here; persona defs are superseded by `personas.md`. |
| `docs/food-library-redesign-requirements.md` | Any session touching food entry, the meal log flow, the food library/picker, or AI-driven extraction of food data. Output of the May 2026 photo-library research session. |
| `docs/nyx-onboarding-requirements.md` | Any session touching onboarding, sign-up / auth, account creation, or the pet-setup flow. Build-ready spec for the app-store-readiness onboarding revamp (B-251). |
| `docs/nyx-competitive-landscape-v1_0.md` | 🧊 _FROZEN — superseded by `docs/nyx-competitive-landscape-refresh-2026-06.md` (read that instead)._ When evaluating feature positioning or vet-facing strategy. |
| `docs/backlog.md` | When the PM asks to `view backlog` / `show backlog` — **that** is the whole-file read. The session-start scan is **not**: it wants the handful of rows whose **Blocks** column matches the Current Phase, so `grep` for them (`grep -n "^| B-.*Step 10" docs/backlog.md`, or the phase/track you're on) instead of reading 453 KB — one row per line makes the file grep-shaped by construction. Reading it whole at every kickoff costs more than most sessions' actual work. See the Backlog Protocol section below. |
| `docs/research/README.md` | When making product decisions in a domain a prior research brief covers (feeding behavior, symptom correlation windows, etc.). The README indexes all briefs; read the relevant brief directly before designing in that domain. |
| `docs/culprit-rename-requirements.md` | Any session executing the Nyx → Culprit name rebrand (B-274) or touching a user-facing brand string. The string-level what-changes — the brand-vs-pet-name-vs-infra split that keeps it from being a search-and-replace. Pairs with `docs/culprit-icon-brand-direction.md` (the icon/visual half, B-275) for the combined "name + icon" brand pass. |
| `docs/culprit-in-app-brand-requirements.md` | Any session building the in-app brand-alignment PRs (N1–N7: night tokens, `CulpritMark`, the Landing hero, the Whorl loading system + night moment, the Signal card ground, calendar v3, the Home briefing) or touching any night-ground surface. Build-ready spec distilled from the four `docs/brand/` review rounds (B-284); carries the carve rule, the register rule, the no-metaphor rule, verbatim copy, and the two open gates (D8 on-device ground call; D9 Tier-2 §3 edit). |
| `docs/nyx-per-account-food-library-requirements.md` | Any session building B-354 (per-account food/med library re-scope), B-005 (archive), the dedup track (B-009/B-018), or touching `food_items`/`medication_items` RLS, the food cache, or the catalog legal language. The requirements + PR plan for de-globalizing the catalog (2026-07-16). |
| `docs/monetization-and-throttling-requirements.md` | Any session building Track-2 monetization infrastructure (the `app_config` flags, the `ai_usage` throttles, flag-aware client states, the paywall-mock flag-off) or Track-3 Premium (RevenueCat/`entitlements`, the B-332 protein prerequisite, the paywall un-mock, the extraction gate, the 4+-pet gate) — or touching any gate/cap/entitlement surface. The build contract for the ratified strategy (D-M1–D-M8): PR-by-PR plans, caps table, typed response contract, copy pack, QA state matrix, and the numbered PM offline actions. Pairs with `docs/monetization-and-ai-gating-strategy.md` (the decision record — the *why*). |
| `docs/nyx-filter-ux-requirements.md` | Any session adding or changing a filter, scope, lens, or range control over a list/chart/report. The app-wide pattern language (ChipGroup vs visible lens chips vs segmented vs `ScopeMenu`), the per-surface inventory + verdicts, the two live decisions (D1 FoodPicker / D2 Calendar-lens trigger → B-405), and the conditional F1–F3 PR plan. |
| `docs/nyx-widget-requirements.md` | Any session building the Home Screen Widget track (PRs W1–W6: the B-289 `logged_via` migration, the SDK 56/57 upgrade, the B-290 App-Group write path, App Intents, the widget itself, the TestFlight cut) — or touching any out-of-app capture surface, App Intent, or the App Group snapshot/inbox. v1.0 build-ready spec (2026-07-24, PM-ratified after three mock rounds): decision record D1–D9 (incl. the no-garbage rule — the widget only logs what it can name; widget ships **free**, amending D-M1's widget bullet; native targets ratified via `expo-widgets`), the two jobs, the design-locked round-3 states, the §4.1 spike checklist, and the W1–W6 PR plan. Pairs with `docs/culprit-widget-mockups.html` (design-locked mock) + `docs/logging-capture-discovery.md` (the evidence). |
| `docs/nyx-ask-requirements.md` | Any session building the Ask track (B-228, PRs A1–A7: the config-seed migration, the allowlist flag primitive, the `ask` Edge Function + deterministic tool layer, the client surface, the vet-visit rundown, the copy/safety pass) — or touching the Ask surface, its caps, the experimental-flag allowlist convention, or any LLM-boundary question. v2.1 build-ready spec (2026-07-18; supersedes rev 1 with an explicit §0 record; no PM blockers): decision record D1–D7, the §6 scoped-retrieval boundary (D2 ratified expanded — notes + photos in, transform-only, one-read-path), the G-guardrail spine (incl. G5 Timeline-parity, extended to reads), the A1–A8 plan with per-session kickoff prompts. Pairs with `docs/ask-mockups.html` (the design-locked mock) + `docs/research/2026-07-ask-ai-ux-landscape.md` (the evidence). |
| `docs/nyx-vet-files-requirements.md` | Any session building the Vet Files track (B-478, PRs VF-0–VF-6: the B-248/B-466 hardening gate, the `vet_documents` migration + `nyx-vet-documents` bucket, the library/capture/detail surfaces) — or touching `vet_visits`, `vet_visit_attachments`, the `nyx-vet-attachments` bucket, or any vet-document surface. 🌱 **v1.0 BUILD-READY** (2026-07-26) — every decision closed: G1–G3 PM-ruled (new `vet_documents` table + `nyx-vet-documents` bucket; PDFs in v1 store-and-view; pet-profile entry) and D11–D14 PM-ruled after two mock rounds + Jordan/Sam persona reviews (chips out; search out → B-479; multi-pet via duplicate-on-add; report paperclip out → B-480, explicitly not D8-gated). Round-2.1 mock (`docs/culprit-vet-files-mockups.html`) is the design authority for VF-2–VF-4. **Only G4 (priority) open — `Later` until promoted; VF-0 ships any time on B-248/B-466's own `Now` mandate.** Carries the report-window protection rule (D7: an uploaded document never mints or re-dates a `vet_visits` row) and registers the Phase-2 AI-over-documents gate (D8: D2-class PM + T&S ruling, Ask §6 mirror). |
| `docs/nyx-diet-trial-requirements.md` | Any session building the diet-trial lifecycle (B-417, PRs 1–7: migration 040 + `diet_trial_foods`, the local mirror, the start-a-trial modal, the trial card v2, off-diet exposure detection, the completion milestone, the vet-report render) — or touching `diet_trials`, trial coverage/adherence, or any trial-aware surface. **v1.0 — ALL SEVEN PRs SHIPPED (#450–#481); pre-ship review 2026-07-27 (five chairs) → rulings R1–R8 + the ship-gate buckets live in `docs/diet-trial-preship-review-2026-07.md` (read it before touching any trial surface); two holds are live: the `generate-report` redeploy (B-494 + B-529–B-532 + a fresh cold read) and the TestFlight cut (R1: B-533/B-474 + B-534–B-538); mock round 5 is the design authority for the card's viability states.** The wedge feature had **no write path**: `diet_trials` shipped in migration 001, **seven** surfaces read it, production holds **zero rows**, and the vet report's own first question ("Is this diet trial working?") has never rendered with real data. Reviewed against `docs/research/2026-07-diet-trial-competitive-landscape.md` + a 5-lane code audit; session record + all six PM rulings in **`docs/diet-trial-requirements-review-2026-07.md`**. Three findings that bind any session here: **(1)** the app may **never** render "No off-diet foods logged" at any coverage — G2 was reframed from a threshold to a rule (§5.2); **(2)** there is **one** off-diet predicate, `lib/dietTrial.ts`, shared by client / `generate-report` / `ask` — a third, contradictory definition is already shipped in `report.ts:2246` and must be re-based (§5.3, §7); **(3)** PR 1 is the gate the whole track queues behind and carries ~9 schema decisions, all free at zero live rows (§3). D1/D2/D3 PM-ratified; **every gate (G1/G2/G3/§0.2) and conflict (C1–C6) ruled 2026-07-25** — outcomes are written throughout the spec and recorded in the review doc's §0. Note two PM overrides of the team's recommendation: **C3** (detect the oral route in v1) and **C5** (no owner-scored severity — severity comes from logged events, and §7 discloses logging density instead). Amendments A-2/A-3 remain open. Read §0 first. **(4) `status = 'active'` IS NOT "the pet is on this diet today" (B-422, closed 2026-07-29).** Nothing auto-completes a trial and §4.3's milestone needs an owner tap, so stale-active is the *steady state*. There is **one** staleness definition — `isTrialRunning` / `trialEffectiveEndDayIndex` in `lib/dietTrial.ts` (`start + target - 1 + TRIAL_OVERRUN_GRACE_DAYS`, 56d, sized to ACVIM's ≥12-week GI ceiling) — and any new surface that acts on a trial reads it rather than the column. **The rule that cost an `adversarial-reviewer` FAIL to learn: the effective end bounds BELIEF and ONE DENOMINATOR, and never bounds EVIDENCE.** Applying it to the evidence window (`buildTrialContext.endDayIndex`, the card's SQL reads) deletes logged findings to make a denominator behave, and every such deletion moved toward reassurance — a cat refusing 38 of 38 bowls went unread and the card called the record clean over her; an oral-route dose fell out and turned a withheld claim into an affirmative one; a scoped report lost its whole trial block. So: `isTrialRunning` for belief, `computeTrialFacts`'s coverage tail clip for the one denominator (`max(targetEnd, lastMealDay)`, non-treat anchor, capped at the effective end), and every other loop bounds on an evidence end the grace never touches. **A second round found the same mistake one layer out, in the seam the module cannot see:** `generate-report` re-used the *clipped* `facts.range` as an evidence bound, so an off-diet feeding was counted and un-itemised — and emptying Appendix C unlocked an affirmative "every one of the N feedings matched" the report had never printed. A consumer that needs the rows the counts were computed over reads **`TrialFacts.exposureRange`**, never `range` (which is the coverage window, clipped at both ends). **A third round found five more consumers doing it and one design flaw**, so the test is written down where it can be applied: *a field is an EVIDENCE bound if losing a row changes what the report SAYS, and `range*` may only ever appear next to the word "coverage"* — a recent weigh-in was deleting the weight-loss fact from the B-494 safety band, and that band was dating 176 days of refusals inside a 98-day window. The coverage tail clip also closes at the **target end, full stop**: an evidence anchor (`max(targetEnd, lastMealDay)`) let ONE logged meal stand for "the trial ran this long", which both rescued a 5-of-28-days record above the floor and pushed a perfect 28/28 below it. `target_duration_days` is the only authority on a trial's length, and §4.3's milestone is how an owner moves it. A fourth round priced the clip's own cost — a complete window followed by a 145-day blackout read as a clean, complete record — and the resolution is DISCLOSURE beside the verdict, never a revert: the C5 logging-density line spans the *evidence* window so silence renders as a zero back half, and the card's counterpart sentence is B-592 (load-bearing, not polish). Two invariants carry property tests: `daysLogged <= daysElapsed` and `endDayIndex >= startDayIndex`. And the report's trial *selection* stays on `status`: dropping an un-ended trial drops the `trial_diet_refusal` safety flag with it, which is a **B-494 inversion** — gate the anchor, never gate the disclosure (residual → B-594). Two more bind: an overrun trial is expressed as one that **ended on its effective end**, so the existing ended-trial graces govern its afterlife and no third window is created; and the **card keeps it forever** — `status` remains the lifecycle authority for the one-active-trial index, the card's presence, the completion sheet and the start-modal takeover, because that card is the only way an owner can ever end a trial. |
| `docs/nyx-medication-dose-duration-requirements.md` | Any session building B-614 (dose-denominated medication course length, PRs 1–4: migration 049, the `dosesTowardTarget` predicate, the entry unit chips, the "Dose X of Y" card) — or touching `medications.target_duration_*`, regimen entry, or the regimen card's progress line. 🌱 **v1.0 BUILD-READY** (2026-07-31; every decision closed — D1 count = therapy-delivered `given + partial`, PM-ratified; D3 no pace concept anywhere in v1; D7 reaching the target never renders completion/stop language, non-negotiable). One count predicate shared by every consumer (the diet-trial §5.3 lesson, applied preemptively). Pairs with `docs/sessions/2026-07-30-medication-duration-doses-discussion.md` (the convening + the Dr. Chen/Sam conflict record) and B-441 (the days-path day-math fix, own session). |

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
| **Product Owner / Backlog Steward** | Keeps `docs/backlog.md` honest and well-ordered (distinct from PM, who owns decisions). |
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
- **Single-select chips:** closed-set single-select pickers (form / route / format, etc.) use the wrapping, accessible `components/ui/ChipGroup` — never a horizontal `ScrollView` of chips. A silent h-scroll hides options off-screen, so owners pick from only what they can see (B-146). Horizontal scrolling is for browsing media/recents only, and always carries a visible "there's more" cue (paging dots or an edge-fade), never a bare hidden-overflow row.
- **Filters & scopes (the lens shapes — 2026-07-24, `docs/nyx-filter-ux-requirements.md`):** a *lens over a list* picks its shape by set size, not one-shape-fits-all. ≤5 short always-visible options on a hot path → visible `ChipGroup` chips; 2–3 fixed equal windows → segmented control; a long (≳5), growable, or long-labelled set — or a scarce header — → `components/ui/ScopeMenu` (pill + bottom sheet; the History pattern, #421). Every filter shows a visible active cue when non-default (ScopeMenu's tint rule), defaults are explicit options, and an option that expands dependent inline UI stays a visible chip. The B-146 edge-fade carve-out History once had is deleted — no hidden-overflow option row anywhere, ever.
- **Loading indicators:** use `components/brand/WhorlSpinner` (B-284 N3), never `ActivityIndicator` — the one exception is `components/ui/PrimaryButton`'s own loading prop. Pick the tier by expected duration: **skeletons** (`components/ui/Skeleton`) for content-shaped waits under ~1s; **`WhorlSpinner`** (`sm` inline / `md` in-place, `ground="day"`; `tint={color}` on a coloured/dark button where a teal whorl would vanish) for ~1–10s; the **`NightMoment`** (`components/brand/NightMoment`) only for a full-screen wait that is all three of blocking + expected >~2s + real work on the pet's behalf (cold start, vet-report build, photo extraction). Every animated loader defines a reduced-motion static frame and pauses on app blur (`hooks/useReducedMotion` + `hooks/useAppActive`).
- **Widget layouts (`widgets/*.tsx`, 2026-07-24, widget PR W5):** a `'widget'`-directive function is **not** a React component and does **not** run in the app process — babel-preset-expo stringifies it and the iOS widget extension evaluates that string in a bare JavaScriptCore context whose only globals are `@expo/ui/swift-ui`, its modifiers, and a JSX shim. So: **no imports are in scope at runtime** (a theme token, a helper, anything module-scope, is a ReferenceError on device — inline it inside the function), **no filesystem and no network** (a press returns a props patch; capture goes through the outbox in `lib/widgetBridge.ts`, never a direct write), and a **dynamic child list must be passed as one flat array expression** (the native child walker drops nested arrays). Every widget layout gets a test that evaluates its emitted string in a stand-in of that context (`widgets/CulpritWidget.test.ts`) — that eval, not review, is what keeps the constraint honest.
- **New local SQLite tables (2026-07-26, B-424):** a table's DDL goes in a **schema constant** — `BASE_SCHEMA_SQL` (`lib/localSchema.ts`), `MEDICATION_SCHEMA_SQL`, or `DIET_TRIAL_SCHEMA_SQL` — never a bare inline `execAsync`, and the table goes in **`LOCAL_WIPE_TABLES`** (children before parents). Both are now enforced: `hydration.test.ts` builds a real `node:sqlite` DB from those constants and derives the wipe set from `sqlite_master`, then scans the app source for a `CREATE TABLE` the constants don't produce. A table that skips either step **fails the build**, which is the point — the wipe is what stops a shared device leaking the prior account's health record, and the list still fails *open* at runtime. An exemption is a Trust & Safety decision: name it in `NOT_WIPED_ON_SIGN_OUT` with the rationale, never by omission. Same rule for account state outside SQLite (AsyncStorage keys, in-memory caches, the App Group) — it goes in `wipeLocalSession`.
- **Canonical keys — Class A vs Class B (2026-07-24, B-414 ruling; full text `docs/nyx-multi-protein-requirements.md` §10 D3a + the `lib/protein.ts` header):** when two values may be merged onto one key, the line is *does justifying the merge require knowing anything about animals?* **Class A** (orthographic/artifact — casing, padding, boundary punctuation, form-qualifier spellings) is permitted **always, on read, retroactively**; leaving these split is pure data loss. **Class B** (semantic — two different tokens asserted to be the same animal) is **write-path only, never retroactive**; a wrong call pools two species across the whole record invisibly. Every canonicalizer is **convergent** (`f(f(x)) === f(x)`), enforced by a cross-product **property test** — an example list is what let B-414 ship a `chicken -` key under a docstring claiming idempotence. Each Class-A re-key ships with a before/after affected-row count.
- **Imports:** Absolute imports from project root. No relative `../../` chains longer than one level.
- **State:** Zustand for global state. Local `useState` for component-only state. No prop drilling beyond two levels.
- **Error handling:** Every async function has explicit error handling. No silent failures in sync or API calls.
- **Comments:** Comment the why, not the what. Schema decisions and architectural rationale warrant comments. Obvious code does not.
- **Testing:** Unit tests for all store logic and Edge Functions. `jest` + `@testing-library/react-native` for component tests. Test files co-located as `ComponentName.test.tsx`. No E2E tests in MVP scope.

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
| Resend SMTP credentials (`smtp.resend.com` / user `resend` / password = a Resend API key `re_…`) | Supabase Dashboard → Authentication → Emails → **SMTP Settings** (encrypted at rest by Supabase) — **NOT in repo, not in EAS** | Supabase Auth: every transactional email (signup confirmation, password recovery once B-280 ships, magic links, invites) | ✓ — provisioned 2026-07-25; **verified by a live send** (`POST /auth/v1/signup` → HTTP 200 + `confirmation_sent_at`, delivered to the PM's inbox) | Server-only; the app never sees it. Sending domain `getculprit.app` is **verified** in Resend (DKIM + SPF MX + SPF TXT; DMARC `p=none` added as a bonus record, deliberately not tightened until there is sending history). Sender `support@getculprit.app` / name `Culprit` — PM-ratified 2026-07-25 over the spec's original `noreply@` (`docs/culprit-website-requirements.md` §5.2 carries the rationale + the accepted cost: replies land in the App Review contact inbox). Rotate by minting a new API key in Resend and re-pasting into Supabase — Supabase never displays the stored value back, so a bad paste is invisible; re-verify with a live send, never by eye. |
| `EXPO_TOKEN` | Codespace env (optional) | `eas update`, `eas build` CLI | ✗ — interactive `eas login` works fine for now | Only needed if we automate EAS publishing from CI. For manual `eas update` from Codespace, `eas login` once per Codespace is sufficient. |
| Apple Developer account | EAS / App Store Connect | iOS TestFlight / standalone builds | ✓ — enrolled 2026-06-07; first TestFlight build installed | Enables TestFlight + standalone iOS builds. With a real build in place, `eas update --branch preview` now reaches it OTA (Runtime A). Per-push on-device testing still uses Runtime B (Metro + tunnel). |
| `SUPABASE_ACCESS_TOKEN` (Supabase account PAT, `sbp_…`) | Codespace secret / shell env — **NOT in repo** | `scripts/deploy-edge.sh <name> --deploy` (test → bundle → verify → upload in one command) | ✓ — provisioned 2026-07-27 as a Codespace secret scoped to `project-nyx`; old `nyx-cli-deploy` PAT revoked (B-485). **Not present in cloud-session env** — large-function deploys run from the Codespace; the MCP inline path stays the small-function fallback. | Server-only; never commit. **Preferred deploy path since 2026-07-26** (B-455). The MCP `deploy_edge_function` fallback still works without a token but takes the bundle as an inline parameter, so an agent must reproduce it byte-for-byte — unsafe past a few tens of KB, and `generate-report` is 240 KB. Mint at dashboard → Account → Access Tokens; revoke there too. The upload path's first live run (the pending `generate-signal` redeploy) is its verification. |

**Columns:**
- **Location** — exact mechanism (`.env.local`, `supabase secrets`, EAS env, EAS Secrets). If it lives in more than one place, list both.
- **Provisioned?** — ✓ if set in that location and known working; ✗ or "needed" if not yet. When ✗, add a PM Action Item.
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
- Which build step or sub-step this advances
- Any schema changes made
- Any open questions this raises or resolves
- Manual test steps (what to verify via QR code before merging)

**Rules:**
- PRs required before merging to `main`. No direct commits to `main`.
- **CI runs on every PR (B-390, `.github/workflows/ci.yml`, shipped 2026-07-25 via #440).** Two jobs: `App (typecheck + jest)` (`npm ci` → `tsc --noEmit` → `jest --ci`) and `Edge Functions (deno test)` (`deno test` over `supabase/functions/` — the suites `jest.config.js` ignores, and the **only** type check covering that path since `tsconfig.json` excludes it). This does not replace the pre-push hook or the DoD — it makes them non-optional. Three standing facts about the workflow: the Deno job runs `npm ci` **on purpose** (its type-check resolves a transitive `@types/node` out of `node_modules`); the Deno test step carries **`--allow-read=supabase/functions`**, which is **load-bearing, not cruft** — `deno test` grants no filesystem permission by default, and `detectionSoftDelete.test.ts` (B-071) reads `generate-signal/index.ts` to assert every query feeding the detection engine still carries its `.is('deleted_at', null)` filter, so stripping the flag turns that guard into a `NotCapable` failure (the grant is read-only and cannot re-open the network `--cached-only` closes); and both jobs must stay green — do not "fix" a red run by weakening the check (`--no-check`, `continue-on-error`, dropping a suite) without saying so in the PR. Actions are **SHA-pinned**; bump the SHA and its trailing version comment together. _The gate is live (2026-07-25):_ the `main` ruleset is **Active** with both checks required, an **empty bypass list** (nobody bypasses, including the owner), required PR + 0 approvals, require-branches-up-to-date, block-force-pushes and restrict-deletions. A red check now blocks the merge, so a green CI run is a precondition of shipping, not a report.
- Schema changes always get their own PR — never bundle a schema change with UI work.
- Squash merge to keep `main` history clean and linear.
- Do not merge a PR if QA criteria for the current build step are not yet met.
- **One PR per session.** The end-of-session `docs/sessions/` record + STATUS.md update (and any CLAUDE.md / doc edits) ride in the session's *existing* work PR — committed to its branch before merge — not a separate "record the merge" PR afterward. Write the session record's outcome as `shipped via #<n>` (the PR number is assigned at creation, drafts included), never as `merged to main (#<n>)` — the post-merge phrasing is what forces the second PR. **Exception:** if the work PR was already merged mid-session, the status update is a small standalone follow-up. This is orthogonal to the schema-isolation rule above — STATUS.md is not schema. (Mechanics in `/wrap`.)

**PR check-ins — arm at most one, never a standing chain (instituted 2026-07-25).** A session that opens a PR may schedule a self check-in to catch what webhooks miss. Bound it:

- **Arm at most one check-in, ~90 minutes out, and only while sibling sessions are actively landing on `main`.** If nothing is in flight, arm nothing — there is no event to catch.
- **Stop after one check-in that finds nothing.** Do not re-arm on a no-op. A chain that re-arms unconditionally can only terminate on merge, and PRs here sit open for weeks.
- **Never arm one at `/wrap`**, and never leave one armed overnight. The PM merges by hand, in the morning; `main` does not move while they sleep, so an overnight check-in is guaranteed to find nothing.
- **Never poll on an interval shorter than ~90 minutes.** An hourly cadence lands past the prompt-cache TTL, so every wake re-sends the session's entire context at full price to learn nothing.

Measured before this rule existed: **102 check-ins in three weeks; 3 of 11 on the 2026-07-24 overnight did any work, and all three were base-drift repair** (merging `main` after a sibling PR landed, resolving the `STATUS.md` conflict). That is the *only* thing this mechanism has ever earned — so the real fix was removing the drift, not scheduling cleanup for it. See `docs/sessions/README.md`.

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

Before asking the three questions, surface the canonical state from **`STATUS.md`** in the opening message — Current Phase, parallel-track status, blocking Open Questions, and any open PM Action Items, i.e. everything the PM would need to recap. This lets the PM answer "no change" and move directly into work instead of recapping.

Then read the relevant docs for the confirmed build step before writing any code.

**Shortcut:** run `/kickoff` to auto-generate this orientation — it reads `STATUS.md`, surfaces any backlog item that blocks the current Phase, and proposes a concrete first task. It's the mirror of `/wrap`.

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
- [ ] PM Action Items consolidated for any work only the PM can finish
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
- **Runtime A** (TestFlight via `eas update` OTA — a deliberate, separate "cut a new build" session, NOT per-push): `git fetch` → `git checkout <branch>` → `git pull --ff-only` → `eas update --branch preview --message "..."`. ✅ Live since 2026-06-07 — Apple enrollment is done, a TestFlight build is installed, and `eas update --branch preview` now reaches it OTA (matching channel + `runtimeVersion`; see STATUS.md → Runtime in Use). The PM kicks this off **by hand, in its own session**, when changes are significant enough to warrant a new TestFlight version — it is not the default handoff after every push.

**Default to Runtime B in the handoff** — it's the per-push, test-one-PR path. Only emit Runtime A's `eas update` block when the session's explicit goal is cutting a new TestFlight build. Emit only the runtime that matches the session; pull the exact commands + their explanations from the runbook.

**The one non-negotiable git rule:** always `git checkout <the handoff branch>` *before* pulling. A bare `git pull` from a different branch triggers `fatal: Need to specify how to reconcile divergent branches`; the fix is never "merge vs rebase," it's switching to the right branch. The one-time `git config --global pull.ff only` kills that prompt for good.

**When git misbehaves** (divergent-branches prompt, "local changes would be overwritten," `--ff-only` failing after a squash-merge, detached HEAD, accidental commit on `main`): see **`docs/git-first-aid.md`** — a symptom→exact-command guide keyed by the literal error message. Point the PM there rather than improvising recovery commands.

**Before pushing**, if the diff touches a store, Edge Function, or shared utility, run:
```bash
npm test
```
Confirms automated tests pass locally. Do not push a chunk-completing PR with failing or skipped tests — fix or mark `tests: N/A` in the DoD with the Engineer's exemption rationale.

**Backend deploys (Edge Functions + migrations) run from the cloud session via the Supabase MCP — no PM action item.** The recurring "paste this SQL into the SQL Editor / paste this function into the dashboard" hand-offs are retired (B-082, 2026-06-20). The full procedure — project ref, the `scripts/deploy-edge.sh` bundle step, the `deploy_edge_function` / `apply_migration` calls, verification, and the security posture — lives in **`docs/edge-deploy-runbook.md`**. Quick reference:

**When an Edge Function is included:** bundle with `scripts/deploy-edge.sh <function-name>` (esbuild → one self-contained, verified ESM file), then deploy that bundle via the Supabase MCP `deploy_edge_function` (`project_id` `aigchluqluzuhtbfllgh`; **preserve the function's existing `verify_jwt`** — all 5 current functions are `true`; check `list_edge_functions` for a new one). Verify: `list_edge_functions` shows the version bump + `ACTIVE`, read-back sha256 matches, and a JWT'd boot smoke-test with a bogus pet id returns a clean 4xx (not `WORKER_ERROR`). No CLI, no token. _Dashboard fallback (only if the MCP is unavailable):_ Supabase Dashboard → Edge Functions → paste the bundle as `index.ts` → Deploy.

**When a Supabase migration is included:** apply it via the Supabase MCP `apply_migration` (`name` = the snake_case migration name, `query` = the SQL), then run `get_advisors` (security + performance) to catch a missing RLS policy / unindexed FK. `apply_migration` both applies AND records the migration in history (unlike a dashboard paste). **This changes nothing about migration discipline:** schema-PR isolation still holds (a migration ships in its own PR), the Migration Safety Pre-flight is still mandatory, and `apply_migration` is a **live write** — apply additive migrations with the schema PR, and apply a migration a code change depends on *before* deploying that code. _Dashboard fallback (only if the MCP is unavailable):_ run `supabase/migrations/<filename>.sql` in the SQL Editor (dashboard → SQL Editor → New query → paste → Run).

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
- <tracks that are independent — disjoint files, no logical dependency — and can run concurrently as separate sessions/branches; name the one shared-file collision to expect, e.g. STATUS.md at wrap>
- <a single decision that unblocks several tracks; batchable work; which items are ready-to-run vs. gated on a PM/expert call>
```

Rules:
- The recommended prompt always points at the next item in the **Build Sequence** unless a blocking open question makes that impossible — in which case the prompt is "resolve open question X."
- Each prompt is self-contained: it names the file, step number, or doc the next session should read first.
- If a PM Action Item from this session is a prerequisite (e.g. "deploy function X first"), say so explicitly in the prompt.

### Session End — Automatic Summary

Produce this summary automatically at the end of every session without being asked. If the session ends abruptly, produce a partial summary covering what was completed.

**Shortcut:** run `/wrap` to produce the whole close-out deterministically — it runs the DoD, updates `STATUS.md` inline (and CLAUDE.md if a decision changed the manual), emits this summary and the Dev Handoff, and always finishes with a paste-ready Next Session Kickoff prompt. Use it every session so the wrap-up is identical each time.

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
[Consolidated checklist of every action only the PM can take, deduplicated across the session. Format: `- [ ] <action> — <why it's needed>`. Examples: run migration X in Supabase SQL Editor; deploy Edge Function Y; provision secret Z in EAS; create bucket via dashboard; reply to open question W. If there are none, write "None."]

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

Three tiers. Different rules for each. (For "log this for the future" items, see the **Backlog Protocol** section below — those go in `docs/backlog.md`, not in any of these tiers.)

**State-file hygiene — the volatile files must net out, not only grow (instituted 2026-07-19 retro).** `STATUS.md`, `docs/backlog.md`, and the Open PM Action Items / Open Questions lists are *working state*, not archives — `docs/sessions/`, git history and PR bodies are the archive. (`docs/sessions/` is the one deliberately append-only exception: one file per session, never edited, never pruned, outside every size budget. It is the archive, so it is exempt from the rule that governs the working state.) Every prepend is paid for by a delete: completed items are **removed** (not left checked forever), resolved/aged rows are archived, and the backlog's "keep the row, mark Done" convention means *keep it until the periodic archive sweep*, not *keep it for all time*. Enforced at `/wrap` (STATUS.md size budgets — prune while you prepend) and audited at the periodic retro (`docs/personas.md` § Periodic Process Retro, check #4). The signal that a file needs pruning: reading it costs more than the work it describes.

**Doc versioning — living vs. frozen (instituted 2026-07-19 retro).** *Living references* (`nyx-technical-spec`, `nyx-schema`, `nyx-design-principles`, the `*-requirements.md` specs) carry their version in the **header** and bump the `Last Updated` date on any material edit — never bake the version into the *filename* (a filename version never gets bumped; that is exactly why the `*-v1_0` docs froze). *Frozen point-in-time artifacts* (research dossiers, dated `docs/research/` briefs, strategy records, competitive snapshots) are **not** version-bumped — a date stamp is honest, and editing them in place destroys the "what we knew when" record. The Read-These table tags each foundational doc 🌱 living / 🧊 frozen so a session knows which ones are supposed to track reality.

**Tier 1: `CLAUDE.md`**
Update immediately when a decision is made. Do not wait for the session summary. This file must always reflect the current state of the project, not the state at session start. When you append an anti-pattern, resolve an open question, or establish a new convention, write it here in the moment.

**Tier 2: `/docs/` files** (`technical-spec.md`, `schema.sql`, `design-principles.md`, etc.)
These are versioned product artifacts. Do not edit them unilaterally. When something in the codebase or a session decision should update a doc, flag the specific proposed edit in the session summary and wait for PM confirmation before writing. Use this format:

> Proposed edit to `technical-spec.md`, Open Engineering Questions table: Mark "Minimum Expo SDK version" as resolved. Value: SDK 52. Confirmed this session. Awaiting PM approval to write.

**Tier 3: Project Brief in Claude.ai project instructions**
Claude Code cannot edit this directly. Flag when it needs updating in the session summary under "Documentation Updates." The PM applies changes manually using the protocol defined in the brief itself.

---

## Backlog Protocol

The backlog lives at `docs/backlog.md`. It is the destination for anything that would otherwise be said as "let's log that for the future" — out-of-scope features, deferred refactors, pre-prod requirements, decisions deferred past the current phase.

**When to add a row:** any time you're about to say "we should do X later," "noted for future," "deferring this," or the PM says any of those phrases. Write the row immediately, in-session, before continuing the conversation. Do not batch-add at session end and do not wait for PM approval — adding a backlog row is reversible and cheap; losing the item is not.

**Row format** (see `docs/backlog.md` for the live table):

| Field | Notes |
|---|---|
| ID | Sequential `B-NNN`. Never reuse. |
| Title | Short, scannable. |
| Why | One line. Enough context that future-you can re-evaluate without re-deriving. |
| Priority | `Now` / `Next` / `Later` (see file for definitions) |
| Added | ISO date |
| Blocks | The build step, phase, or condition that should trigger this. `—` if none. |
| Status | `Open` until done. When closing, leave the row and mark `Done — <date>` with resolving PR/session. |

**`view backlog` command:** when the PM types `view backlog`, `show backlog`, `what's in the backlog`, or any natural-language equivalent, read `docs/backlog.md` and present it grouped by priority. Surface anything whose **Blocks** column matches the Current Phase at the top. Do not invoke this proactively at every session start — only on request, or when a session-start scan reveals a backlog item that blocks the Current Phase.

**Distinction from Open Questions:** Open Questions are *unresolved decisions* that need PM input to unblock work. Backlog items are *resolved deferrals* — we know what to do, just not now. If an item needs a decision, it goes in Open Questions; if it needs execution at a later time, it goes in the backlog.

---

## Open Questions

Do not make silent assumptions about these. Surface the relevant question when you reach the step that requires an answer.

When a question is resolved, mark it resolved with the decision and date rather than deleting the row. The resolution is part of the record.

If a blocking question remains unanswered after one full session, document a provisional decision and flag it for PM confirmation rather than stalling indefinitely.

**Stale question triage.** Any question with status `Open` across **three or more sessions** gets a forced re-evaluation at the next session start: (a) still relevant — keep open; (b) no longer relevant — mark resolved with rationale; (c) ready for a provisional decision — write one and flag for PM confirmation; (d) belongs in the backlog instead — move it to `docs/backlog.md` and remove from this table. Do not let questions sit untouched indefinitely; an aged-out question is usually one of these four things, not actually "still open."

### Open

_Resolved questions are archived in **[`docs/decisions-archive.md`](docs/decisions-archive.md)** — verbatim, nothing condensed. Four resolved rows stay below because their ruling has no other home (see that file's "What stayed behind"). When you resolve a question here, move the row there rather than growing this table._

| Question | Blocks | Status |
|---|---|---|
| **Diet trial (B-417) — the four gates + six conflicts.** G1/D3 (allowed-food set vs. B-351 D6) · G2 (what the app may say about a clean trial) · G3 (duration defaults) · §0.2 (sequencing vs. B-351 slice 4) · C1–C6. Full tee-up with evidence and dissent: `docs/diet-trial-requirements-review-2026-07.md` §3–§4. | B-417 PR 1 onward | **ALL RESOLVED 2026-07-25 (PM, in one sitting) — record in that doc's §0; spec is now v0.97 and PRs 1–2 are build-ready.** **G1 RATIFIED** — both ship, one detection path. **G2 ruled as a RULE, not a threshold** — the negative claim ("no off-diet foods logged") is **deleted from the product at every coverage, on every surface**; positive form about the *record* with the qualifier inline; the exposure count is a floor never a total; two-sided, so no absence-based alarms below the floor either; a floor survives but gates §7.2's interpretability statement. **G3** — numbers stand, keyed on **species × indication**, semantics fixed (skin 56d IS the >90% band, not "the low end"; the GI milestone must never read as permission to stop a diet ACVIM says to continue ≥12 weeks). **§0.2 — option (c)**, merge; the dependency was **soft**, not hard. **C1** render the count under the floor framing · **C2** trial-diet self-contamination is a **trial-level standing fact**, never a per-feeding verdict · **C3 PM OVERRIDE — detect the oral route in v1** (chewable `medication_items.form` + B-156 `paired_event_id` vehicles; zero new schema), *and* ship the day-0 substitution line; B-419 narrows to flavoured non-chewables · **C4 deferred to the mock round**, which must render §7's trial block in ≥2 variants · **C5 REJECTED, and the review corrected** — severity comes from **logged events**, not a subjective score (no severity columns); the panel's argument contradicted Dr. Chen's own persona, Jordan's, and the shipped app-wide `hasSeverity: false`; the attention-decay bias it identified is instead **disclosed** by rendering the symptom trend against logging density · **C6** — name the itemisation at the confirm action (Nyx's first record that judges a *person*). **Still open:** amendments A-2 (`paused` state) and A-3 (mid-trial card state). |
| **Home header's ring-train pulse — keep, drop to dot-breathe only, or go static?** The Landing retired the B-322 ring-train ping (PM-ratified 2026-07-26, Option B of `docs/culprit-landing-hero-mockups.html` — the static whorl ground shipped in its place), but the same ring train still runs on `HomeHeader`'s ~16px mark, where `live` HAS real semantics (a fresh unseen finding, spec §3). The rings' staggered loop restarts are the shape that stutters; the dot-breathe alone is a single continuous loop that sidesteps it. If rings are dead brand-wide, the header cue drops to dot-breathe (a `CulpritMark` change, not a call-site change) and the §3 pulse contract gets a Tier-2 edit. | Home header polish; any future `live` placement | Open — surfaced 2026-07-26 |
| Minimum Expo SDK version? Document immediately after scaffold. | Step 1: Scaffold | Open |
| Push notification provider for nudge system? | Post-MVP | Open |
| Freemium gate: which specific features sit behind a future paywall? | Post-MVP | Open — **narrowed 2026-07-06 (B-251 PR 10 paywall mock + `pm-feature-review`).** The onboarding paywall ships as a mock with convenience-only PLACEHOLDER bullets (`Custom app themes` / widgets / priority support); the review named the sub-questions the real gate must answer: (1) is **"advanced correlation views" convenience or care** (Principle 3 intelligence surface — paywalling it paywalls care)? (2) does gating **history at 90 days** silently degrade the free trend view + vet report for a >90-day diet trial / chronic case (so "trends & reports always free" stops being true)? **Multi-pet ships free (B-086) — do NOT gate it.** Reconciliation tracked as **B-263**; when decided, swap the mock's placeholders + re-run `nyx-voice`/`pm-feature-review`. |
| Pet photo upload RLS: `nyx-pet-photos` bucket was created via SQL (owner=null), causing uploads to fail with 42501 even with correct policies. Workaround: re-create bucket via dashboard UI, or implement upload via Edge Function with service role key. | Step 7: Pet profile | Open — needs resolution before photo upload ships |
| Stool schema consolidation: `stool_normal` and `diarrhea` are currently stored as separate `event_type` values. UI-level consolidation is done (single "Stool" entry point with Normal/Loose sub-step). Full migration to `event_type='stool'` with a `stool_consistency` sub-field requires a dedicated schema migration PR. | Step 8+ | Deferred by PM — tackle before Step 9 |
| App-wide Geist body rollout — approach? `ThemedText` wrapper migrated across ~39 raw-`<Text>` files (clean, no-magic, but churny + heavy on-device QA) vs a centralized default-`Text` weight-mapping shim (one file, but trips the "no magic" convention). RN doesn't synthesize custom-font weights, so the 53 `weightMedium` sites must map to the loaded `Geist-Medium` family either way. Fonts are loaded + tokenized (design-system PR 2); this is the application decision. | Design-system PR 2 follow-up (B-061) | Open |
| Emerging-signals tier on the Signal surface? Surface low-floor "emerging — not established" patterns (e.g. the rapid post-prandial cluster) the statistical engine can never sign. Evidence + proposed guardrails (counts always attached, escalate-or-observe only, never causal, ≤1 card, out of vet report v1): `docs/research/2026-06-fable-signal-engine-rerun.md` §6.4/§9. Product team currently dissents; PM call. **Narrowed 2026-06-11:** two of the three §6.4 artifacts turned out to be deterministically computable and were routed to the new descriptive lane (`docs/nyx-descriptive-signals-requirements.md` — detectors ⑤/⑥ + diet-structure, B-078/079/080); what remains genuinely open is **sub-floor *associational* patterns only** (e.g. the Temptations 3/52-vs-2/162 timing pattern). **Settled for the vet-report surface (2026-06-22):** the requirements spec §8.5 ratifies **`Established`-only on the report** — `Early`/emerging stays owner-side; this Open Question covers the **Signal surface only**. **Council input (2026-06-25, `docs/research/2026-06-vet-council-nyx-deep-dive.md` §9 #5):** the specialist panel adds the Temptations rapid-after-treat timing (3/96 vs 0/49) as a clean worked example of the trade — and its most cautious lenses (criticalist, skeptical GP) named exactly this class of low-n associational pattern the single biggest *false-reassurance / mis-action* risk ("swap the treats and feel fixed"). Evidence for the debate, not a resolution. | Step 10 evolution | Open — narrowed |
| **AI Signals card — scope of any LLM-over-findings surface.** Should the engine gain a bounded "gestalt reviewer" stage (Opus brief §8.1, panel-validated 2026-06-25, `docs/research/2026-06-vet-council-nyx-deep-dive.md` §9 #4): reads only *computed findings + counts* (data-minimized, never raw logs/photos), may **escalate / re-rank / veto a too-calm framing** (e.g. surface chronicity, refuse "improving") but **never reassures and never attributes cause**? Panel's lean: build the deterministic lanes first (B-182 chronicity, B-183 meal-finished-rate), reserve the LLM for the genuinely-gestalt veto/synthesis. Distinct from the emerging-signals tier (above) and from the Haiku *phrasing* layer (B-001/decided). | Step 10 evolution; B-182/B-183 | Open — surfaced 2026-06-25; PM call on whether/how to scope it. |
| **B-182 chronicity lane (detector ⑦) — PR 1 BUILT; D1/D2/D3 taken provisionally, awaiting ratification.** Deterministic `symptom_chronicity` safety lane (`docs/nyx-chronicity-signal-requirements.md`) — fires on span + sustained-burden + distribution + still-ongoing (orthogonal to ④'s week-over-week delta). **PR 1 shipped this session** (`detection.ts` detector/payload/`chronicity` config/registry + exported `isChronic`; `phrasing.ts` placeholder template; `index.ts` template-only entry; fixtures 1–10 + 14; 249/249 generate-signal tests green; `adversarial-reviewer` run). **Decisions (spec §9):** **(D1)** ADOPTED ⑦-suppresses-④ same-symptom w/ firm-tier inheritance — but it's COMPOSITION-layer → deferred to **PR 2** with the ⑦→③ valve (PR 1 tier is span-only, ships no untested path); **(D2)** floors ADOPTED with **`minEpisodes` raised 4→6** — the spec's 4 FAILED the required §7 #14 noise gate (~9.9% on occasional noise w/ meals logged); 6 → ~1.3% (20k-trial sweep), every clinical fixture still fires; **the 6-vs-5 specificity/sensitivity call is the live Dr. Chen ratification** (safe error direction for a safety lane is toward firing); `minActiveWeeks` stays 3; **(D3)** greenlight TAKEN. **DEPLOY-GATED:** engine is registered/live in `detectSignals` but the client (lib/signal.ts InsightType, InsightCard renderers) can't render `symptom_chronicity` until PR 3 — do NOT redeploy `generate-signal` until the PR1→3 chain + client land. Remaining: PR 2 (composition/valve/ranking, fixtures 11–13, adversarial-mandatory) → PR 3 (copy/voice/Designer+Dr.Chen, fixture 15). **Adversarial-reviewer PASS (not a merge-blocker)** + two routed findings: **(1) D2 sharpened** — minEpisodes 6 measurably MISSES a once-weekly-×5 (5 eps) + q2wk-×4 real chronic course; the noise gate sees only false-positives, so 5-vs-6 is a genuine Dr. Chen sensitivity call (need a real-low-count-course test alongside the noise test before the floor locks). **(2) B-188 (→PR 2)** — the `activeWeeks` now-anchored bucket lets a two-cluster "barbell" straddle a bucket edge → fires non-deterministically by calendar phase; safe-direction over-fire, fix in PR 2 with a phase-stable distribution measure. | Step 10 evolution; B-182 | Open — PR 1 built 2026-06-26; PM/Dr. Chen ratify D1 + D2 (minEpisodes 6-vs-5, w/ false-negative side); B-188 + PR 2/3 to build. |
| **Surface a council-style multi-perspective report to OWNERS?** PM-raised 2026-06-25 after the vet-council deep-dive (`docs/research/2026-06-vet-council-nyx-deep-dive.md`). Should a descendant of the specialist-panel read become an end-user surface? Recommended **staged** path: Rung 1 = the deterministic findings already *are* the report in skeleton (Signal lanes + Patterns; safe, ~built); Rung 2 = the bounded gestalt-reviewer card (above); Rung 3 = the full narrative as a **vet-report (Step 9) enrichment** + maybe a premium owner deep-insight pull-view. **Hard gates:** (a) data-minimization (computed findings + counts across the LLM boundary, **never** raw logs/photos) + consent/retention; (b) the owner-facing version is structurally **escalate-only — never reassures, never diagnoses** (the dominant hazard at scale); (c) cost/calibration + **Pets > $ — the safety insight can't be paywalled (Principle 7)**. | Step 9 / Step 10 evolution | Open — surfaced 2026-06-25; PM north-star call. |
| Medication completion card: keep the meal-card pattern (chips default `given`, auto-dismiss) or diverge for safety — land the dose `unrated` until touched / hold longer? An untouched card persists a refused critical dose as "given", which the n=1-never-reassures bar may forbid for medications. Surfaced by the `pm-feature-review` dogfood (#213). **The B-156 pet-owner review (#221, 2026-06-22) sharpened this into the same problem**: the card auto-dismisses at 5000ms and a chip tap *replaces* (not extends) it with 1500ms (`momentStore.ts:186`), so a safety prompt can't survive the time it takes to actually pill a cat. **B-156 G1 RESOLVED that part (PM, #221): the card DOES auto-dismiss, but the fail-safe is non-negotiable — an *unanswered* prompt where there's evidence against compliance (a not-finished vehicle) must record `unconfirmed`, never `given`, and resurface calmly (`clinical-guardrails` Pattern 2: no path to a reassuring verdict by construction). The standalone one-tap `given` (the owner's own affirmative tap) is fine.** Residual still open here: should a missed/refused dose of a **critical** drug (insulin/anti-seizure/cardiac) escalate even on the standalone card? Apply the same auto-dismiss + fail-safe shape when this is built. | B-117 dose-logging safety | Open (narrowed — critical-drug escalation only) |
| B-156 combo (med-with-food) — remaining open build decisions for Phase B (the combo). **G1 RESOLVED (PM, #221)** — auto-dismiss + fail-safe. **G2 RESOLVED 2026-06-23 (this session) — TWO INDEPENDENT, CROSS-LINKED History instances, NOT one merged combo unit** (PM-ratified 2026-06-23 via the #229/#230 merge authorization): a combo IS two events (single-event-timeline; merged-row Option D rejected), and History already displays two rows — so each is edited via its own existing detail screen (the meal-intake edit + the A3 dose adherence/`how_given` edit on `event/[id].tsx`), **zero** new coordinated-write surface; adherence stays independently/explicitly editable and is **never auto-recomputed** from an intake edit (never-auto-flip / n=1-never-reassures). The one build requirement so "one act" stays legible: the `paired_event_id` link must be **visible + tappable on BOTH rows** (cross-navigation), never merged — a B4/display concern, recorded for B4. Schema is G2-agnostic (B1 #229), so nothing is foreclosed. Rationale: `docs/medication-food-combo-investigation.md` §9 R2 / §10. **G3 SATISFIED** (B-153/B-154 shipped #228 — the shared `insertMedicationDose` path carries the link; **PR B2 built it**). **G4 RESOLVED 2026-06-23 (PR B3, this session) → document-as-known-limit** (not detect-and-prompt): the coupling keys off the VEHICLE's intake, which can't see "ate-around-the-pill"/the `some` edge; an inference-free affordance ("pill spat out / found later") is a future Phase-C/B-173 call (no owner signal to fire on; prompting every finished combo over-nags, Principle 4). **PR B3 BUILT (the intake→adherence safety coupling, adversarial-reviewer PASS):** a refused/picked-vehicle combo dose lands UNCONFIRMED (null, never auto-`given`) → card sharpens to "Did {pet} still get it?" → resurfaces calmly (History "Unconfirmed" tag + dose-detail note). Couple-at-creation + derive-at-read-time; no new enum/column/auto-flip. Residuals named (scenario-2 provenance, detection-`null` → B-174). **PR B4 BUILT 2026-06-23 (#233) — the combo-edit cross-link:** the `paired_event_id` link is now **visible + tappable on BOTH History rows + BOTH detail screens** (dose → "Given with {food}"; meal/treat → "Given with a {drug} dose" / "Given with N doses"; new reverse-lookup `PAIRED_DOSE_REVERSE_JOIN` with an aggregated GROUP BY so N doses don't multiply the meal's timeline row), **soft-delete drops each link cleanly + the link survives an independent edit** (the two AC; the edits are column-narrow, never touch `paired_event_id`). Symmetric "Given with …" copy (reworked off the `+`-reads-as-create collision); Designer (SHIP-SHAPED/copy-reworked) + code-reviewer (HOLD; fixed the 44pt tap-target). Backlog B-175 (N-dose nav) / B-176 (Today parity). **Phase B build chain (B1→B2→B2b→B3→B4) COMPLETE.** **PR C1 BUILT 2026-06-23 (#234, adversarial-reviewer PASS) — the Phase-C engine confounder pass:** `generate-signal/detection.ts` reads the dose↔vehicle pairing so a drug riding inside a food is attributed to the DRUG, not the food (`detectCorrelations` drops a vehicle meal's protein from the case/control exposure set; per-exposure, not a candidacy-wide free-fed exclusion) + resolves **B-174** (a refused/picked-vehicle in-doubt dose is not on-board). Composes with B-117 PR 9 `medicationWindows`; no schema (reads live migration 023). One non-blocking copy-coherence residual → **B-177** (staple-washout names a vehicle-attributed protein with an inaccurate "nothing to compare" reason; honest-uncertainty direction, never reassurance). **The combo build chain (Phase A + Phase B B1→B4 + Phase C C1) is COMPLETE.** Genuinely still open: **promotion** to active build (PM call). | B-156 promotion | Open — narrowed (promotion only; the full build chain — A + B1→B4 + C1 — is shipped) |
| **Are owner-configured scheduled confirmations "nudges" under Principle 4's one-per-day cap?** Surfaced by the 2026-07-10 logging-friction discovery (`docs/logging-capture-discovery.md` §9 #1). The confirmation-push pilot (B-288) flips routine logging to system-asked/owner-confirmed — a local notification at the owner-declared meal/med window with one-press action buttons. That could mean 2–3 scheduled prompts/day, vs Principle 4's "no more than one nudge per day." Proposed resolution: the cap governs *unsolicited* nudges; a confirmation the owner explicitly configured is a tool, not a nudge — guarded by per-schedule opt-in, fail-safe silence (unanswered = nothing recorded, B-156 G1 generalized), self-pruning after 3 ignored days, and a per-account budget (B-015's note). **Designer counter-position (genuine conflict, not resolved silently): channel trust is one bucket regardless of consent — every additional daily prompt spends it.** PM call; if ratified, the carve-out is a Tier-2 `design-principles.md` §4 edit (flagged, not written). | B-288 (confirmation-push pilot) | Open — surfaced 2026-07-10; PM deferred same day pending a read of the brief |
| **Adopt the minimal household shared-care primitive (invite a caregiver + shared write + `logged_by` + RLS) as capture *infrastructure*?** Discovery §1.2/§5: the household is the unit of care; single-writer accounts structurally under-count (the unwitnessed spouse-treat is the canonical diet-trial contaminant), and the PM's own household already shares one credential (the B-054/B-086 evidence). Explicitly NOT a social layer (no feeds/partner-nudges/per-person stats — T&S surveillance guardrail; pet-centric visibility only). Multiplies every capture surface by caregiver count. `rls-privacy-reviewer` mandatory. | B-292; multiplies B-290/B-291 | Open — surfaced 2026-07-10; PM deferred same day pending a read of the brief |
| **Ask (B-228) — D2 (the LLM data boundary) + D7 (the name).** The 2026-07-18 session produced the build-ready spec + design-locked mocks (#394; supersedes the 2026-06-13 rev 1, absorbs B-088). PM ruled D1 (nested `ask_enabled`/`ask_general_enabled` flags, general seeded off), D3 (free teaser 3 convos/mo + Premium full), D4 (next main project), D5 (Home header pill; the entry never changes/badges when capped — Home carries no monetization state), D6 (answer anatomy). | Ask A1–A8 | **Resolved 2026-07-18 (same day, spec v2.1) — D2 RATIFIED with an EXPANDED boundary: the full logged record, scoped to the question — notes + photos IN.** A genuine PM override of the team's tier-2 rec ("they're data points… the photos on the vet report are some of the most important fields"), grounded in shipped reality (photos already cross to Anthropic on `analyze-vomit` + both extractions; the report leads with photos). T&S dissent recorded; sign-off conditional on the §6 mechanisms: **scoped retrieval** (no bulk tool), **transform-only** photo access (the PR-7 EXIF/GPS-strip path), **one-read-path** (live photo reads reuse the `analyze-vomit` machinery + its 10/day cap → A8), delimited-notes injection posture, `rls-privacy-reviewer` at A4 AND A8. **D7: "Ask" placeholder ships; the name workshop is deliberately deferred** (PM "not super concerned right now"); rev 1's no-vet-implication ban binds any future name; workshop before public/store exposure. |
| **B-247 PR 3 seam — how does stool D5's "repeated Type 7" enter the escalation floor?** Caught by code review on PR 2 (#382). D5 (ratified) escalates on "Bristol Type 7 REPEATED within a contextual window — a single Type 7 is monitor-tier", which needs THIS event's own vision classification; but contextual flags deliberately compute BEFORE the vision call (the §5.4 reorder that makes escalation survive the cap/flag-off — framework-owned in `_shared/incident-analysis.ts`, and correct: a capped incident must still escalate on context). Options: **(a)** narrow to prior-events-only — spec §5.3's own `repeated_loose_stool` (≥2 loose/diarrhea EVENTS in a rolling window, owner-classified) already implies this and works pre-vision, but it is a semantic narrowing of D5-as-written (the AI's Bristol read vs the owner's event type) → needs explicit sign-off, not silent reinterpretation; **(b)** a post-vision "refine contextual flags" framework hook — a deliberate framework change requiring its own adversarial pass + a defined cap-path behavior (no vision result exists when capped). Related trap now documented at the seam (`IncidentAnalysisBase.visual_flags`): D5 calls mucus-without-blood a "monitor-tier visual flag", but ANY `visual_flags` entry forces `worth_a_call` — mucus must surface via structured fields only, and `IncidentCopy.monitor(petName)` has no hook to name a non-escalating finding in prose (decide whether PR 3 needs one). | B-247 PR 3 (`analyze-stool`) | **Resolved 2026-07-17 — PM RULED (a) prior-events-only.** The repeat escalation is a **pre-vision contextual flag** `repeated_loose_stool` = ≥2 owner-classified loose/`diarrhea` events in a rolling window (incl. this event), mirroring `repeated_vomiting`'s shape — so it **survives the cap** (no dependence on the vision result) and needs **no framework change**. This is an explicit, signed-off narrowing of D5-as-written to §5.3's already-ratified definition: the repeat keys off the owner's Loose/Normal classification, not the AI's Bristol read. The single Type-7 read still surfaces (never reassures) as a **monitor-tier structured field** (`stool_consistency`), not an escalation driver. Cost: the rare "watery stool the owner logged as Normal while AI reads Type 7" edge case doesn't force escalation on that one event — mitigated because it still surfaces as a monitor read and persistence resolves toward escalation as the owner's classification catches up. **Mucus trap: RULED structured-field-only** — mucus-without-blood stays OUT of `visual_flags` (any entry forces `worth_a_call`) and surfaces via the `stool_mucus_present` structured field (rendered on the detail screen, PR 6); the `monitor` copy stays generic/forward-looking (NO per-finding prose hook in PR 3), matching vomit — naming a benign finding in monitor prose flirts with reassurance-on-absence. **Adversarial-reviewer pass on PR 3 (2026-07-17):** cap-survival / mucus-containment / never-reassure-on-monitor / never-clobber all HELD; **① FIXED in code** — the floor now DERIVES the escalating visual flags (`blood`, `suspected_foreign_material`) from the structured clinical fields and unions them with the model's array (never trusts the array alone), aligning with `generate-report`'s B-340 derivation, and suppresses a floor-derived escalation from surfacing a soft model read; **③ → B-361** (inherited `now`-vs-`occurred_at` window-anchor under-fire on back-dated events, affects vomit too). **② the one residual for the PM: the reviewer asks that ruling (a)'s dependence on the owner's Loose/Normal classification (rather than the AI's Bristol read) get an explicit Dr. Chen clinical sign-off before this is called fully "ratified"** — the PM ruled (a) this session with the edge case surfaced, so this is a formal-sign-off ask, not a re-open; flagged as a PM action item, does not block the draft PR. |
| **The vet report's empty safety band on a refusing patient (B-494) — does it block the report shipping?** Surfaced by `vet-report-cold-read` on B-417 PR 7, where two independent cold reads of the SAME artifact reached opposite conclusions. The artifact: an 8-year-old cat, **38 of 38 rated feedings of the prescribed diet logged as refused across 19 days**, ~7% of body weight lost, active chronic vomiting, a free-fed bowl whose intake is unobserved — and `snapshot.safetyFlags` is empty, so no safety band renders at all. Round 3's Dr. Chen **withdrew it as a blocker** once page 1 composed the refusal with the weight delta; round 4's and round 5's ranked it **blocking #1** (*"the quieter-looking of the two artifacts is the sicker patient"*). Root cause is known: `detectIntakeDecline` is a RELATIVE-decline detector, so a diet refused from day 1 is uniformly low and returns `{status:'none'}`; PR 5's `trialDietRefusal` exists for exactly this and is **not** a `SafetyFlag`. | B-417 PR 7 merge vs. the `generate-report` redeploy | **Resolved 2026-07-26 — PM DELEGATED the call to the product team, which ruled it BLOCKING FOR THE DEPLOY, not for the merge.** The mechanism decided it, and no counter-lens rebuts it: the report *teaches* the reader to scan the flag zone (*"Safety flags — shown only when present, above the fold"*) and the legend then states affirmatively that **no reduced-intake flag fired** — so an empty band reads as a **negative result** rather than as silence. That is **reassurance-on-absence at the report layer**, which `clinical-guardrails` forbids outright, and *intake is not preference* routes refusal toward a health flag by invariant. The usual counter — alarm fatigue, don't cry wolf — does **not** apply: this is not a marginal detector firing, it is the canonical feline-anorexia case. **Consequence, taken knowingly:** B-417 PR 7 merged (its trial block is correct and regression-tested) and **`generate-report` was deliberately NOT redeployed**, so the report an owner generates keeps the pre-PR-7 off-diet heuristic (~530 exposures across 645 feedings on live data) until the refusal safety lane ships. **B-494 is now the gate on that redeploy**, and it still needs its own `adversarial-reviewer` pass + Dr. Chen sign-off per the DoD — this ruling sets the bar, it does not waive the gates. **The generalisable rule: a report that teaches the reader to scan a zone may not leave that zone silent on a patient the record already knows is in trouble — an empty band is read as a negative result, so on any surface that advertises its own flags, absence must be either impossible or explicitly stated.** |
| **Elevate a per-incident red flag (blood / suspected foreign material) to a high-visibility Home Signal?** Surfaced by the PM's first real vet-report send (2026-07-13). Today `analyze-vomit` computes `worth_a_call` + `visual_flags` on the event DETAIL screen only; `generate-signal/detection.ts` reads events/meals/meds but **not** `event_ai_analysis`, so a per-incident red flag never reaches Home — the primary intelligence surface where "safety insights always lead" (Principle 3). The invariant PERMITS it: n=1 may escalate on the PRESENCE of a red flag (never reassure on absence), and a safety card is escalation, not reassurance. **Persona conflict (Dr. Chen/Data: surface it vs Designer/Jordan/Sam: two false positives already → trust cost of crying wolf).** | Step 10 evolution / Signal safety surface | **Resolved 2026-07-13 — PM RATIFIED: elevate.** Per-incident VISUAL red flags surface as a firm-but-calm Home safety card, led at top. Conflict resolved toward Dr. Chen/Data: **false positives are cheap to course-correct** — the owner already edits the AI analysis to clear a false flag (B-028), so *elevate-and-let-the-owner-correct* beats hiding a real red flag on a detail screen. **Sub-decisions ruled:** single-incident (no corroboration gate); course-correction = the existing edit path (UX polish later, not a blocker); tone = the existing firm safety register (NO new "danger"/klaxon state — Nyx has none). **Load-bearing build guardrail (code-verified this session):** the client edit writes ONLY structured fields + `edited_at`, and deliberately does NOT clear the cached `visual_flags`/`recommendation` (`lib/analysis.ts:152`) — so the elevation MUST derive the flag from the owner-editable structured fields (`foreign_material_present==='yes'`; `blood_present∈{fresh_red,coffee_ground}`), exactly as `generate-report` already does (override-aware by construction), NEVER from the stale `visual_flags` array. **Build-time call (not PM-blocking), Engineer rec = visual-only:** scope to the net-new `event_ai_analysis` datum (the photo VISUAL flag) vs. also the contextual `worth_a_call` escalations (repeated-vomiting / feline-reduced-intake / lethargy — derivable from events the engine already reads → likely their own lanes, not this item). Build = **B-340** (Step 10 evolution; reads a NEW source into `detectSignals` → `adversarial-reviewer` MANDATORY; deploy-gated on the client renderer, per the B-182 lesson). |
| Which PDF rendering library for the Edge Function? (`pdf-lib` vs `puppeteer` vs `react-pdf`) | Step 9: Vet report | **Resolved 2026-07-02 — HTML-first RATIFIED by the PM.** The report is HTML-first: canonical server-rendered HTML, shown **in-app via a WebView** (the owner sees it in the app — never a downloaded `.html` file), and handed to the vet as a **PDF via the native share sheet**. The "which PDF library" question is demoted to the **B-144 render-path spike**; the PDF-generation *location* (on-device `expo-print` vs server-side headless) is a build-time sub-decision (`nyx-vet-report-requirements.md` §14 S7). Does not block Phase 1 (`report.ts` is format-agnostic). |

## What Good Looks Like

**Design benchmark:** Calm, Linear, Oura. Not generic health apps. Not anything that looks functional rather than built to be used. When in doubt: would a designer at Calm be proud of this screen?

**Engineering benchmark:** An app a senior React Native engineer would not be embarrassed by. Clean separation of concerns, no magic, no shortcuts that become blockers in two sprints. When in doubt: would a senior engineer at Linear be comfortable maintaining this code?

If the answer to either question is uncertain, it needs more work before it ships.

---

## Version History

Most recent three versions only. Older entries archived at `docs/CLAUDE-md-history.md`. The three "Future Work / Ideas" items added to CLAUDE.md in v1.15 (detail-screen pattern for History events, Food Library as a top-level nav item, smarter library deletes) have moved to `docs/backlog.md` as B-003/B-004/B-005 — that file is now the single home for deferred items.

| Version | Date | Summary |
|---|---|---|
| v1.25 | 2026-07-19 | **Workflow retro — state-file hygiene + doc-versioning discipline.** First run of the `personas.md` Periodic Process Retro (PM-initiated reflection). Found the volatile working files had become archives: STATUS.md at 210 KB / 26 K words (violating its own "keep it scannable" charter), 45 open + 11 done-never-pruned PM action items, `docs/backlog.md` at 403 KB / 242 open rows, and the `*-v1_0` docs frozen while reality moved (the schema doc covered ~9 of ~21 tables and *inverted* `food_items` ownership). Root cause = accretion with no counter-force ("keep the row, mark Done" + a max-density house style + a retro ritual that never fired). Applied this session: (1) **slimmed STATUS.md 210 KB → ~86 KB** — deleted the duplicated "Previous:" archive, one-lined Recent Sessions (~13 kept), pruned the 11 completed PM items (all 45 open items preserved); (2) added a STATUS.md **size budget** + `/wrap` **prune-while-you-prepend** teeth (the counter-force) + a doc-header-date bump rule; (3) **living-vs-frozen doc versioning** (header-not-filename versions) with 🌱/🧊 tags in the Read-These table — demoted `nyx-schema-v1_0.sql` to a snapshot pointing at `supabase/migrations/` as canonical, froze the research + competitive-landscape artifacts; (4) re-armed the retro ritual with a real trigger + a state-file-hygiene check (#4). **Filed for PM sign-off (NOT done unilaterally):** the backlog archive-split, a CLAUDE.md deep trim, Open-Questions consolidation, and a minimal CI workflow (`tsc`+`jest` on PRs — today all 379 merges land with 0 automated checks). Full write-up: `docs/workflow-retro-2026-07.md`. Process/meta only; no build-phase change, no app code. |
| v1.26 | 2026-07-25 | **CI shipped — the repo has a server-side gate for the first time (B-390, audit §C1; PR #440).** Closes the single largest item the 2026-07-19 retro *filed for PM sign-off* and the hardening audit ranked first: ~400 merges had landed on `main` with **0 automated checks** while ~2,500 tests passed locally and gated nothing. The only gate was `.githooks/pre-push` — opt-in (`core.hooksPath`, set by the `prepare` script, so a clone that skips `npm install` has none), bypassable with `--no-verify`, and it **never ran the Edge Function suites at all**, leaving the 829 cases over the clinically load-bearing detection/escalation code enforced nowhere. `.github/workflows/ci.yml` now runs two parallel jobs on every PR and every push to `main`: **`App (typecheck + jest)`** (`npm ci` → `tsc --noEmit` → `jest --ci`; 110 suites / 1688 cases) and **`Edge Functions (deno test)`** (829 cases). Added to the Git Workflow rules as a standing convention. Hardening: actions **SHA-pinned** (not tag-pinned — CI is where third-party code meets a checkout), `permissions: contents: read`, concurrency cancels superseded runs, network confined to one **retried** `deno cache` step with the assertion step on `--cached-only`. **Two findings only a real run could produce:** the Deno job needs `npm ci` too (its type-check resolves a *transitive* `@types/node` out of `node_modules` — present locally, absent in CI; the first run failed on it), and `deno test` type-checking by default makes that job the **only** type check over `supabase/functions/`, which `tsconfig.json` excludes — a type-coverage hole nobody had named. `--frozen` deferred to **B-434** (stale `deno.lock` workspace block). **And the gate went on the same day:** the PM created an Active `main` ruleset requiring both checks with an empty bypass list, so B-390 closed `Done` rather than `Partial` — after ~400 unchecked merges, `main` now has an enforced floor no one can bypass. Process/infrastructure only; no app code, no schema, no build-phase change. |
| v1.27 | 2026-07-25 | **Killed the STATUS.md merge-conflict surface + bounded PR check-ins.** PM asked why an overnight burned so much usage. Root cause was two compounding habits, both measured rather than assumed. **(1) `STATUS.md` was a collision magnet by construction:** every session rewrote the same single-line `**Last updated:**` header and prepended to the same shared `Recent Sessions` list, so any two of the six-plus sessions this repo runs in parallel conflicted on identical lines. The 2026-07-24 overnight produced four `resolve STATUS.md conflict` merge commits and still shipped **two contradictory `Last updated` lines to `main`** from a botched resolution. Fix: the per-session record moved to **one file per session in `docs/sessions/`** (new, with a README defining the convention; the ten existing entries migrated verbatim, nothing discarded) and both single-line rewrite points were **deleted** from STATUS.md — a new file per session cannot collide with another new file per session. `STATUS.md` keeps only working state, and `/wrap` gained a minimise-the-diff rule (change what your work made untrue; no reflowing or drive-by tidying of a file every other session is editing). **(2) Scheduled PR check-ins had become standing chains:** 102 `send_later` wakes in three weeks, auto-re-armed hourly and terminating only on merge — but PRs here sit open for weeks and the PM merges by hand in the morning, so overnight wakes polled an idle repo. Audited against the commit log: **3 of 11 overnight wakes did any work, and all three were base-drift repair** — i.e. cleaning up after collision (1). New Git Workflow rule bounds them: at most one, ~90 min out, only while siblings are landing on `main`, stop on the first no-op, never at `/wrap`, never overnight, never under ~90 min (an hourly cadence lands past the prompt-cache TTL, re-sending the whole context at full price to learn nothing).  **Also ruled this session (PM delegated the remaining calls to Dir. of Eng.):** `docs/sessions/` **kept** rather than folded into PR bodies — it sits on `/kickoff`'s read path, works offline, and greps. **CLAUDE.md cut 22%** (109 KB → 85 KB, ~6 K tokens off *every turn of every session*) by extracting the 17 already-resolved Open-Questions rows verbatim to **`docs/decisions-archive.md`** — that table was **47%** of the auto-loaded manual and 21 of its rows recorded decisions already *made*; same pattern as `docs/CLAUDE-md-history.md`. **4 resolved rows deliberately stayed inline** because CLAUDE.md held the only copy of their ruling and two are live build guardrails (B-247's stool seam; B-340's derive-from-structured-fields rule) — moving those would hide a rule from the sessions that need it → **B-487** (filed as B-432; renumbered 2026-07-26 on ID collisions). **`docs/backlog.md` restructure declined:** its 453 KB was never the problem, the *access pattern* was — the session-start scan wants a handful of rows keyed on **Blocks**, so CLAUDE.md + `/kickoff` now say `grep` it (one row per line, grep-shaped by construction) and reserve the whole-file read for `view backlog`. Process/meta only; no build-phase change, no app code. |
