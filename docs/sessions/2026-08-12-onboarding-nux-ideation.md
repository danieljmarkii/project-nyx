# 2026-08-12 — Onboarding & new-user experience: ideation + mock round 1

**Track:** B-745 (filed this session; renumber at wrap if taken on `main`) · **Branch:** `claude/onboarding-new-user-experience-drfs5s` · **Type:** ideation + research + mock round 1 (no app code)
**Prompt:** PM is preparing the App Store submission and has never experienced the app as a new user. Asked for: Designer-led research into best-in-class onboarding, a persona brainstorm, and a set of lower-fidelity mocks showing different directions for (a) the onboarding flow and (b) the in-app new-user experience — noting that priorities change as a user progresses (food → intake → incidents → only then a signal), and that the Signal empty-state work (B-721 SR-2) was an afterthought on another project, not broad coverage.
**Deliverables:** `docs/culprit-onboarding-nux-mockups.html` (round 1, published as an Artifact) + `docs/research/2026-08-onboarding-activation-landscape.md` (frozen evidence brief) + this record.
**Method note:** the codebase audit ran inline; the external research ran as an isolated agent. The Jordan / Sam / Dr. Chen passes this session are **in-context persona takes, not isolated interviews** — two container restarts killed the isolated-interview agents mid-run, and the takes were re-derived in-context against the audit. Flagged for honesty; if the PM wants the un-anchored versions before ruling, they are cheap to re-run.

---

## 1. The audit — what a new user actually gets today

### 1.1 Onboarding (all verbatim from source, 2026-08-12)

| # | Screen | What it does |
|---|---|---|
| 0 | Landing (`app/(auth)/index.tsx`) | Night hero: carved moon + "Culprit" + **"Track symptoms, find triggers. Walk into your next vet visit with answers, not guesses."** · "See how it works ›" (3 light preview cards: *Patterns you can't see / A couple of taps today / Ready for the vet*) · Create account / Log in |
| 1 | Signup (`(auth)/signup.tsx`) | First, last, email, password; TOS line; → disclaimer |
| 2 | Disclaimer (`onboarding/disclaimer.tsx`) | "Culprit helps you notice and record — it can't examine your pet, and it never gives the all-clear…" + "I understand" checkbox |
| 3–7 | Pet setup | Type (Cat·Dog) → name → breed (skip) → gender (skip) → age (skip); progress bar; back preserves values |
| 8 | Paywall (`onboarding/paywall.tsx`) | **Dark in production** (`paywall_enabled=false`, flipped 2026-07-24) — replaces straight to done |
| 9 | Done (`onboarding/done.tsx`) | "You're all set." / "Say hi to {pet} — their home is ready." / **"Go to {pet}'s home"** / "Got another pet? You can add them anytime from your profile." |

**What the flow never asks:** why the owner came (no mission/goal capture — confirmed absent), anything about food, the vet-visit date, eating style (grazer vs meals), or a second pet beyond a closing line. **Nine screens of pet facts; zero screens about the owner's job.**

### 1.2 Day-zero Home (zero events, zero foods)

Render order (`app/(tabs)/index.tsx`): CrossPetSafetyBanner (nothing) → **SignalZone** → TrialStrip (null — no trial) → MedStrips (none) → **TodayZone** → **TrendZone**.

- **Signal, production (flag-off):** "We're getting to know {pet}. Keep logging and the first patterns start to surface in a few days." *(`lib/signalCopy.ts:200`)*
- **Signal, v2 E1 (GA-held behind `signal_design_v2`):** "We're getting to know {pet}. **Day 1 — 0 events so far.**" + ghost receipts for the three watch categories (*Timing / Food connections / Change*) + the safety floor: "If something needs attention sooner, it won't wait for the week."
- **Today:** "Nothing logged yet — how's {pet} doing? →" (opens the log).
- **Trend:** "A few more days of logs and we'll be able to show {pet}'s pattern."

### 1.3 The first log, and where the wedge machinery hides

- **First meal:** + → Meal → FoodPicker: photo-first **"Snap a new food"** CTA; empty copy "No foods yet. Snap one above." → `food-capture` reads the label, **logs the meal itself**, routes home. *The single best first-run moment in the app is behind a FAB and an empty picker — nothing points at it.*
- **Diet trial:** the start affordance is Pet tab → `DietTrialCard` (`no_trial` state) → `StartTrialModal`. Never surfaced on Home day 0. The wedge user's entire reason for downloading is N taps deep on the fourth tab.
- **Foods tab empty (designed, good):** "Tap Add food to start your library, or snap one when you log food — either way it shows up here, ready to reuse."
- **History empty:** "Nothing logged yet" + body. **Report:** reachable day 0 from the profile; renders a near-empty artifact. **Ask:** allowlist-gated (invisible to new users).

### 1.4 The two unpaid debts (the root of the PM's discomfort)

1. **The constitution still says the finish line is the first log.** `design-principles.md` § Onboarding: *"Onboarding is not complete when Jordan finishes setup — it is complete when Jordan logs their first event. Design toward that moment."* B-251 §12 proposed softening this to match the built flow ("land on a warm empty home") — **that Tier-2 edit was never ratified**, and the built flow ends before the constitutional finish line.
2. **Principle 2's foundation was knowingly cut.** "Food library is pre-populated from onboarding — Jordan confirms, not enters" — B-251 D3 removed the food step (right call then: the text form was bad; the photo-first pipeline didn't exist yet). §7 flagged the consequence: *the first meal log is an entry, not a confirmation.* The photo pipeline has since shipped, which reverses the calculus.

