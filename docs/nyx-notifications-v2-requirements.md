# Nyx Notifications v2 — Out of Beta, the Evening Surface, and the Portfolio
**Version:** 0.9 — DRAFT pending PM rulings on §0 D-1…D-6 | **Date:** 2026-08-15 | **Status:** Requirements proposed; mock round 3 published (same artifact URL); no build until rulings land.

**Read with:** `docs/nyx-notification-foundation-requirements.md` (Part 1 — the shipped foundation this builds on; its §0 D1–D4 rulings and §6 G1–G6 spine carry forward verbatim), `docs/culprit-notifications-mockups.html` (rounds 1–3), `docs/research/2026-08-notification-ux-landscape.md` (the best-of-breed evidence, this session), `docs/logging-capture-discovery.md` §6-A (B-288's shape). Backlog: B-661 (shipped Part 1), B-666, B-670, B-671, B-672, B-673, B-674 (this track resolves or promotes each), B-288, B-662, B-015, B-543, B-227 (the consumers).

---

## 0. Decision record — OPEN, awaiting PM rulings

Presented as decision briefs (house rule, 2026-08-07). Everything below §0 is written to the team's recommendation; a different ruling edits the affected section, nothing else.

| # | Deciding | Options | Team recommendation | Consequence |
|---|---|---|---|---|
| **D-1** | What "out of beta" means — the adoption push's shape | (a) Doorway + in-context offer (A1+A2); (b) a + a one-time post-first-week Home card (A3); (c) doorway only | **(a)** — the offer fires at the moment the owner is looking at the thing the notification delivers; A3 spends Home-surface trust for reach we haven't shown we need | Unblocks B-673; G6 unchanged (nothing defaults on); A3 stays drawn in the mock as a later escalation |
| **D-2** | Primer v2 shape | (a) Sheet, sharpened — live lock-screen preview inside + calm one-shot stakes line; (b) full-screen value primer | **(a)** — the preview is the industry's one proven primer move and it is *inherently honest here* (G1 means the preview is exact); full-screen is ceremony our 2-tap flow doesn't need | Resolves B-666 (the stakes line ships inside the preview's caption); primer becomes per-category parameterized for future types |
| **D-3** | Day Summary v2 depth — how far toward a briefing | (a) Enriched, facts-only: day arc + count chips + factual trial/med strips + forward line; (b) a + the night register; (c) keep v1 rows, typography polish only | **(a)** — everything added is a record fact or a doorway, so G3/B-670's line holds; **(b) is drawn and genuinely tempting but needs a brand Tier-2 amendment** (the D8-adjacent "record stays in daylight" rule), so it's its own call | Promotes B-670's factual-strip carve-out into scope; (b) if ruled in adds a brand-doc edit + reduced-motion pass |
| **D-4** | The midnight day-handoff (B-672, filed PM decision) | (a) Fire-day anchor: tap carries the delivery instant, screen renders that day, clamped to today when >1 day stale; (b) status quo (always now-today) | **(a)** — the surface's primary entry point must not open the wrong day; the clamp kills the stale-notification confusion that made this a genuine tradeoff | The redesign's credibility gate; V2-PR-1; B-514-honest fixtures |
| **D-5** | Notification types #2 and #3 | (a) Trial milestones (local, zero schema) then vet-visit reminders (needs an upcoming-visit fact) — B-288 opens as its own track in parallel; (b) vet-visit first; (c) weekly digest first — **the research's #1 by evidence** (Oura/Whoop doorbell model, earned-unlock gate), held back only because the weekly *surface* doesn't exist and Signals v2's parked weekly review owns that queue | **(a)** — milestones serve the wedge with zero schema; the vet-visit reminder is NOT the free quick-win its row implies (`vet_visits` is past-tense — `visited_at`; an upcoming-visit fact is a schema + capture decision, and future-dating `visited_at` would pollute the report's scope cascade); (c) is genuinely strong and the PM may pull it forward — that ruling would also pull the Signals-v2 weekly-review queue item with it | Sets the build order; B-288 scoping (budget number, action-button spike) starts as its own doc |
| **D-6** | The warmth bundle (B-671) | (a) Ship "use {pet}'s name in notifications" opt-in with v2; (b) defer again | **(a)** — cheap, additive, respects the T&S default (neutral unless the owner opts in); single-pet accounts only, by construction | One `notification_preferences` flag + primer/settings copy; T&S gate at build |

**Two standing items that ride along regardless of rulings:** the Tier-2 `design-principles.md` §4 carve-out wording (Part 1 §11) is *still* awaiting PM sign-off — v2 work re-surfaces it; and the Part 1 on-device checklist (tap-routing, OS-revocation reconcile, sign-out cancellation) closes before we call anything "out of beta."

---

## 1. Where we are, and what "out of beta" actually means

### 1.1 The shipped v1 (Part 1, B-661 — all five PRs merged, device-verified fire)
One category (`daily_summary`), off by default, 9pm local, G1-safe static body, primer-guarded one-shot permission, honest settings states, `/day-summary` doorway-rows screen, wipe-path cancellation. It works. The PM's read — "seems to be working great" — matches the device verification.

### 1.2 The correction: notifications were never *in* beta
There is no `notification` flag in `app_config` and no beta-shelf row (`lib/betaFeatures.ts` carries the widget, Signal v2, and the log picker — not this). The daily summary is a plain Settings category. What makes it *feel* beta is: **(a) discovery is notification-only** — the only path to `/day-summary` is opting in via Settings and tapping the 9pm banner (B-673); **(b) it's off by default with no in-app introduction**, so the owner who never opens Settings → Notifications never learns it exists; **(c) two known rough edges** (B-672's midnight handoff; the unclosed on-device checklist). "Taking it out of beta" is therefore an **adoption push plus a finish pass**, not a flag flip — and G6 (everything defaults off) survives it untouched. Default-on would break D1's per-schedule-opt-in guardrail and is not on the table.

### 1.3 What best-of-breed does (Designer's research, 2026-08-15)
Full report: `docs/research/2026-08-notification-ux-landscape.md`. The load-bearing findings, one line each:

- **Primers work and the ask belongs at a value moment, never at launch** — Duolingo re-asks only once the user has something concrete to protect; Atoms fires the ask as the completion of the user's *own* setup; Calm's bare OS popup is the category's named anti-pattern. Health is the highest-trust notification category (~54% iOS baseline) — trust that is ours to spend or protect.
- **The winning landing-screen structure is tiered depth with no dead-ends** (Whoop): one highlight first → today against your own baseline → the raw record; plus a forward-looking line (Gentler Streak's register — which can be "do less tomorrow"). Oura's craft rule: **the notification is a doorbell, never the content** — which is our G1, arrived at independently.
- **The primer-as-privacy-promise is unclaimed territory.** Mock-notification previews are standard; *no researched app uses the preview to demonstrate what the lock screen won't say*. Because our body is static and safe by construction, we can — honestly.
- **Frequency kills** (>6 pushes/week correlates with 3.4x uninstall) — the D1 budget and 1/day unsolicited cap are competitively validated, not just principled.
- **The patterns we must refuse are named in the report's conflict table**: streak-savers, guilt win-backs, re-nag loops (MyTherapy's 10-minute loop), and Oura's "No signs" all-clear tier (reassurance from absence — our hardest ban). The industry's three most design-awarded apps (Gentler Streak, Finch, Oura) won by refusing the same levers our invariants already ban. **The invariants are the positioning.**

---

## 2. Workstream A — Adoption (the "out of beta" push)

**A1 — The in-app doorway (resolves B-673).** TodayZone's existing header-right door (today: `openHistoryToday` → History filtered to today) **retargets** to `/day-summary`, relabeled `Full day ›`. One door, richer destination: TodayZone answers "today" in capped form; the Day Summary is today, uncapped and arc-shaped; History stays one tab away for the filter/edit jobs. The alternative (keep the History door, *add* a second footer row) ships two doors to two different "today" surfaces from one zone — the confusion Principle 3 exists to prevent. Retarget is the recommendation; both are drawn. No badge, no dot, no upsell styling.

**A2 — The in-context offer (the moment-of-intent ask).** When the owner reaches `/day-summary` **in-app** (via A1 — not via a notification tap, where they've already opted in) and `daily_summary` is off and OS permission is not denied: a dismissible inline banner at the foot of the summary — *"Culprit can let you know each evening when the day's record is ready."* → `Turn on` → the existing primer → the one prompt. Dismiss = a quiet per-account "asked" marker; the banner does not return for 30 days (it is an offer, not a campaign). Denied-permission state never shows the banner (the Settings screen owns that recovery path). This is the highest-conversion, lowest-trust-cost ask available: the owner is *looking at the deliverable*.

**A2b — Value-moment re-surfacing (the research's protect-something-real logic, without the guilt).** A soft decline ("Not now" anywhere) re-surfaces the offer only at the *next new value moment* — starting a diet trial or a medication course, each **once**: one quiet line on the setup-complete surface ("During the trial, Culprit can recap each day's record at 9 — turn on?"). The owner has just configured something the recap serves; the ask completes *their* setup (the Atoms model). Never on a timer, never twice per moment, never after an OS-level deny.

**A3 — (drawn, not recommended now)** A one-time post-first-week Home card. Held: it spends Principle-3 trust for reach A1+A2 haven't yet failed to deliver. Revisit with real opt-in numbers.

**Non-negotiables carried:** no launch prompt, no onboarding prompt (the OS ask fires only from the primer, which fires only from explicit intent — Part 1 §2 verbatim). The system prompt is never reached from A2's banner without the primer in between.

---

## 3. Workstream B — Primer v2

**B1 — Live lock-screen preview inside the sheet, framed as a privacy promise.** The primer renders a miniature of the *actual* notification — real title ("Today's summary"), real body ("Today's record is ready to read."), app icon, "around 9:00 PM". Because G1 makes the body static, the preview is exact, not aspirational — and the caption states the promise no competitor makes: *"That's the whole notification — your lock screen never shows what's in {pet}'s record."* The research found mock-previews are standard but **no app uses the preview to demonstrate what the lock screen won't say**; for a health record, that's the differentiating move, and it's honest by construction.

**B2 — The one-shot stakes line (resolves B-666).** One calm sentence under the preview, replacing the current bare "Next, your phone will ask…": *"Next, your phone will ask once whether Culprit can send notifications — that answer lives in iOS Settings, and you can change it there any time."* Names the one-shot honestly without fear framing; the Not-now path stays cost-free and unmentioned (no "are you sure" pressure). `nyx-voice` gates the final string.

**B3 — Per-category parameterization.** The primer takes a category descriptor (title, body preview, cadence line) so B-288/B-662/trial-milestone launches reuse the surface instead of forking it. The category registry (Part 1 §3) grows a `primer` block per category — one source of truth for what each category "sends and how often."

**B4 — Fresh-decliner copy fix (from B-666's second half).** The OS-denied state's copy is written for the revoked-later owner; a fresh decliner who never visited iOS Settings gets one added clause acknowledging the path ("your phone asked once — turning it on again happens in iOS Settings").

**Provisional authorization stays rejected** (Part 1 §2's reasoning stands: quiet delivery makes an opted-in feature look broken).

---

## 4. Workstream C — Day Summary v2 (the evening surface)

**The contract that makes this buildable without re-litigating G3:** every element added is a **record fact or a doorway**. No verdicts, no scores, no AI reads, no viability/coverage/adherence language, no reassurance. The med strip's four forbidden things (`missed` / `due` / compliance bar / cheery-line-over-refusals) and the trial card's register apply verbatim. B-670's own carve-out — "factual day-count context only, from the existing predicates, dooring to the full card" — is the spec for C3/C4, not a loophole around it.

- **C0 — The lead line (one highlight first — Whoop's structure, our register).** One count-anchored, never-verdicted sentence opens the screen, picked by a **deterministic precedence** (symptom events first — safety leads, the Principle-3 lineage; then trial facts; then the day's counts): "One vomit in Biscuit's record today, 9:15 AM." / "Day 12 of the Whitefish trial — 3 meals logged." Curation by fixed precedence is not a verdict (the same rule Home's safety-leads ordering already embodies); the sentence never appraises, only names. The Change Contract's grammar applies (counts and times, no verdict words, no arrows).
- **C1 — The day arc.** A horizontal time lane (6am → midnight, clipped to real content) with category-tinted dots per event — the SR-1 receipt visual language reused, not a new chart species. Answers "what did today look like" in one glance; taps pass through to the rows below.
- **C2 — Count chips.** `3 meals · 1 dose · 1 symptom` under the date header. Facts, tinted by category, never totalled into a score.
- **C3 — Trial strip (factual).** `Day 12 of 28 · Whitefish trial` + today's trial-diet meal count → doors to the trial card. Reads `lib/dietTrial.ts` only. Renders only while `isTrialRunning`.
- **C4 — Med course strip (factual).** `Amoxicillin · dose 5 of 14 logged today` → doors to the med card. Reads `dosesTowardTarget` only. One line per active course, the §7 collapse rule inherited.
- **C5 — The forward line.** One closing line naming a real tomorrow-fact when one exists (`Tomorrow is day 13 of the trial.`); absent otherwise — never manufactured.
- **C6 — Record continuity (drawn, PM-flaggable).** `The record now covers 47 days.` Cumulative, unbreakable by construction — deliberately NOT a streak (a streak that can break is guilt scaffolding; a record that only grows is a fact). Dr. Chen holds it's a fact; the Designer holds it earns the close; QA notes it needs a cheap counter. In the mock; cut freely if it reads as gamification.
- **C7 — Register.** Daylight by recommendation (D-3a). The night-register variant is drawn (D-3b): the 9pm tap is the app's one natural evening ritual and the night tokens exist (B-284) — but the brand rule's lean is that *record* surfaces stay in daylight, so ruling it in is a deliberate brand amendment, not a style pick.
- **C8 — Fire-day anchoring (B-672, D-4).** The tap payload carries the delivery instant; `buildDaySummary` receives it as `nowMs`; >1-day-stale taps clamp to today. The screen header names the day it renders ("Saturday, August 15") — which it already does, making the anchored render self-explaining.
- **C9 — Interruption level (craft).** The 9pm summary stays at the default **active** level (an opted-in ritual should be seen); never time-sensitive (Apple's guidance reserves it for immediate relevance — misuse risks review and per-app revocation). Any future category claims time-sensitive only with its own justification and the entitlement work.
- **Considered and rejected:** a photo strip (incident photos are clinical evidence, not evening warmth); any AI/Signal content (rival-Home line); event editing on-surface (doorways stay doorways).

**Multi-pet:** sections stay; the arc renders per pet; active pet first (D3 unchanged).

---

## 5. Workstream D — The portfolio (types #2 and #3)

Every new category inherits the full mechanical checklist (**NV-G7**): registry entry + prefs CHECK migration + budget weight + primer descriptor + settings row + wipe-path coverage + reconcile idempotence — plus G1–G6 and its own `nyx-voice` + `clinical-guardrails` pass.

### D-A — Trial milestones (recommended #2; new backlog row)
Local notifications derived from `diet_trials` via the existing predicates (zero schema): **halfway** (`day ⌈target/2⌉`) and **target-end** (the §4.3 completion moment — the notification invites the owner tap the milestone already requires). Copy inherits the diet-trial G3 ruling verbatim: the target-end body must never read as permission to stop the diet ("Day 28 of 28 — worth reviewing with your vet where the trial goes from here" register, exact strings at mock/copy pass; the widget's tone rule — no urgency accrual after the window — applies). Scheduled at trial start / edit; reconcile-on-foreground keeps the schedule honest against trial edits (the reconcile diff needs the config-content comparison the primitive's header already anticipates). Its own category (`trial_milestones`), own toggle, off by default.

### D-B — Vet-visit reminders (B-662 — real, but not free)
The dependency the backlog row missed: `vet_visits` is a *past-tense* record (`visited_at`; the report's scope cascade and D7 protections key off it), so an "upcoming visit" fact does not exist and future-dating `visited_at` is off the table. Ship shape: a minimal `next_visit_at`-class fact (own schema PR — column vs. tiny table decided at build) + a capture affordance (the vet-visit screen gains "and the next one?" or the rundown surface offers it) + the reminder itself (T-2d + T-1d, category `vet_visit`, doors to the Ask rundown where allowlisted, else the visit screen). G4-clean by construction (an appointment is not a med event). Build after D-A.

### D-C — B-288 confirmations (the system — own track, own spec)
The ratified D1 carve-out exists *for* B-288. It is not "a third notification type" — it's the capture-inversion system (scheduled windows, action buttons, unanswered-records-nothing, self-pruning, the budget number). v2 hands it: the primer parameterization (B3), the budget enforcement point, the interaction ledger. Its scoping doc owes: the budget *number*, the `expo-notifications` category-action + background-response engineering spike, the reconciliation card. Two research findings bind it now: **no re-nag loop, ever** (MyTherapy's 10-minute re-remind is the named anti-pattern; one notification per window, unanswered = nothing recorded), and the **self-pruning line follows Duolingo's self-silencing model** — the one pattern the whole industry praises: quit loudly, on the record, owner-in-control ("These check-ins don't seem to be landing — Culprit will pause them for now. Turn them back on any time."; exact string at its own copy pass). Runs as the next major track in parallel with V2-PR-5/6.

**Parked:** weekly digest (waits for Signals v2's weekly surface — a notification without its surface is a dead-end); Signal-alert push (Part 2, server push, the narrowed provider OQ — first server-initiated notification decides it).

---

## 6. Workstream E — The warmth bundle (B-671, D-6)

`use_pet_name` boolean on `notification_preferences` (additive migration, rides D-B's schema PR or its own): single-pet accounts may opt into the named body ("Biscuit's day is ready to read."). Multi-pet stays neutral by construction (D3). Settings row lives under the category toggle; primer stays warm-and-named regardless (it's private). T&S gate at build; default off.

---

## 7. PR plan (post-rulings; sized like Part 1's)

| PR | What | Gates |
|---|---|---|
| **V2-PR-1** | B-672 fire-day anchor (D-4) — payload instant, `nowMs` threading, clamp, tests | `code-reviewer`; B-514 fixtures; non-UTC CI |
| **V2-PR-2** | Day Summary v2 surface (C1–C6 per rulings) | **Mock-locked first**; `clinical-guardrails` (G2/G3 + med-strip four); `pm-feature-review`; Dr. Chen read |
| **V2-PR-3** | Adoption doors — A1 TodayZone doorway + A2 in-context offer | `pm-feature-review` (Principle 3); `nyx-voice` |
| **V2-PR-4** | Primer v2 — B1 preview, B2 stakes line, B3 parameterization, B4 copy fix | Designer; `nyx-voice`; G4 re-check |
| **V2-PR-5** | Trial milestones (D-A) — category, schedule-on-start, reconcile content-compare | `clinical-guardrails` (the stop-the-diet ban); `adversarial-reviewer` N/A unless thresholds appear; `nyx-voice` |
| **V2-PR-6** | Vet-visit reminder (D-B) — schema PR first (own PR), then capture + category | Migration pre-flight; `rls-privacy-reviewer` if new table; `nyx-voice` |
| **V2-PR-7** | Finish pass — copy sweep, `pm-feature-review`, on-device checklist closed, §8 AC | `pm-feature-review`; device pass |

B-288 scoping doc runs parallel from V2-PR-3 onward. E (warmth) rides V2-PR-6's migration or ships standalone.

## 8. Acceptance criteria (v2 done =)

1. An owner who never opens Settings can discover the Day Summary (A1), see the offer (A2), walk the primer, and opt in — without ever seeing an unsolicited prompt.
2. The primer shows the exact notification it's asking to send; declining the primer spends nothing; the stakes line names the one-shot without fear copy.
3. A 9pm notification tapped at 12:40am opens the fired-for day; a 3-day-old tap opens today; the header names the rendered day either way.
4. The v2 summary renders arc + chips + strips from existing predicates only; no string on the surface is a verdict; zero-log and error states unchanged from v1's G2/G3 posture.
5. Trial-milestone and (when built) vet-visit categories each: default off, own toggle, primer descriptor, budget-counted, wipe-cancelled, reconcile-idempotent.
6. The target-end milestone body cannot be read as permission to stop the diet (Dr. Chen sign-off on the exact string).
7. `tsc` + jest + non-UTC CI green; on-device checklist from Part 1 closed and re-run over v2.

## 9. Deliberately deferred (with homes)

| What | Where |
|---|---|
| The budget *number* + self-pruning behavior | B-288 scoping (unchanged) |
| Owner-configurable summary time | Later nicety (schema ready since Part 1) |
| Weekly digest | Signals v2 weekly surface, then a category here |
| Server push (Signal alerts, household) | Part 2; provider OQ narrowed as before |
| A3 post-first-week Home card | Held pending A1/A2 adoption signal |
| Night-register summary (if D-3a) | Redrawn when the brand rule is amended or re-affirmed |
| Photo/avatar in notification (rich attachment) | With B-671's bundle only if T&S clears the lock-screen exposure; not v2 |

## 10. Open items

1. §0 rulings D-1…D-6.
2. The standing Tier-2 `design-principles.md` §4 carve-out wording (Part 1 §11) — still awaiting PM sign-off.
3. If D-3b (night register): the brand-doc Tier-2 amendment drafted for PM approval before V2-PR-2.
4. B-288 scoping doc kickoff (own session).
