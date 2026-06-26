# Project Nyx — Claude Code Session Guide
**Version:** 1.24 | Last Updated: 2026-06-14

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
| `docs/nyx-technical-spec-v1_0.md` | Every session. Stack, architecture decisions, MVP acceptance criteria, build sequence. |
| `docs/nyx-schema-v1_0.sql` | Any session touching data, queries, or new tables. Reference queries are documented here. |
| `docs/nyx-design-principles-v1_0.md` | Any session touching UI, copy, interaction, or notifications. Seven principles govern every screen. |
| `docs/personas.md` | Every session. Full persona definitions, the **persona routing table**, and the persona/subagent/skill model. CLAUDE.md carries only the roster + always-on rules. |
| `docs/nyx-research-v1_0.md` | When making product decisions about scope, features, or user behavior. Market and persona data lives here. |
| `docs/food-library-redesign-requirements.md` | Any session touching food entry, the meal log flow, the food library/picker, or AI-driven extraction of food data. Output of the May 2026 photo-library research session. |
| `docs/nyx-competitive-landscape-v1_0.md` | When evaluating feature positioning or vet-facing strategy. |
| `docs/backlog.md` | When the PM asks to `view backlog` / `show backlog`. Also read at session start to surface any backlog item whose **Blocks** column matches the Current Phase. See the Backlog Protocol section below. |
| `docs/research/README.md` | When making product decisions in a domain a prior research brief covers (feeding behavior, symptom correlation windows, etc.). The README indexes all briefs; read the relevant brief directly before designing in that domain. |

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
- `food_items` are globally scoped (no `user_id`); every other new table includes `pet_id` and RLS.

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
| `ANTHROPIC_API_KEY` | `supabase secrets` | `extract-food-from-photo`, `extract-medication-from-photo` (drug-label vision, Sonnet 4.6 — B-117 PR 5), `analyze-vomit`, `generate-signal` (AI Signal phrasing, Haiku 4.5) | ✓ — already provisioned; reused by `extract-medication-from-photo` (B-117 PR 5, no new key needed). | Server-only. `generate-signal` degrades to deterministic templates if unset, so a missing key is non-fatal but loses LLM phrasing. |
| `EXPO_TOKEN` | Codespace env (optional) | `eas update`, `eas build` CLI | ✗ — interactive `eas login` works fine for now | Only needed if we automate EAS publishing from CI. For manual `eas update` from Codespace, `eas login` once per Codespace is sufficient. |
| Apple Developer account | EAS / App Store Connect | iOS TestFlight / standalone builds | ✓ — enrolled 2026-06-07; first TestFlight build installed | Enables TestFlight + standalone iOS builds. With a real build in place, `eas update --branch preview` now reaches it OTA (Runtime A). Per-push on-device testing still uses Runtime B (Metro + tunnel). |
| Supabase access token (`nyx-cli-deploy`, `sbp_…`) | Account-level PAT — **NOT in repo** | `supabase functions deploy` / `db push` CLI **(superseded)** | ✗ / N/A — **not needed**; backend deploys run via the Supabase MCP (no token). The `nyx-cli-deploy` PAT (created 2026-06-07 for a one-off CLI deploy) is **flagged for revocation** — open PM Action Item. | Server-only; never commit. Edge-Function + migration deploys use the Supabase MCP (`deploy_edge_function` / `apply_migration`) — see `docs/edge-deploy-runbook.md`. A Supabase PAT is only needed if the PM later wants `supabase functions deploy` straight from disk, in which case set it as a **cloud-env secret**, never in the repo. Revoke at dashboard → Account → Access Tokens. |

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
- Schema changes always get their own PR — never bundle a schema change with UI work.
- Squash merge to keep `main` history clean and linear.
- Do not merge a PR if QA criteria for the current build step are not yet met.
- **One PR per session.** The end-of-session STATUS.md update (and any CLAUDE.md / doc edits) ride in the session's *existing* work PR — committed to its branch before merge — not a separate "record the merge" PR afterward. Write the Recent Sessions entry as `shipped via #<n>` (the PR number is assigned at creation, drafts included), never as `merged to main (#<n>)` — the post-merge phrasing is what forces the second PR. **Exception:** if the work PR was already merged mid-session, the status update is a small standalone follow-up. This is orthogonal to the schema-isolation rule above — STATUS.md is not schema. (Mechanics in `/wrap`.)

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

