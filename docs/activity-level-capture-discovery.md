# Activity-Level Capture — Discovery

**Date:** 2026-07-15 · **Status:** Discovery output — recommendations pending PM ratification (1 Open Question filed in CLAUDE.md; backlog rows B-344/B-345 filed)
**Trigger:** PM-initiated product discussion. Prompt: *"Discuss capturing activity level. Three candidate mechanisms — (1) a FAB-style event, (2) a push notification, (3) a persistent daily card with an activity-level scale that dismisses when completed. Have the vet and pet-owner personas weigh in on the concept and value."*
**Sibling docs:** `docs/logging-capture-discovery.md` (the 2026-07-10 capture-surface workshop whose **event-class taxonomy** §3 this discussion applies directly); `docs/nyx-research-v1_0.md` (Jordan/Sam motivation); `docs/research/2026-05-feeding-windows-and-partial-eating.md` (the intake-decline clinical asymmetry activity capture inherits).

---

## 0. Where this lands (TL;DR)

1. **Class before mechanism.** Activity level is a **continuous/ambient state**, not a discrete event (logging-capture §3 taxonomy). That single classification adjudicates the three proposed mechanisms before any persona weighs in — continuous states want a **day-close ritual**, never per-event logging.
2. **The concept has real, differentiated clinical value — but the *trend* is the signal, not the daily number.** Activity/demeanor decline is a first-line non-specific marker across pain, cardiac, systemic and metabolic disease; a longitudinal *same-owner* trend cancels the owner-calibration problem that makes Dr. Chen distrust owner-rated severity. Sharpest value is **cat / senior / chronic-pain** cases (Sam's fussy-vs-sick disambiguation), softer for Jordan's GI diet trial.
3. **Of the three mechanisms:** the **persistent-but-dismissible day-close card (#3) is right**; the **push notification (#2) is a Phase-2 amplifier** gated on the B-288 confirmation-push pilot + the unratified Principle-4 nudge-cap question; the **FAB event (#1) is the wrong class** and would clutter our highest-value capture surface.
4. **Two genuine gates to build-readiness:** (a) a **behaviorally-anchored, species-aware scale** wired to the never-reassure invariant — not a bare 1–5; (b) a **Principle-3 placement conflict** (does an owner-*input* card belong on the intelligence surface at all?) that needs a PM/Designer call.
5. **Don't open a standalone track now.** Sequence it to **ride B-288** — same continuous class, same answering-not-initiating day-close ritual; build the surface once, serve both meal-reconciliation and activity rating.

---

## 1. Reframing: what class of thing is "activity level"?

The 2026-07-10 discovery's most useful artifact was the **event-class taxonomy** (§3): different classes of trackable thing fail differently, and one capture strategy cannot serve them all. Placing activity level:

| Class | Examples | Shape | Right strategy |
|---|---|---|---|
| Scheduled-routine | meals, daily meds | time-anchored, predictable | system-initiated confirmation at the window |
| Spontaneous-micro | treats, scraps | unpredictable, 5-second | ambient one-press surface (widget/NFC/Action Button) |
| Incident | vomit, limping | salient, stressful, hands-full | camera-first capture + aftermath window |
| **Continuous / ambient** | grazing intake, water, **← activity level** | **not discrete events; a property of a whole day** | **day-close ritual** (one evening prompt) or hardware sensors |

**Activity level sits in the continuous row, with grazing intake.** Per-event logging is a *category error* for this class — exactly the point Sam makes about grazing ("the baseline must not feel like failure"). This is the load-bearing insight of this discussion.

### 1.1 Two different data shapes — don't conflate them

Nyx already captures `lethargy` as an `event_type` (`nyx-schema-v1_0.sql:153`). That is the **negative pole caught as a discrete symptom** when something is visibly wrong — the owner saw the dog flat and logged it. What the PM proposes is additive and different: **activity as a continuous baseline** whose *trend* over weeks is the signal. A healthy pet generates no `lethargy` events but would generate a stream of activity-baseline ratings; the value is detecting the slow slope *before* it becomes a loggable symptom.

---

## 2. The clinical value question — Dr. Chen + Data Scientist

### Dr. Chen (veterinarian)

**Strong yes on the concept, with one hard condition.**

- Demeanor/activity is a genuine vital sign — the exam grades it (BAR → QAR → obtunded). "He's just not himself / slowing down" is frequently the **first and only early sign** across a huge range of conditions. A gradual weeks-long activity decline is precisely what owners miss and what a vet most wants a record of.
- **A bare "3 out of 5" from an owner is the severity-score input she already discounts** (personas.md: "trusts frequency over owner-rated severity"). Unanchored numbers drift with the owner's mood and calibration.
- Usable *only* with: **(a)** a longitudinal trend from the *same* owner — the absolute number is noise, the change is signal, and intra-owner comparison cancels calibration; **(b)** behaviorally-anchored descriptors, not integers; **(c)** co-occurrence — an activity dip *alongside* reduced intake or a new med is worth far more than either alone.
- Invariant (clinical-guardrails): a low rating may escalate; a run of "normal" must **never reassure**; a "high energy" day must **never suppress** a real symptom signal. Absence of low energy ≠ wellness.

> **Falsification test Dr. Chen tried:** the arthritic senior dog whose owner rates "normal" every day because a 4%/month decline is one they've adapted to. A bare self-rating hides exactly that case; an anchored trend against the pet's own 8-week baseline surfaces it. **Held only if we anchor + trend; failed by a bare 1–5.**

### Sr. Data Scientist

- Continuous class → per-event logging is a category error. (Decides mechanism.)
- **Net-new data shape.** Everything today is discrete events; a daily activity scalar is a slow-moving *time series*, closer to weight (B-186, a periodic measurement) than to a symptom event.
- **Realistic role = descriptive trend + a safety lane, not a case-crossover exposure.** Activity is too slow-moving and confounded (weather, weekday, who's home) to behave in the correlation engine; it belongs on the Patterns dashboard + vet report and as a sustained-decline Signal lane, not as a `detectCorrelations` exposure.
- **Denominator trap (learned on intake, B-320):** if owners rate mostly on *off* days, the baseline biases low and the trend lies. Capture-cadence honesty must be designed in from line one — sparse, owner-biased sampling rendered honestly, never a clean stretch read as "improving."

---

## 3. The owner value question — Jordan + Sam

### Jordan (diet-trial dog owner)

- **Not core to the wedge.** Sent home to track *food and symptoms*; mental model is food↔vomit. A daily activity ask can read as scope the vet didn't order — the busywork that got two prior apps deleted.
- **Will never self-initiate an activity log** — nothing "happened." Opens the FAB only when the dog *did* something.
- *Might* answer one card, one tap, once a day — if it is genuinely one tap and never nags or grades. The instant it becomes a streak or a red "you missed today," Jordan is out.

### Sam (picky-cat owner)

- **Arguably more valuable than intake for Sam.** A cat eating less *and* less active is a different, scarier picture than fussy-but-normal-energy. **Activity is the sharpest fussy-vs-sick disambiguator** for exactly the ambiguity Sam lives in (with the 48h feline window making it urgent).
- Cats make it hard: often unobserved all day (the continuous-class observation gap), and an 18-hour-sleeper's baseline differs. Needs an honest **"didn't see enough today" / skip** — and a normal lazy day must never feel like a *failure*, or it becomes the cutesy gimmick that treats a sick cat as merely "low energy today."

---

## 4. The three mechanisms, adjudicated

| # | Proposed mechanism | Taxonomy verdict | Call |
|---|---|---|---|
| 1 | **FAB-style event** | Treats a *continuous state* as a *discrete event* — **wrong class.** Nothing triggers it → clutters the single highest-value capture surface (the FAB is for "something happened") with a state no one taps proactively. Designer + Jordan reject. *(Narrow exception: a distinct optional "walk / played hard" **exercise event** is a legitimate discrete thing — but that is a different feature than activity *level*, and not the wedge.)* | ❌ Not this |
| 2 | **Push notification** | Right *shape* (system-asks > owner-initiates, §2.1) but **premature.** No natural window like a meal — end-of-day is the only sensible ask time; and it lands inside the **unratified Principle-4 nudge-cap Open Question** (2026-07-10) and spends scarce notification-channel trust. | ⏳ Phase-2 amplifier, gated on B-288 + the nudge-cap ruling |
| 3 | **Persistent card w/ scale, dismiss-on-complete** | **This *is* the day-close ritual the taxonomy prescribes for the continuous class** (§3, Direction A-variant). In-app (no push provider, no channel spend, no nudge-cap question), answering-not-initiating, one tap, self-removing. Strongest of the three. | ✅ Right mechanism — carries the Principle-3 tension below |

**Of the three: #3 is right, #2 rides behind the B-288 pilot, #1 is the wrong class.** The July capture framework already pointed here.

### 4.1 Design tensions #3 must hold (Designer)

- **Home is an *intelligence* surface, not a data-entry surface (Principle 3).** A standing owner-*input* card would be the first data-entry widget on Home. Genuine question: does it belong on Home, or in the **Today zone / a day-close completion moment (B-284 N6) / the evening-reconciliation card** (logging-capture §4 Tier 1)?
- **Never a daily grade or streak** (Pets > $, §2.5 no-gamification). "Did you rate today?" going red is a brand violation.
- **Designed empty/first-run state + self-pruning** — a card ignored ~3 days should stop reappearing (same rule as the confirmation pilot).
- **Honest provenance:** an un-dismissed card records **nothing** (B-156 G1); "didn't observe" must be a first-class answer, never a coerced rating.

---

## 5. Persona conflict — surfaced, not resolved (Persona Conflict Protocol)

> **Designer:** A standing owner-*input* card is the first data-entry widget on Home — Principle 3 says Home curates insight, it does not collect. A daily "rate your dog's energy" prompt risks becoming the chore/streak the wedge user quit other apps over. If it exists, argue for the Today zone / a day-close completion moment / the evening-reconciliation card — off the intelligence surface.
>
> **Dr. Chen / Data Scientist:** Activity *trend* is a first-line clinical marker and the sharpest fussy-vs-sick disambiguator we have (Sam). Not capturing it leaves a real early-warning gap the vet report can't fill — and the day-close card is the only mechanism that fits the data's class.
>
> **PM decision needed (Open Question, filed in CLAUDE.md):** Does a once-daily activity rating belong as an insight-adjacent card **on Home**, or as a day-close/Today moment **off** the intelligence surface? And is it worth opening **net-new continuous-capture scope now** vs. sequencing it to ride the B-288 confirmation-push pilot?

---

## 6. Recommendation

1. **Do it — but frame the value as the *trend*, not the daily number, and lead with the cat / senior / chronic-pain cases**, where it is sharpest; treat Jordan's GI diet trial as a softer, secondary beneficiary.
2. **Mechanism = the day-close card (#3)**, never the FAB; push (#2) is a later amplifier once the confirmation-push infrastructure and the nudge-cap ruling exist.
3. **Two build-readiness gates, both genuine:** (a) a **behaviorally-anchored, species-aware scale** (e.g. "More lively than usual / Normal for {pet} / A bit quiet / Very low / Not themselves") wired to the never-reassure invariant — a Dr. Chen + `clinical-guardrails` design task; (b) the **Principle-3 placement call** (§5).
4. **Schema (build-time, not PM-blocking):** cheapest honest path is an `event_type='activity_check'` daily-state event, sibling of `weight_check`, reusing the timeline / sync / correlation / vet-report plumbing — with **capture-cadence honesty baked in** so we don't recreate the intake unrated-tail illusion (B-320). A dedicated daily-scalar table is the heavier alternative. Data Scientist + Dir. of Eng call.
5. **Sequencing:** post-app-store-readiness (Step 10+). The board is full (vet-report Phase 2/PR6, monetization Tracks 2–3, the B-288 capture pilot). **Ride B-288** rather than standing up a separate track — same continuous class, same day-close ritual; the surface, self-pruning, honest-provenance, and nudge-cap answers are shared.

---

## 7. Artifacts from this session

- This doc.
- Backlog: **B-344** (activity-level capture — concept, day-close card mechanism, gated on the §5 placement call + B-288 sequencing) · **B-345** (`activity_check` daily-state schema shape — build-time, own migration PR when built).
- CLAUDE.md: **1 Open Question** (§5 — Home-card-vs-day-close placement + open-now-vs-ride-B-288).
- No build-phase change; no schema; no app code this session (docs + backlog only).
