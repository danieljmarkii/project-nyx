# Design-session kickoff — dose-first medication tracking & the forward-looking "last dose" question

**Status:** Kickoff brief (for a PM-led design session). Not a ratified spec. Created 2026-07-19.
**Prompted by:** the first real "Ask" medication query on TestFlight (see §1).
**Related:** B-302 (promote ad-hoc doses → regimen), B-158 (Ongoing vs Set-an-end framing, done), B-135/B-138 (dose attribution), the Ask track (`docs/nyx-ask-requirements.md`), the medication model (`docs/nyx-medication-logging-requirements.md`).

---

## 1. The trigger

The PM asked Ask, on their own account: *"My cat started a medication called motozol. I have to give it to her for 2 weeks. Can you tell me when her last dose is?"* — and got a deflection ("Ask can only answer from your data set").

Investigation (2026-07-19) found two things:

- **A bug (fixed this session, separate PR):** the owner *had* logged all 5 motozol doses — as ad-hoc, library-item-linked doses (`medication_id` null, `medication_item_id` set). Ask resolved a dose's drug name only from a *regimen*, so those doses were nameless and collapsed into an anonymous "a medication" bucket. Ask literally couldn't see them as "motozol." That naming/attribution gap is now fixed.
- **A product gap (this brief):** even with the doses correctly named, Ask *still* can't answer *"when is her last dose"* — the **forward projection** (course start + duration → final-dose date / days remaining). That data lives only on a **regimen** (`medications.started_at` + `target_duration_days`), and the owner never created one. They logged doses, not a regimen.

## 2. The real problem — dose-first behavior vs regimen-centric data

**The owner did exactly the frictionless thing we want** (logged every dose) and the app still couldn't answer a basic question, because the fields that answer forward-looking questions (start date, course length) hang off a `regimen` object that owners don't reliably create.

Grounding from live data (PM's account, 2026-07-19):
- 2 regimens exist; **0 have a `target_duration_days`**.
- The dominant logged shape is **ad-hoc doses linked to a library item, no regimen** (motozol ×5; ad-hoc prednisone; ad-hoc cetirizine) — exactly what B-135's code comment already calls out ("the dominant signal today is unlinked doses").

So this is a **data-model-vs-behavior mismatch**, not a one-off. The question for the session: how do we let a dose-first owner get forward-looking course answers *without* making regimen bookkeeping a prerequisite to logging (Principle 1: zero decisions at the moment of event; Principle 4: one nudge/day)?

## 3. What "answering it" would require

To answer *"when is her last dose / how many left / what day of the course are we on"* we need, for a drug:
1. a **course start** (a date), and
2. a **course length** (`target_duration_days`).

We already have the exact computation for the *diet-trial* analog — `dietTrialStatus` (day X of Y, days remaining) in both the client and the Ask tool layer. A medication version is a near-mechanical mirror **once the two fields exist**.

## 4. Options on the table (not mutually exclusive)

- **(A) Promote-on-repeat (B-302).** When a drug's ad-hoc doses accumulate (N of the same `medication_item_id`), gently offer "track this as a course? — start date + length." Captures the two missing fields in one tap, off the back of behavior that already happened. Must respect Principle 4 (one nudge/day, self-pruning) and B-153/B-154 linking.
- **(B) Infer-start-from-first-dose + confirm-duration.** Treat the earliest logged dose of a drug as the course start; ask the owner only for the length (or offer "2 weeks / 10 days / ongoing" chips). Lighter than a full regimen setup.
- **(C) `medication_course_status` Ask tool + profile-card projection.** Once the data exists, mirror `dietTrialStatus`: a tool that returns day-counter / target / days-remaining / final-dose date. Ask surfaces it; the "Current medications" card can show "Day 3 of 14." Adding an Ask tool is a spec change (clinical-guardrails Pattern 8) → its own guardrail + adversarial pass.

Likely shape: **(A or B) to capture the data + (C) to surface it.** The session should pick the capture path and decide whether C ships for Ask, the profile card, or both.

## 5. The one safety guardrail that governs all of it

*"When is her last dose"* is **dosing-adjacent**. The answer must stay a **calendar projection** ("the 14-day course you logged runs through Jul 31 — that's the last day"), never a **stop-taking-it instruction**. Ending a course early (antibiotics especially) is the classic compliance hazard, and end-of-course confirmation is the vet's call, not ours. Copy is "day X of Y / last day is …" and routes any stop/change decision to the vet. Ongoing/PRN meds (null duration) answer honestly: "this one's ongoing — no set end." Inherits the n=1 never-reassure spine.

## 6. Lenses to convene

- **Dr. Chen** — is a course-end projection safe to surface, and where's the line vs a dosing instruction?
- **Designer / Jordan / Sam** — the promote-on-repeat nudge vs Principle 4; the reactive-owner-sent-home-with-a-course is the *wedge* user, so the capture moment matters.
- **Data Scientist** — a regimen span also sharpens the Signal medication-confounder pass (B-138a: dose-as-point under-detection wants the regimen SPAN), so capturing start+duration has a second payoff.
- **Engineer** — mirror `dietTrialStatus`; keep the Ask tool port in lockstep (G5).
- **Trust & Safety** — none new (owner's own data).

## 7. Open decisions for the session

1. Capture path: promote-on-repeat (A), infer+confirm (B), or both? What's the N / trigger for A that respects Principle 4?
2. Does `medication_course_status` (C) ship for Ask, the profile card, or both?
3. Confirm the §5 guardrail copy line and that end-of-course routes to the vet.
4. Sequencing vs the current Ask build (A1–A8) and Step 9/10.

## 8. Proposed first prompt for the session

> Design session: dose-first medication course tracking. Read `docs/medication-course-tracking-kickoff.md`, then `docs/nyx-medication-logging-requirements.md` §3/§5 and the `dietTrialStatus` precedent (client `lib/analytics.ts` + `supabase/functions/ask/tools.ts`). Convene Dr. Chen / Designer / Data Scientist / Engineer. Decide: (1) how a dose-first owner captures course start + length without regimen bookkeeping (B-302 promote-on-repeat vs infer-from-first-dose+confirm), and (2) whether to build a `medication_course_status` surface (Ask tool mirroring `dietTrialStatus`, and/or the profile card). Hold the §5 guardrail: a calendar projection, never a stop-taking-it instruction.
