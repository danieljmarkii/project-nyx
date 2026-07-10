# Logging Friction & Capture Surfaces — Discovery

**Date:** 2026-07-10 · **Status:** Discovery output — recommendations pending PM ratification (3 open questions filed in CLAUDE.md)
**Trigger:** PM-initiated product discovery workshop. Prompt: *"Increase logging frequency while making logging require as little effort and attention as possible."* Plus an observation: the PM and his wife, using a competitor app (Dog Recruit) together, naturally became accountability partners — "did you log the treat?" — and consistency improved.
**Sibling docs:** `docs/vet-report-discovery.md` (the Step 9 analog of this doc). Evidence inputs: `docs/nyx-research-v1_0.md` (Jordan §"Why Jordan doesn't track"), `docs/research/2026-05-feeding-windows-and-partial-eating.md`, backlog B-015 / B-195 / B-227 / B-047 / B-186.

---

## 0. Where this lands (TL;DR)

1. **Reframe the goal:** not "logging frequency" but **capture fidelity** — the % of actual care events that end up in the record, with honest provenance. Junk data is worse than missing data for a clinical-grade product.
2. **Reframe the unit:** the customer is the **household**, not the user. The PM's own household shares one account today (that's why B-054 multi-device sync exists and why B-086 guards the "two-caregiver hidden-switch hazard"). An unlogged spouse-treat isn't a retention problem — it's a **false negative in a diet trial's exposure record**, the classic reason elimination trials fail. A minimal shared-care model is *capture infrastructure*, not a social feature.
3. **The friction battle is outside the app.** Quick-log already passes the 10-second test (Step 4 ✓). What's left — remembering, reaching the phone, the unlock-find-launch context switch — all happens before our first screen renders. That's exactly the layer iOS system surfaces attack. The PM's instinct is right.
4. **Different event classes need different capture strategies** (§3 taxonomy). Scheduled events (meals, meds) want the system to *ask* — answering is easier than initiating. Spontaneous micro-events (treats — the #1 diet-trial contaminant) want an *ambient one-press surface* (widget, Action Button, NFC, watch). Incidents already have the right shape (camera-first); they want an *aftermath* surface (a bounded observation-window Live Activity). Continuous behaviors (grazing cats) want a *day-close ritual* or hardware, never per-event logging.
5. **Recommended sequence:** (A) a **confirmation-push pilot** on pure Expo local notifications — no native code, no push provider, ships now, tests the core behavioral hypothesis (B-288); in parallel (C) the **minimal household shared-write model** (B-292, backend track, disjoint files); then (B) the **out-of-app write path + App Intents + one interactive widget** (B-290/B-291) — the platform bet that unlocks Siri, Shortcuts, NFC, Action Button, and the watch for near-zero marginal cost. **Don't build streaks/gamification** (§7).

---

## 1. Reframing the problem

### 1.1 Logging frequency → capture fidelity

"Increase logging frequency" is a metric that can be satisfied with garbage: streak-preserving backfills, auto-assumed events, duplicate taps. Nyx's value chain is `capture → correlation engine → Signal / vet report`, and both consumers are denominator-sensitive:

- The case-crossover engine (`detection.ts`) compares exposure sets; a **missing** treat weakens power, but a **fabricated** meal poisons the control window.
- The vet report's clinical trust (Principle 6) rests on honest counts. Dr. Chen's first question about any suspiciously clean record is "what *didn't* they log?"

We already have case law: the medication completion card (B-156 G1) may **never** record `given` from silence — unanswered means `unconfirmed`. That fail-safe generalizes to every capture surface in this doc: **a surface may lower the cost of confirming; it may never assume the event happened.**

**Proposed north star:** *capture rate with honest provenance* — share of actual care events recorded within 24h, tagged with how they were captured. Not measurable directly (we can't see unlogged reality), but proxy-able: scheduled-slot coverage (meals logged ÷ meal slots the owner told us about), treat-capture rate vs. trial-start baseline, per-surface volume via a `logged_via` column (B-289).

### 1.2 The user → the household

The accountability anecdote is the tell, and the repo already knew: B-054 shipped multi-device hydration because *"a second device on a shared account saw an empty log,"* and B-086 made active-pet selection device-local because of the *"two-caregiver hidden-switch hazard."* The PM's household — like most two-adult households — is already multi-caregiver on one shared credential.

Consequences:

- **Data completeness:** each caregiver only witnesses a subset of events. A single-writer household structurally under-counts. In a diet trial, the unwitnessed treat from the other adult is *the* canonical contamination vector — the thing that makes a vet conclude "the diet didn't work" when the diet was never actually run clean.
- **Attribution:** on a shared credential, `logged_by` doesn't exist, so we can't even study the two-caregiver dynamic in our own data.
- **Multiplication:** every capture surface below multiplies by the number of caregivers who can write. A widget on one phone captures one adult's events; the same widget on both phones with shared write access roughly doubles household coverage for zero extra engineering.

The PM's instinct that collaborative caregiving is "interesting but not highest-leverage" is right **about the feature suite** (feeds, comments, streak-shaming — see §7). It's wrong about the primitive: *invite a caregiver, shared write access, `logged_by` attribution* is a small backend project squarely inside existing competence (RLS + invite flow; `rls-privacy-reviewer` mandatory) that raises the ceiling on everything else. The couple already has a communication channel — their kitchen. The app doesn't need to host the accountability conversation; it needs to make sure both halves of it can write, and that the answer to "did you log it?" is ambient (§4.1).

### 1.3 One friction number → a chain with one expensive link

Jordan's profile names it: *"a five-step process that fails at step one in the moment the event occurs"* (`nyx-research-v1_0.md`). Decompose the chain for a treat given while holding a wriggling dog:

| Link | Cost today | Owned by |
|---|---|---|
| 1. Remember to log at all | High — prospective memory, no cue | **Nobody (the gap)** |
| 2. Acquire the device | Medium — phone elsewhere, hands full | OS surfaces |
| 3. Context switch (unlock → find icon → launch → land) | Medium — ~5–10s + attention | OS surfaces |
| 4. The log itself | **Solved** — 10-second test, Step 4 ✓; confirmation-over-entry | App (done) |
| 5. Return to life | Low | — |

The 2026-06 competitive refresh (B-195) reached the same conclusion from the outside: the camera roll + Notes wins the *capture* race today; Nyx wins the *synthesis* race but "must get within striking distance on capture or it loses at step one." Every dollar spent making step 4 faster now buys ~nothing; steps 1–3 are the whole game, and they live at the OS layer.

### 1.4 The reactive wedge changes what "habit" means

Nyx's wedge user arrives with a directive (diet trial, symptom watch) and a burst of motivation lasting weeks. Habit research (Lally et al. 2010: median ~66 days to automaticity, range 18–254) says the diet-trial window *is* roughly one habit-formation window — but Jordan's profile is explicit that the retention risk is week six, *when the pet seems better*. Two implications:

- **Don't import the consumer-engagement playbook.** A reactive-tracking product used intensively during concerns and lightly during health is being used *correctly*. Optimizing for unbroken daily engagement (streaks) fights the wedge and the brand (Pets > $, warm-not-nagging).
- **Design for cheap baseline + instant hot-start.** Baseline data (healthy-period meals) genuinely improves the engine's denominators and the vet report's "normal," so we want it — but it must ride the *cheapest* surfaces (one-tap confirmations, eventually hardware), because baseline-period motivation is low. And when a concern flares, capture capacity must spin up instantly (the surfaces are already installed: widget on the Home Screen, watch on the wrist).

---

## 2. The behavioral model

Fogg's B = MAP: a behavior happens when **M**otivation, **A**bility, and a **P**rompt converge. Mapping Nyx's actual failure modes:

| Failure | M | A | P | Diagnosis |
|---|---|---|---|---|
| Routine meal unlogged | Low–med ("same as always, boring") | Med (phone not in hand) | **Absent** — the ritual doesn't ping anything | Prompt problem first, ability second |
| Treat unlogged | Low ("doesn't count") | Low (5-second event, hands busy) | **Absent** | The hardest class — needs ambient ability + a physical-world prompt |
| Symptom unlogged | **High** (salient, scary) | **Low** (stress, mess, one hand) | Present (the event itself) | Ability problem — already solved by camera-first capture; protect it |
| Week-6 decay | Decaying | Fine | Habituated (notification blindness) | Motivation/prompt-freshness problem — see §7 for what *not* to do |

Principles this yields:

1. **Answering beats initiating.** For scheduled events, flip the direction: the system asks ("Biscuit's breakfast — how'd it go?") and the owner confirms with one press. Responding to a prompt is a fundamentally cheaper behavior than self-initiating one — it deletes chain links 1–3 outright. This is Principle 2 (confirmation over entry) extended from *within* the log flow to the *existence* of the log flow. Design constraint from §1.1: an unanswered ask records **nothing**.
2. **Event-based cues beat time-based cues** (prospective-memory literature: Einstein & McDaniel). The strongest cue is the physical ritual itself — the food bin, the treat jar, the pill drawer. We can't sense those (yet), but we can proxy them (learned time windows) or let the owner *attach a digital trigger to the physical object* (an NFC sticker on the treat jar; the Action Button; the watch that's already on the wrist mid-ritual). Environmental design > notification design.
3. **Implementation intentions** (Gollwitzer): "After I feed Biscuit, I'll tap the widget" formed *once, in advance*, dramatically outperforms in-the-moment willpower. Product translation: onboarding/setup asks "when do you usually feed?" — configuring the confirmation schedule *is* forming the if-then plan.
4. **Habituation is the tax on every prompt.** Fixed-time, fixed-copy notifications go blind in ~2 weeks. Mitigations: the notification *is* the log surface (actionable buttons — so even a habituated user is one press from done); specific, named copy (Principle 4 already mandates it); self-pruning (a prompt ignored 3 days running offers to stop — nagging is also a brand violation); hard caps.
5. **Protect intrinsic motivation.** The owner's motive — love and worry for a specific animal — is the strongest intrinsic driver in consumer software, and Nyx's brand *is* that motive (Pets > $). Self-determination theory (and the motivation-crowding literature) warns that layering extrinsic points/streaks onto an intrinsically-motivated care behavior can *displace* the real motive — and a broken streak in a health context reads as "you failed your dog." The safe reward channel is **competence and identity feedback about the record itself**: "Day 12 of 28 — logged" (the B-284 N6 completion moment already points here), "27 of 28 trial days have a complete record — this is exactly what your vet needs." Never points, never badges, never guilt.
6. **The couple's mechanism, named:** distributed prospective memory (two brains hold one intention), a commitment device (stated intent to a partner + consistency pressure), and shared identity ("we're running this trial together"). The product's job is to *unblock* it (both can write — §1.2), make state ambient so the accountability question answers itself (§4.1: "Breakfast ✓ 7:42 — Sarah" on a widget), and **never weaponize it** (Trust & Safety: no "Sarah missed dinner" push, no per-person scoreboards; visibility is always pet-centric, never person-centric shame — the difference between a shared care record and domestic surveillance software).

---

## 3. Event-class taxonomy → capture strategy

The single most useful artifact of this workshop. Different event classes fail differently; one capture strategy cannot serve them all.

| Class | Examples | Shape | Right strategy | Directions (§6) |
|---|---|---|---|---|
| **Scheduled-routine** | meals, daily meds | Time-anchored, predictable, boring | **System-initiated confirmation** at the learned/declared window + next-day batch reconciliation. Unanswered = nothing recorded (B-156 G1 rule). | A |
| **Spontaneous-micro** | treats, table scraps, chews | Unpredictable, 5-second, low felt importance, **highest clinical stakes during a trial** (contamination) | **Ambient one-press surfaces** within arm's reach of the ritual: interactive widget, StandBy, Action Button/Control, NFC tag on the jar, watch. Make logging cheaper than the guilt of skipping. | B, E |
| **Incident** | vomit, diarrhea, limping | Unpredictable, salient, stressful, hands-full | Camera-first defer-everything capture (**built**) + an **aftermath surface**: a bounded post-incident observation window (Live Activity) that keeps "log another / it recurred" one glance away during the exact hours recurrence matters for triage. | D |
| **Continuous/ambient** | grazing intake, water, litter behavior | Not discrete events; per-event logging is a category error (Sam: "the grazing baseline must not feel like failure") | **Day-close ritual** (one evening prompt: bowl status / litter / demeanor in ≤3 taps, composing with free-feeding arrangements B-040) or **hardware sensors** (microchip feeder, connected litter box) later. | A (variant), F |

---

## 4. The iOS capture-surface ladder

Ordered by distance from the user's attention. Engineering reality per rung. Context: Expo SDK 54 / RN 0.81; install-base floors noted per feature; current OS = iOS 26, iOS 27 announced at WWDC26 (June 2026 — one month ago; verify specifics before building, this section was spot-checked via web research dated 2026-07-10).

### Tier 1 — Ships today, zero native code (pure Expo, in the managed workflow)

**Actionable local notifications** (`expo-notifications`: categories with buttons + text-input actions; calendar/daily triggers).
- The confirmation-push mechanism: a scheduled local notification at the owner-declared meal/med window with `[All of it] [Some] [Skipped]` buttons. One press logs with `confirmed-by-owner` provenance; expanding the notification is a long-press — one extra gesture, still no unlock-find-launch chain.
- **Local scheduling needs no push provider and no backend** — this *narrows* the long-open "push notification provider?" question (CLAUDE.md, post-MVP) to server-initiated pushes only (partner activity, Live Activity updates, Signal alerts). B-015's "blocked on push-provider decision" is over-blocked: its 30–60-min post-meal intake ask is schedulable locally at meal-log time.
- Text-input actions exist (free-text note from the notification) — useful later for symptom follow-ups.
- Caveats: action responses wake the app in the background (cold-start JS ~1–2s — fine for a background write, must be tested for reliability); notification permission must actually be requested (today the app never asks — the B-283 PR-3 settings screen ships notifications as an honest mock, which is the natural home for the primer + per-schedule toggles).

**Evening/morning reconciliation card** (in-app, Zone 2 adjacency): "Yesterday: breakfast ✓ · dinner ?" with one-tap confirm/deny per slot, provenance `recalled` (the `occurred_at_confidence` machinery from B-010 already models honest uncertainty — reuse its spirit, never fake precision). Recall over ≤24h is decent for scheduled events (salient, anchored) and poor for micro-events — which is fine: reconciliation recovers *meals*; treats need Tier 2.

### Tier 2 — Native extension targets via CNG (no ejection, but a real decision — Open Question)

All of these are SwiftUI code in extension targets, generated into the project by config plugins — the modern Expo path (`expo-apple-targets`, SDK 53+; Expo's newer official `expo-widgets` module authors widgets/Live Activities in declarative JS with App Group data sharing, arriving in SDK ~57 — i.e., one normal SDK upgrade away). This is **not ejection** (CNG remains; EAS builds it), but it *is* bounded native Swift in the repo, and it changes per-push QA: **widgets/intents don't run in Expo Go** — Runtime B becomes a custom dev client (`expo-dev-client`), a one-time workflow change. CLAUDE.md's "managed workflow; no ejection without a PM decision" needs an explicit ratification that this path is inside the constraint (Open Question filed).

**The foundational piece — an out-of-app write path** (B-290, the real engineering investment; every surface below reuses it):
- App Group container shared between app + extensions; extensions append capture records to an **inbox** (and/or write direct to Supabase REST when online); the RN app ingests the inbox into SQLite + the existing sync queue on next foreground; LWW rules unchanged.
- Auth: extensions read the Supabase session via a shared Keychain access group — must compose with the chunked SecureStore adapter (#306).
- Every record carries `logged_via` (B-289) — provenance for the funnel *and* for the engine/report (a widget "usual breakfast" tap carries assumed portion; an auto-logged feeder event is not an owner-witnessed `intake_rating`).

**Interactive widgets** (iOS 17+ floor for buttons; Home Screen + StandBy): "Log breakfast ✓ / Treat 🦴" buttons that execute App Intents in-process — **no app launch at all**. StandBy (iOS 17, phone charging sideways) is a sleeper: a phone on a kitchen MagSafe stand becomes the feeding-station logging kiosk — physically co-located with the ritual (§2.2). Lock Screen accessory widgets are glance + fast-launch; treat button-interactivity there as verify-in-spike, not assumed.

**App Intents** (iOS 16+; the leverage multiplier): define `LogMeal`, `LogTreat`, `LogDose(pet, item)` once, and *for free* get — Siri App Shortcuts phrases ("Hey Siri, log Biscuit's breakfast" — zero user setup); the Shortcuts app → **NFC tag automations** (sticker on the treat jar; tap phone to jar; runs immediately, no confirmation — the physical-cue endgame at ~$1/tag), **Back Tap** (double-tap the phone's back), time/location personal automations; **Action Button** (iPhone 15 Pro+) and **Control Center controls / Lock Screen control slots** (iOS 18+) for true one-press-from-locked capture. WWDC26 direction confirms Apple is investing exactly here (iOS 27: `LongRunningIntent`, `ExecutionTargets` letting intents run in the widget extension or main app; Dynamic Island now portrait *and* landscape).

**Live Activities** (iOS 16.1+, buttons 17+): **not** a permanent logging panel (activities are bounded episodes, ~8h budget, and Apple rejects widget-abuse). The correct fits are episodic and clinically meaningful:
- **Post-incident watch window** (D, B-293): after a vomit log, a 24–48h "observing Biscuit" activity on the Lock Screen/Dynamic Island — `[Log another]` one press away during exactly the hours recurrence frequency matters for triage (re-armed daily within ActivityKit limits). Copy constraint (clinical-guardrails): the *owner* ends the watch; the app **never** declares "all clear" (n=1 never reassures). This turns the scariest evening into the app's most present moment — the ESPN inspiration transplanted correctly: not a score, an unfolding episode you care about.
- **Med-course companion** ("Amoxicillin — day 3 of 10 · [Given]") once B-117's reminder deferral (D3) is revisited.
- watchOS 11+ mirrors iPhone Live Activities into the watch Smart Stack automatically — free wrist presence once activities exist.

### Tier 3 — Bigger bets, sequenced later

**Apple Watch app** (E, B-295): the only surface *on the body during the ritual* — raise wrist, one tap or one dictation, hands stay free. RN doesn't run on watchOS: a small native SwiftUI app + the same write path. Biggest lift of the ladder; sequence after B proves out-of-app capture volume, and note watchOS 26's Smart Stack + mirrored Live Activities already deliver part of the value free.

**Passive hardware** (F, B-294): microchip feeders (SureFeed), connected litter boxes (Whisker Litter-Robot has a cloud API), smart scales → auto-logged elimination/feeding/weight events with **zero human effort** — the only strategy that fully serves the continuous class (Sam), and the owners who buy a $500+ litter robot overlap heavily with reactive GI cat owners. Costs: unofficial/fragile APIs, small install base, integration long tail, provenance discipline (`logged_via='device'`, never conflated with owner-witnessed intake). Spike later; possibly partnership-shaped.

**Android parity debt:** widgets/Quick Settings tiles/App Actions all have Android analogs on different stacks. Wedge-first iOS-first is defensible (and the PM's household is iOS), but every Tier-2 surface adds to the eventual parity bill — and an Android spouse in an iOS-led household breaks the *household* multiplier (§8 research question).

---

## 5. What the anecdote should and shouldn't become

**Build (small, infrastructural):** invite a caregiver → shared write on the household's pets → `logged_by` attribution → RLS (`rls-privacy-reviewer` mandatory — this widens the access surface by design). Ambient mutual visibility comes free on existing surfaces: the Today zone (and later a widget) showing "Breakfast ✓ 7:42 — Sarah" answers "did you log it?" without a feature called Accountability.

**Don't build (now, maybe ever):** activity feeds, comment threads, reactions, streak-shaming, per-person completion stats, "nudge your partner" buttons. The couple's dynamic works because it's *theirs* — warm, verbal, reciprocal. Instrumenting it risks (a) crowding out the intrinsic dynamic with app-mediated obligation, (b) the surveillance/scorekeeping failure mode (T&S), (c) building a social layer no single-adult household can use — while the *infrastructure* version helps every multi-adult household silently.

Also honest: the anecdote is n=1, from two unusually conscientious product people dogfooding a competitor. It generalizes as *"multi-adult households under-count with single-writer tools and self-organize accountability when both can write"* — a claim our own B-054/B-086 history supports — not as "accountability features drive retention."

---

## 6. Directions compared

| # | Direction | Attacks (taxonomy row) | Cost | Risk | Verdict |
|---|---|---|---|---|---|
| A | **Confirmation-push pilot** — declared/learned meal+med windows → actionable local notifications → reconciliation card; per-schedule opt-in; self-pruning; unanswered = nothing | Scheduled-routine (highest volume) | S — pure Expo, no backend, no native | Notification fatigue if sloppy → Principle 4 ratification (OQ); permission-ask UX | **Now (B-288)** — also the cheapest test of the whole thesis: if answering-not-initiating doesn't move scheduled-slot coverage in our own dogfood, widgets won't save us |
| B | **Out-of-app write path + App Intents + one interactive widget** (+ free riders: Siri phrases, NFC recipe, Action Button/Controls, Back Tap) | Spontaneous-micro (highest clinical stakes) | M — the write path is the real work; surfaces are cheap after | Native-target ratification (OQ); dev-client QA switch; iOS 17/18 floors | **Next (B-290 → B-291)** — the platform bet with compounding returns |
| C | **Household shared care, minimal** — invite, shared write, `logged_by`, RLS | All rows ×N caregivers | M — backend + invite UI, zero native | Access-control surface (reviewer mandatory); scope creep toward social | **Next, parallel with A** (disjoint files) — gated on OQ |
| D | **Post-incident watch-window Live Activity** | Incident aftermath | M — rides B's extension | ActivityKit episode limits; copy must never reassure | Later (B-293) — highest brand-moment upside |
| E | **Watch app** | Spontaneous-micro, hands-full | L — native SwiftUI app | Biggest lift; value partially covered by B + mirrored Live Activities | Later (B-295), gated on B telemetry |
| F | **Passive hardware integrations** | Continuous (Sam) | M–L, fragile external APIs | Small install base; provenance discipline | Later (B-294), spike/partnership |
| G | **Gamification / streaks** | Week-6 decay | S | Motivation crowding; guilt = brand violation; fabricated-data incentive | **Don't.** Adopt only competence/identity feedback about the record (§2.5) |
| H | **Full social suite** (feeds, reminders-to-partner) | — | M | §5 | **Don't (v1).** C's primitive only |

**Why this order:** A is the cheapest falsifiable test of the core hypothesis and needs nothing ratified but copy rules. C multiplies every later surface and is pure backend (parallelizable with A — the one shared-file collision is STATUS.md at wrap). B is the strategic platform investment; its Open Question (native targets) should be decided *after* A's pilot data exists, which also derisks the "are we sure?" conversation. D/E/F sequence behind the foundations they reuse. Competitive note: no pet app in our landscape docs is tracked as having gone deep on OS surfaces — the refresh (B-194) doesn't even have the column yet (B-296 adds it + a Dog Recruit teardown); "the OS-native pet logger" is plausibly ownable whitespace and App Store featuring bait (Apple showcases App Intents/widget adopters), i.e., distribution upside on top of retention.

---

## 7. What we deliberately won't do

- **Streaks, points, badges, leaderboards** — §2.5. The acceptable subset is bounded-goal progress tied to something the owner already owns ("Day 12 of 28 — logged"; "27 of 28 days complete — vet-ready"), in Nyx voice, no celebration on worrying events (B-063's tone-aware rule).
- **Assumed logging.** No surface ever defaults an event into existence (B-156 G1 generalized). A meal the system *expected* but nobody confirmed is displayed as a gap, not a meal.
- **A permanent Live Activity logging panel** — fights ActivityKit's episode semantics; Controls/widgets are the persistent surfaces.
- **Partner-directed nagging** — pet-centric visibility only (§2.6, §5).
- **Hardware-first strategy** — passive capture is the endgame for the continuous class but the install base is tiny; it cannot be the wedge's capture plan.

---

## 8. Assumption audit → research plan (cheap tests first)

| # | Assumption | Test | Cost |
|---|---|---|---|
| 1 | Meal times are regular enough for schedule inference (learned windows) | **Run on our own data now**: cluster `meals.occurred_at` per pet across the dogfood dataset; report per-pet window tightness | One analysis session |
| 2 | Lapses are friction-driven (not value-doubt-driven) | Dogfood diary during A's pilot: for each missed slot, was it "forgot/couldn't" or "why bother"? (If value-doubt dominates, the fix is Signal feedback loops — B-047 — not surfaces) | Rides the pilot |
| 3 | The 10-minutes-after-a-trigger context (where's the phone? hands?) | The `nyx-research` §Jordan open question (5-person diary study) — still unanswered, now load-bearing; Designer owns | Small study |
| 4 | Notification opt-in will be granted | Instrument the permission primer (B-283 PR 3 surface); pre-ask copy per nyx-voice | Rides A |
| 5 | Households are two-iOS-adult | Ask in onboarding later; for now note Android-spouse breaks the household multiplier, not the single-user value | Free |
| 6 | Couple-accountability generalizes | Treat as upside, not load-bearing (§5); observe via `logged_by` mix once C ships | Free after C |
| 7 | Competitors haven't taken the OS-surface ground | Dog Recruit teardown + OS-surface column at the next B-194 quarterly re-check (B-296) | Small |

**Measurement honesty:** pre-launch, n = a handful of dogfood households. Gates are mechanism telemetry (permission grant, response latency, response rate by hour-of-day, surface mix via `logged_via`) plus diary qualitative — not statistical significance. Define the capture-rate proxies *now* so the TestFlight cohort inherits them; B-047's instrumentation plan is the natural home.

**Kill criteria (proposed):** A: if after 3 weeks of dogfood the confirmation path isn't producing ≥50% of scheduled-slot logs (vs. app-initiated), or the PM household mutes it, stop and re-diagnose before any native investment. B: if the widget/intent surfaces aren't producing ≥20% of spontaneous-event volume after a month on dogfood devices, don't fund the watch app on vibes.

---

## 9. PM decisions needed (filed in CLAUDE.md Open Questions, 2026-07-10)

1. **Are owner-configured scheduled confirmations "nudges" under Principle 4's one-per-day cap?** Proposed: no — the cap governs unsolicited nudges; confirmations are a *tool the owner configured*, guarded by per-schedule opt-in, fail-safe silence, self-pruning after 3 ignored days, and a per-account budget (B-015's note). Blocks A (B-288). Designer holds the counter-position (channel-trust is one bucket regardless of consent) — genuine conflict, PM call.
2. **Adopt the minimal household shared-care primitive as capture infrastructure?** (invite + shared write + `logged_by` + RLS; explicitly not a social layer.) Blocks C (B-292); multiplies B.
3. **Ratify native extension targets via CNG as inside the "managed workflow, no ejection" constraint** — accepting bounded SwiftUI in `targets/`, EAS-built, and the Runtime-B switch from Expo Go to a dev client. Blocks B (B-290/291), D (B-293), E (B-295).

Follow-up questions for the PM (non-blocking, would sharpen the next session): typical meal-time regularity in your household (informs #1's inference vs. declared-windows choice); does your wife carry an iPhone + Apple Watch (household multiplier + E's priority); what did Dog Recruit's logging flow feel like at its best (teardown seed, B-296)?

---

## 10. Artifacts from this session

- This doc.
- Backlog: **B-288** (confirmation-push pilot) · **B-289** (`logged_via` provenance) · **B-290** (out-of-app write path spike) · **B-291** (App Intents + interactive widget thin slice + free-rider recipes) · **B-292** (household shared-care minimal) · **B-293** (watch-window Live Activity) · **B-294** (passive hardware spike) · **B-295** (Apple Watch capture app) · **B-296** (competitive OS-surface column + Dog Recruit teardown).
- CLAUDE.md: 3 Open Questions (§9).
- Platform claims spot-checked 2026-07-10 (post-WWDC26): [Expo widgets SDK docs](https://docs.expo.dev/versions/latest/sdk/widgets/), [expo-apple-targets](https://github.com/EvanBacon/expo-apple-targets), [Expo blog — widgets & Live Activities](https://expo.dev/blog/home-screen-widgets-and-live-activities-in-expo), [WWDC26 App Intents session](https://developer.apple.com/videos/play/wwdc2026/345/), [WWDC26 Live Activities essentials](https://developer.apple.com/videos/play/wwdc2026/223/), [Apple: adding interactivity to widgets](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities). Re-verify OS-version floors at build time.
