# Nyx Notification Foundation — Part 1 Requirements
**Version:** 1.0 | **Date:** 2026-08-02 | **Status:** Build-ready for PRs 1–2; PRs 3–4 are mock-gated (§10). Decisions D1–D4 PM-ratified 2026-08-02 (same-day kickoff convening).

**Read with:** `docs/logging-capture-discovery.md` (§4 Tier-1 is the platform evidence this spec builds on), `docs/nyx-settings-requirements.md` §5 (the mocked screen this un-mocks), `docs/nyx-design-principles-v1_0.md` §4–§5. Backlog: **B-661** (this track — filed as B-658/B-659, renumbered at wrap; those IDs were taken on `main` first by #557/#558), and the rows it re-points: B-288, B-227, B-015, B-543, B-662.

---

## 0. Decision record (all PM-ratified 2026-08-02)

| # | Decision | Ruling |
|---|---|---|
| **D1** | Is an owner-configured scheduled notification a "nudge" under Principle 4's one-per-day cap? | **Full carve-out (the discovery §9 proposal).** The cap governs *unsolicited* nudges; a schedule the owner explicitly configured is a tool, not a nudge. Non-negotiable guardrails that make the carve-out safe: **per-schedule opt-in** (nothing fires that wasn't individually turned on), **fail-safe silence** (an unanswered/unfired notification records nothing — B-156 G1 generalized), **self-pruning** (a schedule ignored 3 consecutive days proposes its own pause; mechanism ships with B-288, the hook ships here §5.4), and a **per-account budget** (§5.4). The Designer's dissent (channel trust is one bucket regardless of consent) is recorded, not erased — it is why the budget is per-*account*, why everything defaults **off**, and why the self-pruning hook exists. Resolves the CLAUDE.md Open Question dated 2026-07-10; **unblocks B-288**. Requires a Tier-2 `design-principles.md` §4 edit (flagged, PM to confirm the wording — §11). |
| **D2** | Delivery architecture for Part 1 | **Local-first.** Everything in Part 1 ships on `expo-notifications` local scheduling: no push provider, no token registry, no server scheduler, no stored timezone, no APNs entitlement. The long-open "push notification provider?" question **narrows to server-initiated notifications only** (Signal alerts, household activity — Part 2) and is decided when the first of those is built. `plugins/withoutPushEntitlement.js` **stays** until Part 2 — its own header already documents its retirement condition. |
| **D3** | What the 9pm notification says and opens | **Safe body + a dedicated Day Summary screen.** The notification body **never asserts record contents** (iOS runs no JS at local-notification fire time, so any content-bearing body is computed early and can misstate the record — a stale "no incidents" on a lock screen is reassurance from a wrong record, forbidden by `clinical-guardrails`). The body is warm and specific about the *ritual*, not the record; the tap opens a Day Summary surface that renders **live** truth. **One notification per account, covering all pets** — three pets must never mean three 9pm pings. |
| **D4** | Where preferences live | **Server table + local mirror.** `notification_preferences` (per-account rows, RLS default-deny, own schema PR per the migration rule, local mirror per the house pattern). Survives reinstall, syncs across devices, and is the substrate household (B-292) and server push (Part 2) will need anyway. |

**Two scope exclusions that are rulings, not omissions:**
- **No medication reminders anywhere in Part 1.** The mocked settings screen's D7 safety gate carries forward verbatim: an owner who relies on a med reminder that doesn't fire (or fires and is missed) is the worst-case hazard. Med/care reminders are B-227's build, with their own safety framing.
- **Part 1 writes nothing.** The daily summary is read-only. Actionable notifications (buttons that log) are B-288's build; `logged_via='notification'` (B-289, live) is waiting for them.

---

## 1. What Part 1 is

The **fundamental building blocks** for every future notification workflow (med reminders, feeding confirmations, vet-appointment reminders), plus the **first shipped notification** — a fixed-time 9pm daily summary of the pet's day — to prove the pipeline end to end:

1. **The scheduling primitive** — `lib/notifications.ts`: schedule / cancel / reconcile, the category registry, budget enforcement, wipe-path cancellation.
2. **The consent model** — OS permission ≠ product opt-in; a pre-permission primer; the settings screen un-mocked into real per-category toggles with honest states.
3. **The preferences substrate** — `notification_preferences` + local mirror + sync.
4. **The daily summary** — `lib/daySummary.ts` (pure, tested) + the Day Summary screen + the 9pm scheduled notification, **off by default**.

What it is not: B-288 (confirmations), B-227 (configurable reminders), B-015 (post-meal intake ask), B-543 (trial intake push), B-662 (vet-appt reminders), remote push, Live Activities, household. All of those *consume* this foundation; none ship in it.