| Question | Blocks | Status |
|---|---|---|
| Which PDF rendering library for the Edge Function? (`pdf-lib` vs `puppeteer` vs `react-pdf`) | Step 9: Vet report | Open — **reshaped** by the requirements spec (`docs/nyx-vet-report-requirements.md` §8.2): design basis is HTML-first → this demotes to the **B-144 render-path spike** (Phase 4 PR 10) and does **not** block Phase 1. Needs the PM's **formal ratification of HTML-first** to close. |
| Minimum Expo SDK version? Document immediately after scaffold. | Step 1: Scaffold | Open |
| Push notification provider for nudge system? | Post-MVP | Open |
| Freemium gate: which specific features sit behind a future paywall? | Post-MVP | Open |
| Pet photo upload RLS: `nyx-pet-photos` bucket was created via SQL (owner=null), causing uploads to fail with 42501 even with correct policies. Workaround: re-create bucket via dashboard UI, or implement upload via Edge Function with service role key. | Step 7: Pet profile | Open — needs resolution before photo upload ships |
| Stool schema consolidation: `stool_normal` and `diarrhea` are currently stored as separate `event_type` values. UI-level consolidation is done (single "Stool" entry point with Normal/Loose sub-step). Full migration to `event_type='stool'` with a `stool_consistency` sub-field requires a dedicated schema migration PR. | Step 8+ | Deferred by PM — tackle before Step 9 |
| App-wide Geist body rollout — approach? `ThemedText` wrapper migrated across ~39 raw-`<Text>` files (clean, no-magic, but churny + heavy on-device QA) vs a centralized default-`Text` weight-mapping shim (one file, but trips the "no magic" convention). RN doesn't synthesize custom-font weights, so the 53 `weightMedium` sites must map to the loaded `Geist-Medium` family either way. Fonts are loaded + tokenized (design-system PR 2); this is the application decision. | Design-system PR 2 follow-up (B-061) | Open |
| Emerging-signals tier on the Signal surface? Surface low-floor "emerging — not established" patterns (e.g. the rapid post-prandial cluster) the statistical engine can never sign. Evidence + proposed guardrails (counts always attached, escalate-or-observe only, never causal, ≤1 card, out of vet report v1): `docs/research/2026-06-fable-signal-engine-rerun.md` §6.4/§9. Product team currently dissents; PM call. **Narrowed 2026-06-11:** two of the three §6.4 artifacts turned out to be deterministically computable and were routed to the new descriptive lane (`docs/nyx-descriptive-signals-requirements.md` — detectors ⑤/⑥ + diet-structure, B-078/079/080); what remains genuinely open is **sub-floor *associational* patterns only** (e.g. the Temptations 3/52-vs-2/162 timing pattern). **Settled for the vet-report surface (2026-06-22):** the requirements spec §8.5 ratifies **`Established`-only on the report** — `Early`/emerging stays owner-side; this Open Question covers the **Signal surface only**. **Council input (2026-06-25, `docs/research/2026-06-vet-council-nyx-deep-dive.md` §9 #5):** the specialist panel adds the Temptations rapid-after-treat timing (3/96 vs 0/49) as a clean worked example of the trade — and its most cautious lenses (criticalist, skeptical GP) named exactly this class of low-n associational pattern the single biggest *false-reassurance / mis-action* risk ("swap the treats and feel fixed"). Evidence for the debate, not a resolution. | Step 10 evolution | Open — narrowed |
| **AI Signals card — scope of any LLM-over-findings surface.** Should the engine gain a bounded "gestalt reviewer" stage (Opus brief §8.1, panel-validated 2026-06-25, `docs/research/2026-06-vet-council-nyx-deep-dive.md` §9 #4): reads only *computed findings + counts* (data-minimized, never raw logs/photos), may **escalate / re-rank / veto a too-calm framing** (e.g. surface chronicity, refuse "improving") but **never reassures and never attributes cause**? Panel's lean: build the deterministic lanes first (B-182 chronicity, B-183 meal-finished-rate), reserve the LLM for the genuinely-gestalt veto/synthesis. Distinct from the emerging-signals tier (above) and from the Haiku *phrasing* layer (B-001/decided). | Step 10 evolution; B-182/B-183 | Open — surfaced 2026-06-25; PM call on whether/how to scope it. |
| **B-182 chronicity lane (detector ⑦) — PR 1 BUILT; D1/D2/D3 taken provisionally, awaiting ratification.** Deterministic `symptom_chronicity` safety lane (`docs/nyx-chronicity-signal-requirements.md`) — fires on span + sustained-burden + distribution + still-ongoing (orthogonal to ④'s week-over-week delta). **PR 1 shipped this session** (`detection.ts` detector/payload/`chronicity` config/registry + exported `isChronic`; `phrasing.ts` placeholder template; `index.ts` template-only entry; fixtures 1–10 + 14; 249/249 generate-signal tests green; `adversarial-reviewer` run). **Decisions (spec §9):** **(D1)** ADOPTED ⑦-suppresses-④ same-symptom w/ firm-tier inheritance — but it's COMPOSITION-layer → deferred to **PR 2** with the ⑦→③ valve (PR 1 tier is span-only, ships no untested path); **(D2)** floors ADOPTED with **`minEpisodes` raised 4→6** — the spec's 4 FAILED the required §7 #14 noise gate (~9.9% on occasional noise w/ meals logged); 6 → ~1.3% (20k-trial sweep), every clinical fixture still fires; **the 6-vs-5 specificity/sensitivity call is the live Dr. Chen ratification** (safe error direction for a safety lane is toward firing); `minActiveWeeks` stays 3; **(D3)** greenlight TAKEN. **DEPLOY-GATED:** engine is registered/live in `detectSignals` but the client (lib/signal.ts InsightType, InsightCard renderers) can't render `symptom_chronicity` until PR 3 — do NOT redeploy `generate-signal` until the PR1→3 chain + client land. Remaining: PR 2 (composition/valve/ranking, fixtures 11–13, adversarial-mandatory) → PR 3 (copy/voice/Designer+Dr.Chen, fixture 15). | Step 10 evolution; B-182 | Open — PR 1 built 2026-06-26; PM/Dr. Chen ratify D1 + D2 (minEpisodes 6-vs-5); PR 2/3 to build. |
| **Surface a council-style multi-perspective report to OWNERS?** PM-raised 2026-06-25 after the vet-council deep-dive (`docs/research/2026-06-vet-council-nyx-deep-dive.md`). Should a descendant of the specialist-panel read become an end-user surface? Recommended **staged** path: Rung 1 = the deterministic findings already *are* the report in skeleton (Signal lanes + Patterns; safe, ~built); Rung 2 = the bounded gestalt-reviewer card (above); Rung 3 = the full narrative as a **vet-report (Step 9) enrichment** + maybe a premium owner deep-insight pull-view. **Hard gates:** (a) data-minimization (computed findings + counts across the LLM boundary, **never** raw logs/photos) + consent/retention; (b) the owner-facing version is structurally **escalate-only — never reassures, never diagnoses** (the dominant hazard at scale); (c) cost/calibration + **Pets > $ — the safety insight can't be paywalled (Principle 7)**. | Step 9 / Step 10 evolution | Open — surfaced 2026-06-25; PM north-star call. |
| Medication completion card: keep the meal-card pattern (chips default `given`, auto-dismiss) or diverge for safety — land the dose `unrated` until touched / hold longer? An untouched card persists a refused critical dose as "given", which the n=1-never-reassures bar may forbid for medications. Surfaced by the `pm-feature-review` dogfood (#213). **The B-156 pet-owner review (#221, 2026-06-22) sharpened this into the same problem**: the card auto-dismisses at 5000ms and a chip tap *replaces* (not extends) it with 1500ms (`momentStore.ts:186`), so a safety prompt can't survive the time it takes to actually pill a cat. **B-156 G1 RESOLVED that part (PM, #221): the card DOES auto-dismiss, but the fail-safe is non-negotiable — an *unanswered* prompt where there's evidence against compliance (a not-finished vehicle) must record `unconfirmed`, never `given`, and resurface calmly (`clinical-guardrails` Pattern 2: no path to a reassuring verdict by construction). The standalone one-tap `given` (the owner's own affirmative tap) is fine.** Residual still open here: should a missed/refused dose of a **critical** drug (insulin/anti-seizure/cardiac) escalate even on the standalone card? Apply the same auto-dismiss + fail-safe shape when this is built. | B-117 dose-logging safety | Open (narrowed — critical-drug escalation only) |
| B-156 combo (med-with-food) — remaining open build decisions for Phase B (the combo). **G1 RESOLVED (PM, #221)** — auto-dismiss + fail-safe. **G2 RESOLVED 2026-06-23 (this session) — TWO INDEPENDENT, CROSS-LINKED History instances, NOT one merged combo unit** (PM-ratified 2026-06-23 via the #229/#230 merge authorization): a combo IS two events (single-event-timeline; merged-row Option D rejected), and History already displays two rows — so each is edited via its own existing detail screen (the meal-intake edit + the A3 dose adherence/`how_given` edit on `event/[id].tsx`), **zero** new coordinated-write surface; adherence stays independently/explicitly editable and is **never auto-recomputed** from an intake edit (never-auto-flip / n=1-never-reassures). The one build requirement so "one act" stays legible: the `paired_event_id` link must be **visible + tappable on BOTH rows** (cross-navigation), never merged — a B4/display concern, recorded for B4. Schema is G2-agnostic (B1 #229), so nothing is foreclosed. Rationale: `docs/medication-food-combo-investigation.md` §9 R2 / §10. **G3 SATISFIED** (B-153/B-154 shipped #228 — the shared `insertMedicationDose` path carries the link; **PR B2 built it**). **G4 RESOLVED 2026-06-23 (PR B3, this session) → document-as-known-limit** (not detect-and-prompt): the coupling keys off the VEHICLE's intake, which can't see "ate-around-the-pill"/the `some` edge; an inference-free affordance ("pill spat out / found later") is a future Phase-C/B-173 call (no owner signal to fire on; prompting every finished combo over-nags, Principle 4). **PR B3 BUILT (the intake→adherence safety coupling, adversarial-reviewer PASS):** a refused/picked-vehicle combo dose lands UNCONFIRMED (null, never auto-`given`) → card sharpens to "Did {pet} still get it?" → resurfaces calmly (History "Unconfirmed" tag + dose-detail note). Couple-at-creation + derive-at-read-time; no new enum/column/auto-flip. Residuals named (scenario-2 provenance, detection-`null` → B-174). **PR B4 BUILT 2026-06-23 (#233) — the combo-edit cross-link:** the `paired_event_id` link is now **visible + tappable on BOTH History rows + BOTH detail screens** (dose → "Given with {food}"; meal/treat → "Given with a {drug} dose" / "Given with N doses"; new reverse-lookup `PAIRED_DOSE_REVERSE_JOIN` with an aggregated GROUP BY so N doses don't multiply the meal's timeline row), **soft-delete drops each link cleanly + the link survives an independent edit** (the two AC; the edits are column-narrow, never touch `paired_event_id`). Symmetric "Given with …" copy (reworked off the `+`-reads-as-create collision); Designer (SHIP-SHAPED/copy-reworked) + code-reviewer (HOLD; fixed the 44pt tap-target). Backlog B-175 (N-dose nav) / B-176 (Today parity). **Phase B build chain (B1→B2→B2b→B3→B4) COMPLETE.** **PR C1 BUILT 2026-06-23 (#234, adversarial-reviewer PASS) — the Phase-C engine confounder pass:** `generate-signal/detection.ts` reads the dose↔vehicle pairing so a drug riding inside a food is attributed to the DRUG, not the food (`detectCorrelations` drops a vehicle meal's protein from the case/control exposure set; per-exposure, not a candidacy-wide free-fed exclusion) + resolves **B-174** (a refused/picked-vehicle in-doubt dose is not on-board). Composes with B-117 PR 9 `medicationWindows`; no schema (reads live migration 023). One non-blocking copy-coherence residual → **B-177** (staple-washout names a vehicle-attributed protein with an inaccurate "nothing to compare" reason; honest-uncertainty direction, never reassurance). **The combo build chain (Phase A + Phase B B1→B4 + Phase C C1) is COMPLETE.** Genuinely still open: **promotion** to active build (PM call). | B-156 promotion | Open — narrowed (promotion only; the full build chain — A + B1→B4 + C1 — is shipped) |
### Resolved

| Question | Blocks | Resolution |
|---|---|---|
| One-tap medication dose linking (§5.1): link a dose to its active regimen + inherit the dose amount, or keep doses deliberately ad-hoc (`medication_id`/`doseAmount` null)? | Medication compliance accuracy (B-117 PR 7 follow-up) | **Resolved 2026-06-23 (B-153/B-154) — LINK, the spec §5.1 ruling.** A one-tap dose now resolves the drug's most-recently-started **active** regimen (`getActiveRegimenForDrug`, read from the locally-hydrated `medications` table so it works offline) and carries `medication_id` + inherits `dose_amount`; the new **"Log a dose"** card affordance (B-154) carries `medication_id = reg.id` directly, which is the only loggable path for a **free-text** regimen (no library item, so it could never accumulate doses before — the "No doses logged yet" forever bug). `attributeDosesToRegimens` gained a two-pass precedence: an explicit link is authoritative (never re-matched by drug/window), else the legacy item+window fallback. Recommend-and-proceed (not load-bearing — purely additive; the ad-hoc path survives when no active regimen exists, and no safety invariant is touched: adherence still defaults `given` on the affirmative tap with the downgrade chips reachable). **Awaiting PM ratification**, but composes cleanly and unblocks B-156 Phase B's G3 gate. Adversarial review PASS (no double-count / wrong-regimen / compliance over-read / refusal-softening); the one over-reassurance finding — an optimistic `given++` on the card going stale after an in-session downgrade — was closed with a `useFocusEffect` reconcile. |
| Medication logging (B-117) — feature shape: `medication_items` library vs free-text; which structured fields; reminders; whether adherence renders on the vet report. | Step 9 vet report + Step 10 correlation (composes with; not strictly blocking) | **Resolved 2026-06-19 (PR #190) — product team convened, PM ratified D1–D4.** Build-ready spec: `docs/nyx-medication-logging-requirements.md`. **D1 data model = regimen + dose-events** (`medications` mirrors `diet_trials`; each dose = a `medication` event + a 1:1 `medication_administrations` child that mirrors `meals`+`intake_rating`) — the only shape consistent with the decided single-event-timeline (Option A) architecture, and the one that keeps logging a one-tap action (configure the regimen once → confirm-don't-enter forever, exactly the food model). **D2 drug identity = photo-first capture seeding an organically-built `medication_items` library** (food-model: globally scoped + `created_by_user_id`, *not* pre-curated; a centralized/curated catalog is an explicit future refactor) — correlating on a stable `medication_item_id` also sidesteps the B-052 free-text canonicalization problem. **D3 reminders deferred** (blocked on the push-notification-provider open question + Principle 4; v1 = owner-initiated logging like meals). **D4 vet report = a "Current medications" section + a computed one-line adherence summary per drug** (rides Step 9; the schema captures it now). Safety: medication adherence inherits both invariants — n=1 never reassures (absence of a logged dose ≠ wellness), a refused/partial dose routes to a health flag not "fussy", a missed *critical*-drug dose escalates, and AI-extracted doses are never silently trusted (a dosing hazard with no food analog). Build = the 10-PR plan in spec §12; the Signal confounder pass (PR 9) and vet-report render (PR 10) are gated + `adversarial-reviewer`-mandatory. Open sub-decisions S1–S5 (spec §11) are build-time, not PM-blocking. |
| GDPR deletion cascade: anonymize or hard-delete on account deletion? | Step 1: Auth; B-039 | **Resolved 2026-06-19 — hard-delete** (B-039 product-team plan; team rec unanimous, Trust & Safety lead). On account deletion we hard-delete, not anonymize: `auth.admin.deleteUser` fires the existing `ON DELETE CASCADE` FK graph (every pet-data table cascades from `auth.users`/`pets` — verified across migrations 001–019; no `RESTRICT`/`NO ACTION` FK blocks it), plus an explicit Edge-Function Storage purge of the user's own buckets (`nyx-pet-photos`, `nyx-event-attachments`, `nyx-vet-attachments`, vet-report PDFs). `food_items` + `nyx-food-photos` survive (global catalog; `created_by_user_id → SET NULL`). Soft-deleted events are hard-purged by the cascade — the documented exception to the soft-delete-only constraint. Anonymize rejected: ~all data is pet-health, not classic PII, so detachment buys nothing legally and would need a migration. **No new schema.** Build-ready spec: `docs/nyx-account-deletion-requirements.md`. |
| Deterministic worsening lane: no detector owns symptom-frequency worsening — reflection's worsening gate suppresses a rising trend with nothing firing in its place (one-way valve; re-run brief §6.1, observed live 2026-06-10). Spec it? | Step 10 / Signal safety lane | **Resolved 2026-06-11 — yes, built as detector ④ `symptom_worsening` (B-077, PR #130).** Product-team deliberation → PM-ratified spec. **Decisions:** (1) name is a backend discriminator only. (2) **Fire threshold coupled to ③'s gate** at `worseningMinEpisodes=2` (both arms — episode rise OR symptom-day-spread rise), via a single shared `isWorsening` predicate + `computeWindowedStats` used by BOTH ③ (suppress) and ④ (fire), so "③ silent ⟺ ④ speaks" holds by construction — no higher floor (would reopen a silent band). Prior count may be 0; **both** windows must be logging-eligible (fake-rise guard; residual under-logging errs toward escalation, never false reassurance, §9). (3) **Copy B-reshaped** — three registers anchored to current-week symptom-DAY density (`worseningDenseDayFloor=4` of 7): firm "book a vet visit soon" / standard "a word with your vet" / soft "keeping an eye on". Safety-class, ranked below intake-decline, both co-fire and neither dropped; template-only phrasing; `validatePhrasing` blocks reassurance AND causal. No schema (rides `findings` jsonb). Adversarial review PASS (valve equivalence, never-reassure/never-causal across 16,040 swept shapes, fake-rise guard, re-log collapse, ranking all held; one firm+more_days copy wart fixed + regression-tested). Out of scope (PM to confirm per-incident `analyze-vomit` covers it): the **week-1 absolute-burden** case (no prior window) — see B-077. |
| Font decision: `fontBody` / `fontDisplay` typefaces (was: recommend Inter + a humanist display). | Post-Step 7 / design-system PR 2 | **Resolved 2026-06-07 — Geist (body) + Newsreader (display).** Set by the PM-approved design-system v1.2 migration plan (§4), superseding the interim Inter recommendation. Wired in design-system PR 2: `expo-google-fonts` (`@expo-google-fonts/geist` + `/newsreader`) + `expo-font`, a font-load gate at the app entry (`app/_layout.tsx`), tokens `fontBody`→`'Geist'` (+ `Geist-Medium`/`Geist-SemiBold` weight aliases) and `fontDisplay`→`'Newsreader'`, and the Newsreader display face applied to the **AI Signal headline only** (`textSignal` 26 / 1.3, tracking −0.3, weight 400). The app-wide Geist body rollout is the open follow-up (B-061 + the Open Question above). |
| AI Signal: which model, prompt structure, rate limiting and caching strategy? | Step 10: AI Signal | **Resolved 2026-05-31 (B-045 Step 2).** **Model:** Haiku 4.5 (`claude-haiku-4-5`) — phrasing an already-true structured finding into one sentence is not load-bearing reasoning (that's deterministic in detection.ts) and has a templated fallback, so cheapest-capable wins (B-001); cf. Sonnet 4.6 for vision/extraction where accuracy IS load-bearing. **Prompt structure:** architecture B — single `phrase_insight` tool (`tool_choice` forced) returning one sentence, tight system prompt encoding voice + the never-reassure/associational guardrails; the model gets only the finding's structured payload, never a raw event log. `validatePhrasing` rejects any drift back to the deterministic template. **Caching:** the ordered findings SET in `ai_signals.findings jsonb` (migration 015) + `signal_text` for back-compat; 24h TTL; delete-then-insert per pet (last-write-wins). **Rate limiting:** per-finding phrasing calls capped by the §3.2 visible-card cap (~4) and bounded by the 24h cache + client-side regen debounce (daily-expiry + debounced-after-log); the home reads cache only, never a live LLM call. (Client trigger/debounce wiring is Step 3.) |
| Food library redesign — which Claude vision model for `extract-food-from-photo` Edge Function? Sonnet 4.6 vs Haiku 4.5. Trade-off is per-call cost vs ingredient-extraction accuracy. | Food library Edge Function | **Resolved May 2026 — Sonnet 4.6.** Unanimous team vote. Extraction fires once per food; cost is bounded. Accuracy of ingredient extraction is load-bearing for the confirm-screen UX and Dr. Chen's clinical trust in the data. |
| Food library redesign — where does image compression run? Client (`expo-image-manipulator`) is preferred; Edge Function defensive resize is the fallback. Decide before upload code ships. | Food library upload flow | **Resolved May 2026 — Client-only.** Unanimous team vote. 1600px/q75 enforced in client code via `expo-image-manipulator`. Defensive resize in Edge Function adds Deno image-processing dependency with no quality upside for a single upload path. Revisit if a web upload path is added post-MVP. |
| `nyx-food-photos` Supabase Storage bucket — same SQL-vs-dashboard RLS landmine as `nyx-pet-photos`. Must be created via dashboard UI, not migration SQL. | Food library Edge Function & upload | **Resolved May 2026 — PM created bucket via dashboard UI between sessions. RLS policies applied via migration 008_food_photos_rls.sql (PR #17).** |
| Event timestamp uncertainty (B-010): single precise `occurred_at` vs explicit witnessed-vs-discovered modelling. Options A (boolean `occurred_at_witnessed` flag), B (nullable `occurred_at_earliest`/`occurred_at_latest` window + derived point), C (`occurred_at_confidence` enum + window). | Step 9: Vet report; Step 10: AI Signal correlation windows | **Resolved 2026-05-23 — Option C.** `occurred_at_confidence` enum (`witnessed`/`estimated`/`window`) + nullable `occurred_at_earliest`/`occurred_at_latest`; `occurred_at` retained as derived point for backward-compatible reads. Team rec was C-with-B-fallback; PM chose C outright. Rationale: only C represents both real triggering incidents honestly (the ~4am point-estimate and the 2–4pm window); C renders down to a point view while B can never render up (a future B→C upgrade would be permanently blind to found-point events logged under B); and the ~65% discovered majority requires the found path to be both cheap and honest, which only C delivers. Confidence is **derived from the affordance the user touches, never asked as a quiz** — witnessed stays one-tap (Principle 1 / Jordan's hard line). Confidence is orthogonal to `occurred_at_source` — do NOT auto-set it from EXIF (a photo of discovered vomit is stamped at discovery, not occurrence). Remaining B-010 work (tracked in `docs/backlog.md`): quick-log UX sketch → schema migration PR (own PR, additive/non-destructive, Migration Safety Pre-flight clean) → vet-report rendering → Step 10 correlation weighting. **Implementation addendum (2026-05-24):** UX = **Direction 2** (explicit "Saw it / Found it" pills, witnessed preset; found panel is a single 3-mode selector — Sometime before / Around a time / Between two times — all reachable). **Legacy backfill = NULL** (PM hand-populates the small set, rather than blanket-asserting `witnessed`); column nullable, no default. **Windowed `occurred_at` = the latest edge, NOT a midpoint** (a real entered value; window fields are the source of truth; every display surface must render the window/estimate, never the bare point, when confidence ≠ witnessed). Shipped: migration #45 + capture UI #48 (both merged; migration applied to live DB). PR C (detail + edit display surfaces) is next. |

---

## What Good Looks Like

**Design benchmark:** Calm, Linear, Oura. Not generic health apps. Not anything that looks functional rather than built to be used. When in doubt: would a designer at Calm be proud of this screen?

**Engineering benchmark:** An app a senior React Native engineer would not be embarrassed by. Clean separation of concerns, no magic, no shortcuts that become blockers in two sprints. When in doubt: would a senior engineer at Linear be comfortable maintaining this code?

If the answer to either question is uncertain, it needs more work before it ships.

---

## Version History

Most recent three versions only. Older entries archived at `docs/CLAUDE-md-history.md`. The three "Future Work / Ideas" items added to CLAUDE.md in v1.15 (detail-screen pattern for History events, Food Library as a top-level nav item, smarter library deletes) have moved to `docs/backlog.md` as B-003/B-004/B-005 — that file is now the single home for deferred items.

| Version | Date | Summary |
|---|---|---|
| v1.22 | 2026-06-07 | **Workflow tune-up — runtime un-lie + git first aid + `/handoff`.** PM-initiated review of the workflow files. (1) **Corrected stale runtime framing:** STATUS.md recorded the graduation to TestFlight + live `eas update` OTA (2026-06-07, PR #90), but CLAUDE.md + `docs/dev-handoff-runbook.md` still called Runtime A "blocked on Apple enrollment" / `eas update` "moot" — so every Dev Handoff was steering the PM to the wrong runtime. Re-framed to match the PM's actual workflow: **Runtime B (Metro + tunnel) is the per-push default for one-off PR testing; Runtime A (`eas update` OTA → TestFlight) is now live and is a deliberate, separate "cut a new build" session, not per-push.** Updated the Secrets Register Apple Developer row to ✓ enrolled. (2) **New `docs/git-first-aid.md`** — symptom→exact-command guide keyed by the literal git error message (divergent-branches, "local changes would be overwritten," `--ff-only` failing after a squash-merge, detached HEAD, accidental commit on `main`, nuclear reset), grounded in the read-only-`claude/…`-branch reality. Linked from CLAUDE.md's git rule. (3) **New `/handoff` command** (`.claude/commands/handoff.md`) — lightweight Dev Handoff (runtime block + Manual QA only) for mid-session pushes, without the full `/wrap` ceremony. (4) **`/kickoff` hardened** with a one-line doc-drift check (flag when STATUS.md → Runtime in Use disagrees with the handoff default) — would have caught the stale-runtime bug at session start. (5) **Killed the 2-PR-per-session pattern** (PM-raised): the STATUS.md "Recent Sessions" entry was phrased as a *post-merge record* (`merged to main (#105)`), which can't be written until after the feature PR merges — so it always landed as a second, status-only PR. New **One PR per session** rule (CLAUDE.md Git Workflow + `/wrap` Step 3/Rules): the wrap's STATUS/doc updates ride in the session's *existing* PR, committed to its branch before merge, with the entry phrased as `shipped via #<n>` (PR number is assigned at draft creation). Lone exception: a work PR already merged mid-session. Process/meta only; no build-phase change, no code touched. |
| v1.23 | 2026-06-12 | **Two new review subagents.** PM asked which subagents were worth layering in beyond `code-reviewer`/`adversarial-reviewer`; team recommendation ratified. (1) **`rls-privacy-reviewer`** — the access-control sibling of `adversarial-reviewer` (that one breaks the statistics, this one breaks the boundaries): attacks share tokens / public links, service-role Edge Function queries (confused-deputy), RLS policies, Storage signed URLs, the B-039 deletion cascade, B-041 export, and analytics PII; reports the concrete attack tried and whether the boundary held; names dashboard-only config as explicit PM checks rather than assuming safe. Gives the Trust & Safety lens its first reliable backstop, timed for Step 9's share token — the first deliberately unauthenticated path to pet health data. (2) **`vet-report-cold-read`** — Dr. Chen reading the *rendered* report artifact in an isolated context, exactly as the real consumer does (60-second scan → trust pass → source cross-check, in that order); refuses to review generation code in place of a rendered artifact (INSUFFICIENT). Routing table + persona backstop notes updated in `docs/personas.md`. Deliberately NOT added (over-process): design-review, QA-AC-checker, migration-reviewer, doc-drift subagents — all already covered by personas, rituals, or skills. Process/meta only; no build-phase change, no app code. |
| v1.24 | 2026-06-14 | **Next-step suggestions must surface parallelism + efficiencies.** PM directive after the B-023 PR 1 session: don't present a linear plan when the work can fan out. Codified in three places so it fires reliably, not when remembered: `/wrap` Step 7 (Next Session Kickoff) now requires calling out independent tracks (disjoint files, no logical dependency) that can run **concurrently as separate sessions/branches** — naming the one shared-file collision to expect (e.g. `STATUS.md` at wrap) — plus any single decision that unblocks multiple tracks, batchable work, and ready-to-run vs. gated-on-a-decision items; CLAUDE.md's **Next Session Kickoff** format gains a **Parallel / efficiencies** block, and **Recommended Next Steps** now requires the same. Surfaced when the PM noticed B-090 and B-023 PR 2 were independently parallelizable and asked that such efficiencies always be flagged. Process/meta only; no build-phase change, no code. |
