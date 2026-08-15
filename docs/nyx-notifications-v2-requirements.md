# Nyx Notifications v2 — Out of Beta, the Evening Surface, and the Portfolio
**Version:** 0.91 — reaction round 1 folded in (PM, 2026-08-15 same day): **D-3 RULED (night register)**; D-2 sent back for a Designer round-4 re-pitch (value-forward, privacy demoted); D-5 re-opened for a portfolio iteration + focused competitive research. D-1/D-4/D-6 still open. | **Date:** 2026-08-15 | **Status:** Requirements in reaction; mock rounds 3–4 published (same artifact URL); no build until §0 closes.

**Read with:** `docs/nyx-notification-foundation-requirements.md` (Part 1 — the shipped foundation this builds on; its §0 D1–D4 rulings and §6 G1–G6 spine carry forward verbatim), `docs/culprit-notifications-mockups.html` (rounds 1–3), `docs/research/2026-08-notification-ux-landscape.md` (the best-of-breed evidence, this session), `docs/logging-capture-discovery.md` §6-A (B-288's shape). Backlog: B-661 (shipped Part 1), B-666, B-670, B-671, B-672, B-673, B-674 (this track resolves or promotes each), B-288, B-662, B-015, B-543, B-227 (the consumers).

---

## 0. Decision record — OPEN, awaiting PM rulings

Presented as decision briefs (house rule, 2026-08-07). Everything below §0 is written to the team's recommendation; a different ruling edits the affected section, nothing else.

| # | Deciding | Options | Team recommendation | Consequence |
|---|---|---|---|---|
| **D-1** | What "out of beta" means — the adoption push's shape | (a) Doorway + in-context offer (A1+A2); (b) a + a one-time post-first-week Home card (A3); (c) doorway only | **(a)** — the offer fires at the moment the owner is looking at the thing the notification delivers; A3 spends Home-surface trust for reach we haven't shown we need | Unblocks B-673; G6 unchanged (nothing defaults on); A3 stays drawn in the mock as a later escalation |
| **D-2** | Primer v2 shape | ~~(a) Sheet, sharpened, privacy-led; (b) full-screen~~ → **round 4:** full-screen value primer in the Landing `ValuePreview` language | **REACTED 2026-08-15 (PM): the privacy-led pitch is rejected as the headline** — "the pitch is staying on top of your pet's day/health," and the PM leans full-screen, pointing at the onboarding learn-more (`ValuePreview`) designs to steal from. Round 4 (mock, same URL) re-pitches: the hero is a **miniature of the night Day Summary** (the destination, in the `ValuePreview` mini + display-headline + calm-subline grammar), the pitch is the ritual, the real-notification preview drops to a secondary chip, and the privacy line **demotes to fine print** (kept — T&S; just never the headline). One full-screen primer for every invocation (settings toggle, A2 offer, future categories). B-666's stakes line rides the fine print. | Round-4 frames await the PM's pick between the two copy directions (see §3); then the primer PR builds that frame |
| **D-3** | Day Summary v2 depth — how far toward a briefing | (a) Enriched, facts-only, daylight; **(b) a + the night register**; (c) keep v1 | **RULED 2026-08-15 (PM): (b) — the night register.** "It's going to be dark — let's not blind someone as they're opening the notification. We're going with the evening ritual/night register." Enriched facts-only content as specced (§4), on the night ground. | Unlocks V2-PR-2 once the mock locks; **requires the brand Tier-2 amendment (§10 #3 — drafted, awaiting PM wording approval)**; night AA + reduced-motion pass at build; med slate needs a night sibling token |
| **D-4** | The midnight day-handoff (B-672, filed PM decision) | (a) Fire-day anchor: tap carries the delivery instant, screen renders that day, clamped to today when >1 day stale; (b) status quo (always now-today) | **(a)** — the surface's primary entry point must not open the wrong day; the clamp kills the stale-notification confusion that made this a genuine tradeoff | The redesign's credibility gate; V2-PR-1; B-514-honest fixtures |
| **D-5** | Notification types #2 and #3 | ~~(a) milestones → vet-visit; (b) vet-visit first; (c) weekly digest~~ → **re-opened: the portfolio iteration (§5.5)** | **REACTED 2026-08-15 (PM): "none of these are truly calling my name."** Rulings that landed inside the reaction: **trial milestones parked to backlog** (high value, low touch — fires once; the widget already counts the trial down; B-761 → Later); **vet-visit confirmed data-gapped** (the PM independently asked "do we even capture vet visit dates?" — we don't); **B-288 meal confirmations elevated** ("genuinely interesting"). The PM seeded two directions — learned feeding windows and Signal-fired notifications — folded into §5.5 with the team's takes, alongside a fresh candidate slate + a second, focused competitive research sweep (notification *type portfolios*, pet category first). | The iteration's reaction round picks #2/#3; B-288 scoping starts regardless |
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

## 3. Workstream B — Primer v2 (round 4 — re-pitched after the PM's reaction)

**The reaction that reshaped this section (PM, 2026-08-15):** the privacy-led pitch is out as the headline — *"the pitch is about staying on top of your pet's day / health."* The PM leans full-screen (the round-3 D-2b container) and points at the onboarding learn-more designs as the language to steal. The Designer's round-4 re-pitch:

**B1 — The hero is the destination, in the `ValuePreview` grammar.** The Landing's learn-more pages (`components/onboarding/ValuePreview.tsx`, B-251 PR 5) already solved this exact problem — pitch a feature by showing a *miniature of the real surface* (elevated mini-card in real tokens), then a display-face headline, then one calm subline. The primer becomes the fourth member of that family: full-screen, hero = **a miniature of the night Day Summary** (the freshly-ratified D-3 surface — the thing the notification actually opens), headline value-forward, subline naming the ritual. Two copy directions drawn in round 4:
- **(c1) the closeness pitch:** "Stay close to {pet}'s day." / *"One calm notification each evening, around 9 — when the day's record is ready to read."*
- **(c2) the read-back pitch:** "The day, read back to you." / *"Culprit gathers what you logged — meals, doses, anything that happened — and lets you know when the day is ready."*

**B2 — The real-notification preview drops to a secondary chip.** Still shown (it's still the honest what-am-I-agreeing-to move, exact by construction under G1) — just no longer the hero.

**B3 — Privacy demotes to fine print, kept.** One small line under the preview chip: *"That's the whole notification — nothing about {pet}'s health shows on your lock screen."* T&S keeps the promise in the flow; it simply stops being the pitch. The **one-shot stakes line (resolves B-666)** rides the same fine print: *"Your phone will ask once; you can change it any time in iOS Settings."* No fear framing; Not-now stays cost-free and unmentioned.

**B4 — One primer, every invocation.** The full-screen primer is the single consent surface — settings toggle, A2 offer, A2b value moments, and future categories all open it (modal presentation). Per-category parameterization as before: the registry grows a `primer` descriptor (hero variant, headline, cadence line) per category.

**B5 — Fresh-decliner copy fix** (B-666's second half) unchanged: the OS-denied state gains one clause acknowledging the fresh decliner's path.

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
- **C7 — Register: NIGHT — RULED 2026-08-15 (PM).** The Day Summary renders on the night ground (`colorBrandNight` / `-Elevated` / `colorTextOnNight` / `colorMoonlight` lead; symptom rows ride `colorEventSymptomOnNight`). *"It's going to be dark — let's not blind someone as they're opening the notification. We're going with the evening ritual/night register."* Build consequences: the brand Tier-2 amendment (§10 #3, drafted); a night sibling token for the med slate; night AA verification on every string/tint; reduced-motion unaffected (no new animation). **Register sub-detail (team lean, cheap to veto): always-night** — the surface keeps one identity whether reached at 9pm from the notification or at 10am from Home's door. One register means one snapshot set, a distinctive "ritual room" identity, and a clean visual distinction from History-today (which strengthens A1's single-door story). The alternative (time-adaptive day/night) doubles every state and makes the surface's identity depend on the clock.
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

**Parked:** weekly digest (waits for Signals v2's weekly surface — a notification without its surface is a dead-end); Signal-alert push (see §5.5 idea 2 — the PM re-opened it with a delivery question worth answering properly).

### 5.5 The portfolio iteration (re-opened 2026-08-15 — "none of these are truly calling my name")

The PM seeded two directions; the team's takes, then the wider slate. A second, focused competitive sweep (notification *type portfolios*, pet category first) feeds this section: `docs/research/2026-08-notification-type-portfolios.md`.

**PM idea 1 — learn feeding patterns, notify when a feeding is missed.** The team's take: the value is real and the shape already has a home — **this is B-288's learned-window arm.** Two honesty rules bound it, both from lived scar tissue:
- **The Data Scientist's confound (non-negotiable):** the app observes the household's *logging* rhythm, not its *feeding* rhythm. A quiet morning is indistinguishable from an unlogged breakfast, so the notification may **never say "missed"** — a missed-feeding claim from log-absence is the G2 violation with a guilt payload attached (the med strip banned the word for the same reason). The honest shape is a **capture ask**: at the learned window, "How did breakfast go?" (B-288's confirmation, timing learned instead of declared) — or shortly after a learned window passes unlogged, "Nothing in the record for the usual breakfast window — how'd it go?" Either way the answer is one tap and unanswered records nothing.
- **The declared-vs-learned line (from the first research round):** the owner's declared window is a contract; a learned window is a *suggestion the app makes* ("Breakfast usually lands around 7:30 — want a check-in then?"). Learning proposes, the owner confirms, drift re-proposes — never a silently moving fire time.
- Floor + stability requirements (minimum observed days, regularity threshold) make the learning adversarial-mandatory when built. Genuinely-detected missed feedings (hardware feeders) are a different product layer we don't have; the record layer must stay honest about what it can see.

**PM idea 2 — a Signal finding fires a notification.** The team's take: clinically the **highest-value notification the product could ever send** — and the one the guardrails were built for. Shape, if built:
- **Doorbell-only body (G1, stricter than Oura):** "Something in the record is worth a look." The finding itself never touches the lock screen. Escalate-only: fires for **safety-lane findings only** in v1 (chronicity, intake-decline, red-flag classes), **once per finding identity** — a finding that persists does not re-fire. Never a "quiet week" inverse (no reassurance-from-absence, ever).
- **The cap question, answered honestly:** this is *not* a D1 carve-out schedule — its timing is system-initiated, so it counts against Principle 4's one-unsolicited-per-day cap (the category is still opt-in per G6; opt-in ≠ owner-scheduled). Once-per-finding keeps it rare in practice.
- **The delivery question is the real decision.** The engine runs server-side on a request-driven 24h cache — nothing server-initiated exists (D2). Three paths: **(i) server push** — Part 2, finally forces the long-open provider OQ; **(ii) background app refresh** — `expo-background-task` (BGAppRefreshTask): the app wakes opportunistically, calls `generate-signal`, and schedules an *immediate local* notification if a new safety finding appeared. No push provider, no APNs entitlement; costs the background-fetch capability (config plugin) and iOS-controlled timing (could be hours late — acceptable for patterns that emerge over weeks, and the honest framing is "worth a look," not an alarm). **(iii)** compute-at-9pm piggyback — rejected (the owner is already opening the summary). Path (ii) is the team's lean for v1 and needs an engineering spike (reliability of BGAppRefreshTask under iOS budgets) before it's promised.

**Team additions to the slate (pre-research):**
- **The weekly trial check-in** — the milestone's high-frequency sibling, and possibly what the milestone wanted to be: during an active trial, a weekly doorbell ("Week 2 of the trial — this week's record is ready to look over"), landing on a trial-scoped read. Clinically anchored — the ACVIM 2026 consensus prescribes exactly weekly owner-scored symptom-frequency review during GI diet trials (per the signals deep-dive) — so the cadence is a vet's cadence, not a growth hack's. Repeats through the wedge's most engaged period; local-derivable from `diet_trials`; the landing surface needs design (the night summary with a week scope vs. the trial card).
- **The weekly digest, re-offered** — still the first research round's #1 by evidence (doorbell + earned unlock); still parked on its missing surface; named here so the iteration's reaction round can pull it deliberately rather than forget it.
- **Course-end confirm nudge** — B-719 built the "is the course finished?" prompt on the profile card and explicitly deferred its notification form to this track. A one-shot, high-signal moment with the same confirm-in-the-loop register (never auto-ends, never "complete").
**The competitive sweep landed same day** (`docs/research/2026-08-notification-type-portfolios.md`) — a pet-category teardown + the literal portfolio lists of the best health apps + the "system noticed something" grammar ladder + a **ranked 14-candidate longlist** (§5 of the brief; read it before reacting). What it changes here:

**Two new standing rules, proposed from the market evidence (codify into `nyx-voice`/`clinical-guardrails` with the first new-type PR):**
- **NV-G8 — the notification register (the grammar ladder).** Rung 1 *question-form* for confirmations (assert the observed fact — a window arrived, a log is absent — ask about the interpretation, attach the one-tap resolution; the bank-fraud "Did you make this purchase?" shape, and Apple Medications' exact move). Rung 2 *envelope* for findings (name that something changed; the what stays in-app — Credit Karma's decade-proven shape, and our G1 arrived at independently). Rung 3 *hedged comparative-to-self* language ("more than usual", "signs of") lives in-app only, never in a body. Rung 4 — an asserted health-state alarm — is **prohibited**: the Owlet warning letter's lesson is that *the alarm is the claim*.
- **NV-G9 — no asserted absence without a witness.** The §4.4 market-wide finding: no software-only logger asserts a missed real-world event from a missing log — only hardware (a bowl that weighs, a scale, a camera) earns that grammar. Any body of the form "{pet} didn't X" is inadmissible here; the admissible transform is the record-grammar question ("Breakfast hasn't been logged — how'd it go?") or silence. This is the PM's idea-1 boundary, now with the whole market as the evidence base.

**The team's shortlist from the 14 (for the PM's reaction — full table in the brief):**
1. **#1 Care confirmation + follow-up ask (= B-288, already elevated)** — now with Apple Medications' exact three-tier shape to copy: remind at the declared window → one follow-up *about the log* ~30 min later → escalation only as a per-item owner choice. The learned-window arm stays the labeled opt-in upgrade (#14), declared-first (nobody credible launches learned-first).
2. **#3 The conditional morning check-in (NEW — the sweep's best find).** Gentler Streak's Morning Check-In imported: fires *only when yesterday held something worth a look* (a symptom logged, a first dose, a milestone crossed — event-based, never verdict-based); a quiet yesterday means silence, and the silence is the feature. The natural pair to the 9pm ritual: evening = the ritual read, morning = only-when-noteworthy. Composes with D-4's anchor mechanism (the tap opens *yesterday's* summary). Two-sided G2 note: the skip must never be teachable as "no news = all clear" — the category's copy never promises a quiet-day signal.
3. **#5 Refill/course runway** — "3 doses left of the course as entered": a real, computable supply fact (`dosesTowardTarget`), Chewy's honest runway framing without the commerce; no pace, no completion language (B-618 D3/D7 carry).
4. **#6 New-signal envelope** (the PM's idea 2) — confirmed as the flagship reason Part 2's provider question eventually gets answered; the background-fetch middle path stays the near-term lean (spike first).
5. **Also real, later:** #4 pre-visit rundown (after upcoming-visit capture), #7 weekly digest (surface dependency stands), #12 photo memory (delight subsidizes the channel — Furbo's lesson — but needs a bereavement/severity filter before it ever ships), #9 record-strength anti-streak (tempting, near "judging a person" — handle with C6 gloves).
- **Recorded anti-candidate:** "Biscuit hasn't eaten today" — inadmissible without hardware (NV-G9), permanently.

**Portfolio-level rule adopted from the sweep (Tractive/Whoop's demotion discipline):** most detections belong on the pull surface (the Signal zone); push is *earned* by the shortlist above. The settings screen stays short because the judgment happens before the toggle list.

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

1. §0 rulings still open: **D-1** (adoption doors), **D-4** (fire-day anchor), **D-6** (warmth bundle) — plus the round-4 primer copy pick (D-2, §3) and the portfolio iteration's reaction round (D-5, §5.5).
2. The standing Tier-2 `design-principles.md` §4 carve-out wording (Part 1 §11) — still awaiting PM sign-off.
3. **The brand Tier-2 amendment for the ruled night register (D-3) — DRAFTED, awaiting PM wording approval before V2-PR-2:**

   > Proposed edit to `docs/culprit-in-app-brand-requirements.md` §1.2 (the register rule), appending to the named night-ground surfaces: *"— and the Day Summary (`/day-summary`), the evening read-back the 9pm notification opens (notifications-v2 D-3, PM-ratified 2026-08-15). The register rule reserves night for the app working on the pet's behalf; the evening summary is that work presented back — the app kept the day so the owner didn't have to. The line holds elsewhere: working and editing surfaces (Home, History, the log flows) stay in daylight. The Day Summary is presentation-only (doorway rows, no edit affordances), its primary arrival is literally at night, and darkness admits no new register: symptom rows ride `colorEventSymptomOnNight`, and no verdict or reassurance language gains admission by ground."* Build note riding it: mint the med-slate night sibling token beside `colorEventSymptomOnNight`.

4. B-288 scoping doc kickoff (own session) — elevated by the PM's reaction; absorbs the learned-window arm (§5.5 idea 1).
5. Engineering spike: `expo-background-task` reliability for the Signal-doorbell path (§5.5 idea 2, delivery path ii) — before any promise is made.