**The pattern in one line: B-251 built a clean funnel to an empty room — and B-271 is the proof.** We had to *seed a fake account* so an App Review reviewer could see the product, because a real new user's first week doesn't show it.

---

## 1.5 External research (isolated agent → `docs/research/2026-08-onboarding-activation-landscape.md`)

Six lanes, URL-cited; the full brief is the frozen artifact. What changed this session's thinking:

- **The structural framing:** Culprit's setup moment and aha moment are separated by 1–2 weeks of data accrual — exactly the window where ~77% of apps lose their users (day-3 cliff). The cold-start patterns aren't polish; they're survival.
- **The named calibration schedule (Whoop/Oura):** best-in-class apps publish *what unlocks when* ("first Recovery score day 4… full baseline day 30"; "up to two weeks to learn your averages"). Validates S4 — with the Culprit-specific caution that pre-floor time must never read as "not working yet," because the record is already the product (S3).
- **The pattern we hadn't drawn — the backfill invitation (Flo):** "add anything you remember from the last couple of weeks, roughly is fine" seeds the timeline, moves the Signal floor closer, and makes Home non-empty in minute one. Powerful for the wedge user (the vet visit is fresh; the history is in their head) — but it collides with the witnessed-vs-discovered timestamp honesty work (`2026-05-event-timestamp-uncertainty.md`) and Dr. Chen's back-dated-entry trust concern, so it needs its own design pass. **Flagged as a round-2 concept, not drawn in round 1.**
- **The checklist nuance:** the research lands between our Conflict 2 poles — checklist *mechanics* (persistent, per-pace, one-tap CTAs) wearing **care-plan language** ("Sadie's first week: log her meals today · add anything unusual…"), never "Complete your setup (2/5)." Folded into R-5's options.
- **The category gap:** no pet app designs for the vet-directive moment, none previews a vet-facing artifact, none sets cold-start expectations. Directive-first onboarding + a labeled example report would be category-unique on five named dimensions.
- **Apple specifics:** HIG's "teach through the first real log, not slides" endorses S1 directly; 5.1.1 makes value-before-account cheap review insurance (though Culprit's account-based record is defensible as-is); the B-661 primer flow already matches notification best practice — the addition is *timing* (offer at directive-setup), plus iOS provisional authorization as a soft path worth a look.

---

