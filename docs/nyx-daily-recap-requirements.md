# Nyx — The Daily Recap
**Version:** 1.0 — BUILD-READY (2026-08-15; every decision PM-ruled or PM-delegated same day) | **Track:** B-760 (the daily-recap chunk) | **Linear:** project **"The Daily Recap"** (team Culprit) — DR-0=CUL-20 · DR-1=CUL-23 · DR-2=CUL-25 · DR-3=CUL-26 · DR-4=CUL-21 · DR-5=CUL-22 · DR-6=CUL-24 · DR-7=CUL-27, blocking relations set (DR-0→DR-1→{DR-2,DR-3}; DR-5→DR-6; all→DR-7; DR-4 parallel-safe); repo file canonical, project description mirrors it.

**Design authority:** `docs/culprit-daily-recap-mockups.html` (the current-proposal page 🌙 — frames replace in place; it is the design lock for every surface here). Deliberation record: `docs/culprit-notifications-mockups.html` (archive, rounds 1–5). Umbrella spec: `docs/nyx-notifications-v2-requirements.md` (the portfolio iteration + NV-G8/NV-G9 live there; this file owns the recap build). Foundation: `docs/nyx-notification-foundation-requirements.md` (Part 1 — shipped; its G1–G6 spine and D1–D4 rulings bind every surface below).

---

## 0. Decision record — CLOSED

| # | Decision | Ruling |
|---|---|---|
| R-1 | Register | **Night, always-night** — PM-ruled ("the evening ritual/night register"); always-night taken under the delegation (one identity; one snapshot set; visibly distinct from History). Brand register rule amended (`culprit-in-app-brand-requirements.md` §1.2, 2026-08-15). |
| R-2 | The screen's rendering | **The day spine** — the timeline IS the event list (PM wave-2 direction, "beautiful and informative"). |
| R-3 | Content contract | **Record facts + doorways only** — no verdicts, scores, AI, severity, or reassurance; B-670's factual-strip carve-out is the spec for the strips; the med strip's four forbidden things and the trial card's register apply verbatim. |
| R-4 | Midnight handoff (B-672) | **Fire-day anchor + one-day clamp** — taken under the delegation, per the standing recommendation. |
| R-5 | Home presence (B-673) | **TodayZone v2** — PM-confirmed ("I like that this screen is reachable in-app as well"). The zone evolves (recap band + capped rows); the Signal still leads Home. |
| R-6 | The offer | **In-context banner on in-app visits** + value-moment re-surfacing (trial/med-course start, once each); 30-day quiet on dismiss; primer-gated always. |
| R-7 | Primer | **Full-screen, c2 ("The day, read back to you."), clean** — timeline miniature carries the whole pitch; the notification chip + fine-print block are killed (PM); one honest line survives in the body ("Your phone will ask once — change it any time"); the lock-screen privacy promise relocates to the notification-settings screen copy. |
| R-8 | Pet-name opt-in (B-671) | **Ships in this chunk** (delegated) — `use_pet_name` opt-in, single-pet accounts only; neutral stays the default; lock-screen body neutral unless opted in. |
| R-9 | Naming | The feature is the **Daily Recap** (PM's language; page/track name). The screen's nav title stays **"Today"**; the category remains `daily_summary` (no schema rename — cosmetic renames of a live category key buy nothing). |

**Out of this chunk's scope:** the notification portfolio (types #2/#3 — umbrella spec §5.5, slate awaiting reaction); the Signal envelope; B-288.

---

## 1. The notification + the anchor (DR-0)

The 9pm local notification is **shipped v1, unchanged** (static G1 body, one per account, off by default, primer-gated). This chunk adds the **fire-day anchor (R-4)**:

- The scheduled notification's payload carries its **fire-day identity** (the local day it fired for — computed at schedule time in the device zone, B-421's one day counter).
- `lib/notificationRouting` passes the payload instant through; `/day-summary` hands it to `buildDaySummary` as `nowMs`.
- **Clamp:** if the fired-for day is more than 1 local day older than now → render today (a stale tap never opens an old day).
- The screen's date header names the rendered day (already true), making the anchored render self-explaining.
- Tests: B-514-honest fixtures (local-component instants; non-UTC CI); the clamp boundary (tap at 12:40am renders yesterday; tap 2 days later renders today); `routeDedup` unchanged.

## 2. The screen — the Daily Recap (DR-1)