---

## 2. The consent model (§ for PR 3)

Two independent gates, never conflated:

- **OS permission** — granted once, revocable in iOS Settings. We get **one** system prompt per install, so it is never fired at launch, at onboarding, or unprompted. It fires only from an **explicit owner intent**: turning a category toggle on. Sequence: toggle tap → **primer sheet** (what this category sends, how often, "you can change this any time") → system prompt. If the owner declines the primer, the system prompt is never spent.
- **Product opt-in** — the per-category toggle backed by `notification_preferences`. Every category defaults **off** (D1's per-schedule opt-in guardrail).

**Honest states (Principle 5, and the D7 lineage):** a toggle that is on while OS permission is denied is a lie with a safety cost. The settings screen renders three states truthfully: (a) permission never asked — toggles interactive, primer flow on first enable; (b) permission granted — toggles live; (c) permission denied at the OS level — categories render visibly inert with one line and a deep link to iOS Settings ("Notifications are off for Culprit in iOS Settings — turn them on there and this switch comes back to life"). Copy at mock round, `nyx-voice`-reviewed.

**Provisional authorization is deliberately not used.** Quiet delivery would land the 9pm summary silently in Notification Center — a feature the owner opted into that appears to not work. Full alert authorization, asked properly once, is the honest shape.

**Android:** `expo-notifications` local scheduling works on Android; the primitive creates the notification channel correctly (channel = category), but iOS is the QA target per the wedge. No Android-specific UI in Part 1.

---

## 3. The scheduling primitive — `lib/notifications.ts` (§ for PR 1)

- **API surface:** `ensurePermission()` (status read + request, never auto-fires the prompt), `scheduleCategory(category)`, `cancelCategory(category)`, `reconcileSchedules()` — plus a **category registry** (id, trigger shape, deep-link route, budget weight). v1 registers exactly one category: `daily_summary`.
- **Reconcile-on-start is the integrity mechanism:** on app foreground, scheduled OS notifications are diffed against live preferences + permission state, and drift is repaired in whichever direction is safe (pref off / permission revoked → cancel; pref on + permission granted + nothing scheduled → schedule). No schedule is ever trusted to still exist.
- **Trigger:** daily calendar trigger at **21:00 device-local**, fixed in v1 (PM's call — "some fixed time like 9pm for now"). Wall-clock scheduling makes DST and travel free. An owner-configurable time is a deliberate later nicety (§9).
- **Wipe path (Trust & Safety, non-negotiable):** `wipeLocalSession` gains a `cancelAllScheduledNotifications()` step. A 9pm summary that fires after sign-out on a shared device names the previous account's pet on the lock screen — same leak class the local-wipe rules exist for. Ships in PR 1 **with a test**, per the CLAUDE.md rule that account state outside SQLite goes in `wipeLocalSession` by name, never by omission.
- **Budget enforcement point (D1):** the registry computes scheduled-notifications-per-account; `scheduleCategory` refuses past the budget. v1's budget is trivially satisfied (one category) — the *number* is deliberately not chosen here; B-288's scoping owns it (§9). What Part 1 owes is the enforcement point existing, so B-288 inherits a mechanism rather than a convention.
- **Self-pruning hook (D1):** the primitive records last-interaction-per-category (notification tapped / summary opened); the "3 ignored days proposes a pause" behavior ships with B-288, but the data it needs starts accruing here.

---

## 4. Preferences — schema + mirror (§ for PR 2, own schema PR)

```sql
create table notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid references pets(id) on delete cascade,   -- NULL = account-wide (the v1 shape)
  category text not null check (category in ('daily_summary')),
  enabled boolean not null default false,
  fire_local_time text not null default '21:00',       -- wall-clock HH:MM, interpreted on-device
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- **Uniqueness:** one row per (user, pet, category) — implemented as a partial unique pair (index on `(user_id, category)` where `pet_id is null`, plus `(user_id, pet_id, category)` where not null), since a plain UNIQUE treats NULLs as distinct.
- **`fire_local_time` is wall-clock text on purpose** — a deliberate, documented exception to "all timestamps UTC": a 9pm ritual is a wall-clock fact, not an instant. Storing an instant would drift on DST/travel; the device interprets the wall-clock at schedule time. This mirrors why local notifications don't need a server timezone column. It is *not* a timestamp column and must never be compared to one.
- **RLS:** default-deny; owner-only (`user_id = auth.uid()`) for select/insert/update. No delete grant — a preference is turned off, not erased (consistency with the soft-delete posture; also keeps the audit of "was this ever on").
- **Category CHECK is the enum:** adding a category (B-288's, B-227's) is an additive migration — explicit, per the schema discipline.
- **Local mirror:** DDL in a `NOTIFICATION_SCHEMA_SQL` constant, table in `LOCAL_WIPE_TABLES` (the B-424 rule — the hydration test enforces both mechanically). Sync rides the existing queue, LWW, no merge logic.
- **Migration pre-flight:** additive; rollback `DROP TABLE notification_preferences`; destructive **n**; backfill N/A (all prefs default off — absence of a row = off).

---

## 5. The daily summary (§ for PR 4)

### 5.1 The builder — `lib/daySummary.ts`
Pure function over local SQLite: today's meals (+ intake ratings), treats, medication doses, incident events (vomit/stool/symptom), weight checks, active-trial context (via the **existing** `lib/dietTrial.ts` predicates — never a re-derivation) and med-course context (via `lib/medStrip.ts`'s shapes where reusable). Rules it inherits by name:
- **Day boundary = local midnight** via B-421's one counter. This spec does not mint a new day-math implementation; if the builder needs a day index, it imports the existing one.
- **Timezone-honest fixtures** (B-514): tests build instants from local components or pass explicit zones; the non-UTC CI job covers the suite.
- **Soft deletes respected** (`deleted_at is null` on every read).

### 5.2 The notification
- **Body never asserts record contents (D3).** Shape: warm, ritual-specific, pet-named where safe — single-pet account: "Biscuit's day is ready to read." Multi-pet account: neutral ("Today's record is ready to read") — which is also the lock-screen-privacy-friendly shape. Exact strings at mock round; `nyx-voice` + `clinical-guardrails` both gate them.
- **Fires whether or not anything was logged.** An opted-in 9pm ritual that randomly skips days teaches the owner the channel is unreliable. The zero-log day is handled by the *surface* (§5.3), not by silence. (The body claims nothing, so it is never wrong.)
- **Tap → deep link** to the Day Summary screen. The link lands behind the auth gate like any deep link (the B-280 recovery-gate work already hardened this path); cold-start tap routes after hydration.

### 5.3 The Day Summary screen
- A dedicated surface (route: `/day-summary`), **not** a rival Home: it answers exactly one question — "what happened in {pet}'s record today" — and every element is a doorway into the existing detail surfaces (event detail, trial card, med card). No AI, no verdicts, no score.
- **Multi-pet:** one screen, sectioned per pet, active pet first (D3's one-notification-per-account consequence).
- **The zero-log day is a designed state** (Principle 5), and its copy is bound by the G2 lineage: absence is framed as **record state, never a wellness verdict** — no "all quiet," no "nothing happened," no reassurance. Direction: name what the record is missing and offer the door ("Nothing made it into the record today — if something happened, it takes about ten seconds to add"). Exact copy at mock round with `clinical-guardrails` in the room.
- **Trial/med context renders through the existing components' rules** — the trial card's viability states, the med strip's four forbidden things (`missed` / `due` / compliance bar / cheery-line-over-refusals) apply verbatim here. A summary is a new *surface*, never a new *register*.

### 5.4 Budget + interaction accounting
Opening the summary (or tapping the notification) records last-interaction for the self-pruning hook (§3). The per-account budget counts this schedule as 1.

---

## 6. Copy & safety spine (every PR; the G-rules)

- **G1 — the body never asserts record contents.** No counts, no "no incidents," no med names on the lock screen. (D3.)
- **G2 — absence is record-framed, never a verdict.** Inherited from the diet-trial ruling; applies to the zero-log state and any per-section empty state.
- **G3 — never reassure.** The summary describes and doors; it does not conclude. n=1 rules apply to any per-incident content it surfaces (it links to the existing AI-read surfaces; it does not re-render their conclusions in summary form).
- **G4 — no medication-reminder implication anywhere.** The settings screen's D7 gate survives the un-mocking: no armed med reminder exists in Part 1, and no copy implies one.
- **G5 — fail-safe silence.** A notification that didn't fire, wasn't granted, or wasn't tapped records nothing and retries nothing loudly. Drift is repaired silently by reconcile (§3); the owner is never nagged about notifications by notifications.
- **G6 — everything defaults off.** No category is enabled by migration, onboarding, or upgrade.

---

## 7. PR plan

| PR | What | Gates |
|---|---|---|
| **1** | The primitive — `expo-notifications` dependency, `lib/notifications.ts` (registry, schedule/cancel/reconcile, budget point, interaction accounting), `wipeLocalSession` cancellation + test. No user-visible change. | `code-reviewer`; Engineer DoD; tests |
| **2** | Schema — migration (`notification_preferences` + RLS) applied via MCP; local mirror (`NOTIFICATION_SCHEMA_SQL`, `LOCAL_WIPE_TABLES`); sync path. Own PR per the schema rule. | `rls-privacy-reviewer` (new RLS surface); migration pre-flight; `get_advisors` |
| **3** | Consent — primer sheet, system-prompt flow, settings screen un-mocked (real toggles, three honest states, iOS-Settings deep link). | **Mock round first**; `nyx-voice`; `clinical-guardrails` (G4); Designer |
| **4** | The summary — `lib/daySummary.ts` + `/day-summary` screen + 9pm schedule wired to the pref. | **Mock round first**; `clinical-guardrails` (G1–G3); `code-reviewer`; B-514 fixtures |
| **5** | Finish pass — `nyx-voice` over every string, `pm-feature-review`, §8 AC verification, on-device QA script. | `pm-feature-review`; Dr. Chen read of the zero-log + incident-day states |

**Mock round (before PRs 3–4):** one artifact, `docs/culprit-notifications-mockups.html` — the primer sheet, the settings screen's three states, the Day Summary screen (ordinary day / incident day / zero-log day / multi-pet), and the lock-screen notification itself. Published as an Artifact per the house rule; re-publishes to the same URL on later rounds.

**Adversarial review:** the summary builder is descriptive, not statistical — no correlation/escalation logic — so the mandatory-adversarial DoD line does not trigger. If any PR grows a threshold or a verdict, that changes and the reviewer runs.

---

## 8. Acceptance criteria (Part 1 done =)

1. Fresh install, never asked: no permission prompt fires at launch or onboarding; all categories off.
2. Toggling Daily summary on walks primer → system prompt; declining the primer spends nothing; granting scheduling a daily 21:00 local notification (verifiable via the primitive's debug read in dev).
3. The notification fires at 9pm with a body that names no record contents; tap lands on the Day Summary screen behind auth.
4. The screen renders today's meals/treats/doses/incidents live, sectioned per pet on a multi-pet account; every row doors into the existing detail surface.
5. Zero-log day: notification still fires; screen renders the designed state; no string anywhere reassures or verdicts absence.
6. OS-level revocation: settings screen shows the honest inert state with the iOS Settings door; reconcile cancels the orphaned schedule.
7. Sign-out on a shared device: no scheduled notification survives (`wipeLocalSession` test green).
8. Preferences survive reinstall via server sync; a pref toggled on device A lands on device B (LWW).
9. `tsc` + jest green, incl. the non-UTC CI job over the new day-boundary tests.

---

## 9. Deliberately deferred (with homes)

| What | Where it lives |
|---|---|
| Actionable buttons / notification-originated writes | B-288 (inherits the primitive + `logged_via='notification'`) |
| Owner-configured med/care reminders + their safety framing | B-227 (+ B-117 D3) |
| Post-meal intake ask | B-015 |
| Vet-appointment reminders (PM workflow #3 — no row existed; now filed) | **B-662** |
| Remote push: provider, tokens, server scheduler, entitlement un-strip | Part 2 (narrowed Open Question; first server-initiated notification decides it) |
| The per-account budget *number* | B-288 scoping (the enforcement point ships here) |
| Owner-configurable summary time | Later nicety; schema already carries `fire_local_time` |
| Self-pruning behavior (3 ignored days → propose pause) | B-288 (interaction data accrues from Part 1) |

---

## 10. Open items

1. **Mock round** for the primer, settings states, Day Summary screen, and the notification itself — gates PRs 3–4.
2. **Tier-2 edit, PM to confirm wording (§11):** `design-principles.md` §4 gains the D1 carve-out paragraph.
3. **Single-pet body naming** ("Biscuit's day is ready to read") puts a pet name on the lock screen — Designer + T&S to confirm at mock round that the warmth is worth the (small) exposure, or standardize on the neutral body everywhere.

## 11. Flagged Tier-2 edit (not written; awaiting PM approval)

> Proposed edit to `design-principles.md` §4 (The Nudge Is Warm, Not Nagging), appending: *"The one-per-day cap governs unsolicited nudges. A notification schedule the owner explicitly configured (a daily summary, a confirmation window) is a tool, not a nudge — governed instead by per-schedule opt-in, fail-safe silence, self-pruning, and a per-account budget. Consent does not make volume free: the budget is per-account, everything defaults off, and the test still applies — would Jordan be glad this appeared?"* (D1, PM-ratified 2026-08-02.)