## 2. Persona takes (in-context; see method note)

**Jordan** (dog; vet-directed elimination trial; has quit two trackers inside a week):
- On the Landing → day-0 gap: *"You promised me answers, then never asked the question. The vet gave me a job tonight; the app should pick it up."*
- On E1: honest but passive — *"it tells me it's watching; it doesn't tell me what to do."*
- On the empty picker: *"The best moment in your app is hidden behind the moment I'm most likely to bail"* — the 9pm first-meal with no guidance is the modeled quit moment (both prior apps died on "the second night, when I had to remember what to do").
- On day-0 trial setup: *"Set it up while the vet's instructions are still in my pocket. In a week I'll have lost the handout."* Vet-visit date: a finish line makes six weeks survivable.
- Keep moment: *"the first time it hands me back something I didn't type."* Before any pattern exists, the one-tap confirm on meal two is the down payment.
- Red lines: no typing in onboarding beyond the name; a checklist card reads as homework (*"fold it into the home's own words instead"*); a nudge that arrives uninvited.

**Sam** (two cats; no vet directive; fussy-vs-sick ambiguity; Pixel grazes):
- On "Who are we tracking?" capturing one pet: *"I have two cats. Asking me to pick one on day 0 is asking me to lie a little."* A one-tap "anyone else at home?" right after pet setup — name + species only — is her top structural ask.
- On the first log: *"'How much did she eat' is the first place the app feels dog-shaped"* — a grazer's bowl sits out for hours. An eating-style question (meals / grazes / mix) that adjusts first-week framing to day-level intake is her top copy ask. Red line: the grazing baseline must never read as failure to log.
- On the mission options: hers is *"I want to know what she actually eats"* — if that option is missing, the question isn't for her.
- On example content: wary — *"if the example is 'vomiting after chicken,' I'll spend week 1 watching for vomit instead of logging meals."*
- The 9pm day-close nudge (opt-in): LOVE — *"the day is the unit that makes sense for Pixel, not the meal."*

**Dr. Chen** (clinical discipline):
- **What makes week 1 usable:** completeness beats precision. *"An 80%-complete week is diagnostic; a 40%-complete week is an anecdote."* The single behavior worth teaching early: **log everything the pet ate, including what you wish you hadn't fed** — the unwitnessed treat is the trial-killer, and owners systematically omit the embarrassing entries.
- **Mission capture:** clinically valuable — *"Reason for monitoring: elimination trial, owner reports vet-directed, started {date}"* on the report header changes how the record is read (it names the question the record answers). Two rules: attribute the directive to the owner's report, never assert it ("per your vet" only as "owner reports"); a self-directed "something seems off" mission must never unlock protocol-flavored advice.
- **Day-0 trial setup:** yes — adherence counts from day 1 and the parameters are in the owner's pocket tonight. Failure mode is mis-configuration; mitigations: species-normed defaults, everything editable, the app never infers the allowed list beyond what the owner picked (all three already B-417/B-616 law).
- **The honesty problem:** "patterns start to surface in a few days" is not signable — correlation candidacy is ~2 weeks of consistent logging; chronicity needs ≥6 episodes over ≥3 weeks. **Promise the record, not the revelation.** *"Week one you may promise a clinic-ready record and that safety flags are on from the first photo — both true from day 1. You may never promise a finding."*
- **The reframe that reshapes the whole track:** the **report is the guaranteed artifact; the Signal is conditional upside.** A correctly-functioning Signal may find *nothing* — so a first-week arc that builds toward "your Signal is coming" over-promises by construction, while one that builds toward "your recheck report is becoming clinic-ready" is guaranteed to pay off *and* is literally the Landing's own promise ("walk into your next vet visit with answers").
- **Example/ghost content:** acceptable under four rules — labeled fiction (a named example pet, "An example — not {pet}"), models *good logging* rather than an alarming finding, timing/pattern-shaped rather than a named-food causation, and visually distinct from the pet's own card grammar.
- **Red lines:** no streaks; no "X days clean"; absence never reassures (a quiet week renders as *counted*, not *clear*); no urgency theater on the arc; back-dated bulk entry stays visible as such in the record.