Night ground (R-1): `colorBrandNight` ground, `colorBrandNightElevated` cards, `colorTextOnNight`/`-Muted` text, `colorMoonlight` for the serif lead, `colorEventSymptomOnNight` for symptom accents, `colorBorderOnNight` hairlines. **Mint the med-slate night sibling token** (`colorEventMedicationOnNight`, drawn `#93ADCB` in the mock — verify AA on `#251F57`/`#13112E` at build). Always-night: no time-of-day branching.

Top to bottom (design lock = the mock's four state frames):

1. **Date header** — the rendered (anchored) day.
2. **The lead line (C0)** — one count-anchored serif sentence, picked by **fixed precedence**: symptom events first → trial facts → the day's counts. Never a verdict word, no arrows, no percentages (the Change Contract grammar). Deterministic and unit-tested.
3. **Count chips (C2)** — per-category counts; symptom chip in the night symptom rose; never totalled.
4. **The day spine (C1)** — the timeline-as-list: time labels (device-local), category-tinted nodes on a connecting thread, event title + intake/adherence beside each node (via the existing `describeDayEvent` mapper — one mapper, all surfaces), optional **fact-only sub-line** ("Trial diet", "Photo attached"), chevron; **every node routes to `/event/[id]`**. Earliest-first. Row display inherits every mapper rule (refusal reads "refused"; null intake shows no qualifier).
5. **The trial strip (C3)** — renders only while `isTrialRunning`: trial name + `Day N of M` + today's trial-diet meal count, **read from `lib/dietTrial.ts` predicates only** (never a re-derivation); doors to the trial card. No viability/coverage/adherence language.
6. **The med course strip (C4)** — one line per active course with a course fact (`dose X of Y logged today` via `dosesTowardTarget`); doors to the med card; the §7 collapse rule inherited; no `missed`/`due`/compliance bar.
7. **The forward line (C5)** — one closing fact when a real tomorrow-fact exists (`Tomorrow is day 13 of the trial.`); absent otherwise, never manufactured.

**States:** zero-log (copy verbatim from shipped v1 — G2 record-fact register, pet-named single-pet, `Log an event` accent link as the only door), error (retry, never a false-empty), multi-pet (sectioned per pet, active first, per-pet spines, per-pet zero-log lines). All four on the night ground per the mock.

**Structure note:** the pure builder (`lib/daySummary.ts`) grows the lead-line/chips/strips/forward models as pure derivations (testable, no I/O); the screen renders them. The spine is a new presentational component (`components/recap/DaySpine.tsx` or similar); the horizontal lane (DR-2) shares its dot/tint constants so the two sizes cannot drift.

## 3. TodayZone v2 (DR-2)

The zone keeps its job and gains the recap band where its header sat:

- **Band:** `TODAY SO FAR` label · the **compact day lane** (horizontal; dots at real times over a 6a→12a track; same tints/constants as the spine) · an honest count line (`2 meals · 1 dose logged`) · **`Full day ›`** → `/day-summary`. The capped event rows continue beneath, unchanged.
- The old header door (`openHistoryToday`) is replaced by the band's `Full day ›`; History remains one tab away.
- **Zero-log:** the lane renders empty beside TodayZone's existing empty nudge — nothing manufactured.
- **Principle 3 audit line (for the PR):** the Signal still leads Home; the band is facts + one door; no badge, no verdicts, no new card.

## 4. The offer (DR-3)

On an **in-app** arrival at `/day-summary` (never a notification-tap arrival) while `daily_summary` is off and OS permission is not denied: the night-ground banner (*"Culprit can let you know each evening when the day's record is ready."* / `Turn on` → the primer / `Not now`). Dismiss writes a local quiet-until marker (30 days). **Value-moment re-surfacing:** one additional offer at trial-start and med-course-start (once each, ever — their own markers). OS-denied accounts never see it (Settings owns that recovery). The system prompt is unreachable from the banner except through the primer.

## 5. The primer (DR-4)

Full-screen (modal), every invocation (settings toggle, the offer, future categories via the per-category descriptor):

- **Hero:** the timeline miniature (`EVENING SUMMARY` micro-label · "Biscuit's day, gathered up." mini-lead · a 3-node mini-spine of a warm **generic** day — never the owner's data; renders pre-logging). Simplified but only real product language.
- **Headline (R-7):** `The day, read back to you.`
- **Body:** `One calm notification each evening, when the day's record is ready to read. Your phone will ask once — change it any time.` (The second sentence is the surviving consent-honesty line — B-666 resolved here.)
- **CTAs:** `Turn on` (→ the one OS prompt) / `Not now` (spends nothing; scrim-dismiss same).
- **Killed per PM:** the notification preview chip + the fine-print block. **Relocated, not deleted:** the privacy promise ("your lock screen never shows what's in the record") moves to `app/settings/notifications.tsx` copy — stated where an owner examines the feature, no longer the pitch.
- Fresh-decliner copy fix on the OS-denied settings state (one clause acknowledging the never-visited-Settings path) rides this PR.
- Multi-pet: the mini-lead goes neutral ("The day, gathered up.").

## 6. The warmth opt-in (DR-5 migration → DR-6 feature)

`notification_preferences.use_pet_name boolean NOT NULL DEFAULT false` (additive migration, own PR, pre-flight: reversible `DROP COLUMN`, non-destructive, no backfill). Feature: single-pet accounts see a settings row under the Daily summary toggle ("Use Biscuit's name in notifications"); on = the scheduled body becomes `Biscuit's day is ready to read.` (title `Biscuit's day`); multi-pet accounts never see the row and stay neutral by construction; sign-out wipe + reconcile carry it. T&S gate at the PR (the involuntary-public tradeoff is the owner's explicit choice; default stays neutral).

## 7. PR plan (= the Linear issues)

| # | PR | Scope | Gates |
|---|---|---|---|
| DR-0 | The fire-day anchor | §1 — payload identity, `nowMs` threading, clamp, tests | `code-reviewer`; B-514 fixtures; non-UTC CI |
| DR-1 | The Daily Recap screen | §2 — night register + spine + lead/chips/strips/forward + 4 states + the night med token | **Design lock = the mock**; `clinical-guardrails` (G2/G3 + the banned lists); `pm-feature-review`; Dr. Chen in-context read; night AA pass |
| DR-2 | TodayZone v2 | §3 — the band + lane + door retarget | `pm-feature-review` (Principle 3); shared lane/spine constants |
| DR-3 | The offer | §4 — banner + markers + value-moment re-surfacing | `nyx-voice`; consent-path test (banner never reaches the OS prompt directly) |
| DR-4 | The primer | §5 — full-screen c2, mini-spine hero, descriptor registry, privacy-promise relocation, fresh-decliner fix | Designer; `nyx-voice`; G4 re-check |
| DR-5 | Prefs migration | §6 — `use_pet_name` column | Migration pre-flight; schema-isolation (own PR) |
| DR-6 | The named body | §6 — settings row + scheduled-body swap + wipe/reconcile | T&S; `nyx-voice` |
| DR-7 | Finish pass | Copy sweep (`nyx-voice` + `clinical-guardrails` over every string), `pm-feature-review` both flows, Part-1 on-device checklist closed + re-run over v2, §8 AC verified | The DoD, full |

Blocking: DR-0 → DR-1 → {DR-2, DR-3}; DR-5 → DR-6; everything → DR-7. DR-4 is parallel-safe from the start.

## 8. Acceptance criteria (the chunk is done =)

1. A 9pm notification tapped at 12:40am opens the fired-for day; a ≥2-day-old tap opens today; the header names the rendered day.
2. The recap renders the spine + lead + chips + strips + forward line from existing predicates only; no string on the surface is a verdict; the four states match the mock; always-night; AA passes on night.
3. TodayZone v2's band and the recap spine share one visual language; `Full day ›` lands on the recap; the Signal still leads Home.
4. The offer appears only on in-app visits in the eligible state, quiets for 30 days on dismiss, re-surfaces once per value moment, and can only reach the OS prompt through the primer.
5. The primer is exactly the mock: hero + c2 + one body paragraph + CTAs; declining spends nothing; the privacy promise reads in notification settings.
6. `use_pet_name` on → named body on a single-pet account; off/multi-pet → neutral; wiped on sign-out.
7. `tsc` + jest + non-UTC CI green; Part-1 on-device checklist (tap-routing, OS-revocation reconcile, sign-out cancellation) closed and re-verified over v2.

## 9. Standing rules carried (not restated)

Part 1's G1–G6 verbatim; NV-G8/NV-G9 (umbrella spec §5.5) for any string on any notification body; the brand register rule as amended (§1.2); Principle 4's cap architecture (the recap is a consented schedule under D1's carve-out; the budget point unchanged).