**Designer** (holding B-251's own bar): every screen is a funnel drop-off — "restraint is a feature" was the ratified bar, and the PM's Landing ruling was *"richer, not longer."* Any added screen must displace weight elsewhere or earn its slot from the wedge. The staged first week must live **inside Home's existing grammar** (the Signal zone's building state, the Today nudge, the strips) — no new furniture, no checklist card, no tour overlays.

**Dir. of Eng:** the mission needs a home (likely `pets`- or account-scoped column + the report header read — own schema PR); the trial-setup handoff has a **hard ordering constraint**: the allowed set needs foods to exist, so any trial-mission flow must run *capture the diet food first, then configure the trial with it*. The first-mile Home work should extend SR-2's E1 (one building state), not fork a parallel one — which puts part of this track behind the `signal_design_v2` GA gates (B-734/B-735) or in front of them as the fix.

**T&S:** a mission answer is health-adjacent data and a vet-visit date is a real-world appointment — both need the deletion story (they ride the account cascade), neither may gate any capability, and "something seems off" must never be surfaced back in notification bodies (B-661 G1 already covers the lock screen).

---

## 3. The spine — proposed cross-cutting rules (ratifiable, R-2)

- **S1 — The finish line is the first log.** Restore the constitution rather than softening it: onboarding is designed toward the first logged event, and the flow's last beat hands the owner into it. (Resolves B-251's still-unratified D13 the *other* way.)
- **S2 — Ask the job before decorating the room.** One optional, one-tap mission question; the first week takes its shape from the answer. Never typed, always skippable, changeable later.
- **S3 — Guaranteed value leads.** The first-week arc progresses toward the clinic-ready record/report (guaranteed); the Signal is framed as conditional upside, never a promised verdict. (Dr. Chen's reframe; composes with clinical-guardrails.)
- **S4 — Honest floors, honest arc.** Every stage claim derives from the engine's real constants (capability framing: "timing patterns need about two weeks of meals"), never invented timelines. Kills "in a few days."
- **S5 — Teach one behavior.** The only instruction the first week repeats: *log everything {pet} eats, including what you wish you hadn't fed.* Completeness over precision, everywhere the arc speaks.
- **S6 — No new furniture.** The arc lives in Home's existing grammar (E1/building state, Today, strips, done-screen) — no checklist card, no tour, no coach marks.
- **S7 — Examples are labeled fiction.** Ghost/example content: named example pet, models good logging, pattern-shaped not food-accusatory, visually distinct. (Chen's four rules.)
- **S8 — A mission never gates.** Every capability reachable on every mission (and on skip); the mission only re-orders and re-words.

---

## 4. The option ladder (nested, like B-721's — each includes the ones below)

**Option 1 — "Say it, then show it" (conservative; zero schema, zero new screens).**
The done screen's CTA becomes **"Log {pet}'s first meal"** (secondary: "Go home first") and hands into the existing snap-first capture; E1/building gains a stage-aware line + one action row (day 0: *snap her usual food*; days 1–7: honest counts + S5; week 2: capability line), copy keyed on the real floors; Trend/Today empty copy joins the same arc. Fixes the honesty debt and the hidden-best-moment problem. *Cost: S; composes with B-734/B-735.*

**Option 2 — "The mission" (moderate; +1 screen, one schema PR).**
Adds the mission question after pet setup (4 options + skip: *vet asked us to track something / starting a diet trial / something seems off / just keeping records* — Sam's "what does she actually eat" variant under consideration as a 5th or a cat-conditional). The answer: re-words the first-week arc, chooses the day-0 lead (trial-led vs watch-led vs food-led), lands on the report header (Chen's "reason for monitoring"), and for trial-mission users chains into Option 3's handoff. *Cost: M (screen + column + report line).*

**Option 3 — "One photo, four outcomes" (the wedge concierge; the swing).**
For the diet-trial mission: onboarding's last beat is **snap the diet food the vet handed you** — that single photo seeds the library (Principle 2 restored), logs meal #1 (S1's finish line), becomes the trial's allowed set, and pre-fills the start-a-trial sheet (start today, species-normed duration, everything editable). Optional vet-visit date ("when's the recheck?") makes the report the visible finish line. Plus: the one-tap second-pet moment (Sam), the day-2/3 in-app notification-primer moment (B-661's flow, offered contextually, never in onboarding — D11 holds), and the labeled example card (S7) where the mission implies the owner should see what a finding looks like. *Cost: L; the trial handoff sequencing (food-before-trial) is the Eng constraint above.*

---

## 5. Conflicts surfaced (Persona Conflict Protocol — for the PM, not resolved)

**Conflict 1 — the mission screen vs the funnel.**
> **Jordan + Dr. Chen + the wedge thesis:** the mission is the highest-value question the flow can ask; the trial user's intent is the product's whole reason.
> **Designer (B-251's ratified bar):** every screen is a drop-off point; "restraint is a feature" and "richer, not longer" are both PM-blessed. A skippable screen still costs every non-wedge user a beat.
> **PM decision needed (R-3):** does the mission earn a screen for everyone, or only appear conditionally (e.g. as one question folded into the done screen), or not at all?

**Conflict 2 — checklist vs ambient arc.**
> **Research pattern:** setup checklists are the dominant activation pattern in tools (Linear/Notion) and appear in consumer health.
> **Jordan:** *"ticking boxes is homework"* — and Sam reads a checklist with "Add Juniper" as the app grading her household.
> **Designer:** S6 — the arc belongs inside existing zones.
> **PM decision needed (R-5):** ambient arc only (recommended), or is a dismissible checklist card worth testing?

**Conflict 3 — where the first-mile Home work lands relative to `signal_design_v2`.**
> **Dir. of Eng:** extending E1 means building behind the GA-held flag (clean, one building state, but invisible until GA) — or patching the old flag-off building copy too (reaches submission users immediately, small duplicated effort).
> **PM decision needed (R-6):** which side of the flag does the first-mile ship on — v2-only, or both?

---

## 6. Decision gates (mirrors the mock's React section; presented as briefs there)

- **R-1** — How far up the ladder? (1 / 1+2 / full 3; and what must land before submission.)
- **R-2** — Ratify the spine S1–S8 (S1 formally resolves B-251's D13 the extend-the-flow way; S3 is a framing change with copy consequences across the arc).
- **R-3** — Conflict 1: the mission screen's existence/placement + option set (incl. Sam's 5th option).
- **R-4** — Example/ghost card: in (under S7's rules) or out.
- **R-5** — Conflict 2: ambient vs checklist.
- **R-6** — Conflict 3: which side of the `signal_design_v2` flag.

## 7. Session outcome

- Round-1 mocks committed (`docs/culprit-onboarding-nux-mockups.html`) + published as an Artifact; evidence brief committed (`docs/research/2026-08-onboarding-activation-landscape.md`); B-745 filed; STATUS.md updated.
- No app code, no schema, no copy changes to shipped surfaces.
- Next: PM reacts to round 1 → requirements doc (`docs/nyx-onboarding-nux-requirements.md`) with the PR plan, per the house track pattern.

**Persona sign-off (ideation):** Designer ✓ (audit + spine + ladder authored; funnel dissent recorded) — Jordan ✓ / Sam ✓ / Dr. Chen ✓ (in-context takes; method-flagged) — Data Scientist ✓ (S4 floors sourced from engine constants; no new statistics) — Dir. of Eng ✓ (ordering constraint + flag sequencing named; no ejection, no new deps implied) — QA N/A (no build) — T&S ✓ (mission/date data rights named; no boundary change this session) — Product Owner ✓ (B-745 filed; B-251 debts cross-referenced, no scope invented).
