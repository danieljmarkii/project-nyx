# Culprit — The Category Play (swing-for-the-fences roadmap)
**Date:** 2026-07-26 · **Status:** Session deliverable / **proposed** — nothing here is ratified until the PM clears §6. Companion to `docs/culprit-competitive-landscape-2026-07.md` (the evidence); this document is the swing the PM asked for.

> **What this is.** The 2026-07-25 competitive review verified four facts: the elimination-diet category is empty (zero of 207 harvested US App Store listings use the job's own words), the clinical job is real (an 8–12 week vet-directed protocol whose named failure mode is owner compliance), the full loop — frictionless capture + food identity + statistical correlation + clinical artifact — is unbuilt by anyone, and our correlation engine is the only verified statistical engine on the shelf. The safe read of that review is a sequenced fix list. This is the other read: **own the category end-to-end before someone else notices it exists.**

---

## 1. The thesis

We stop describing Culprit as a pet health tracker with intelligence and commit to being **the elimination-diet product** — the app for the single question the name already asks: *which food is doing this to my pet?* The job has five acts: **start the trial → keep it clean → prove the culprit → put the finding in front of a vet who trusts it → resolve.** Today we ship pieces of acts 2–4. The swing is all five, both sides of the artifact, in public.

**Why now and not carefully later:** CompanAIn raised and shipped a free-to-clinic vet portal (both June trip-wires fired); ThePawcess is a purpose-built web product one native build away from our shelf; PETKIT commoditizes passive capture this month; frontier models already deliver 60–70% of our value over an acute episode. The moat that survives all three (review §1.⑥) is **sustained structured capture + food identity + the clinical artifact** — every part of which we either have or have specced. The category will not stay empty through 2027.

**Why us:** independence is structurally uncopyable by the strategics (Zoetis/Purina/Mars cannot name a sponsor's food as a culprit), the engine is verified category-unique, and the wedge's front door (B-417) went from zero write paths to PRs 1–3 shipped *in the 24 hours since the review was written*. We are already mid-swing; this plan finishes the motion.

---

## 2. The five swings (plus the gate in front of them)

### Gate 0 — clean the bat *(days; already sanctioned; not a swing)*
You don't swing with an anon-writable bucket. All items are tracked and most are in flight:
- Security triad: **B-397** (delete `view-report` + `zz-deploy-probe`), **B-431** (anon INSERT on `nyx-pet-photos` — **closed 2026-07-26 via #460/migration 042** while this plan was in review), **B-248** (owner-scope `nyx-vet-attachments` — now known to include DELETE).
- **B-280** password recovery PRs 2–4 (PR 1 shipped; SMTP verified).
- Small honesty fixes: **B-399** dev-jargon alert; verify the stool-red-flag deploy discrepancy (review §3.2 vs STATUS v25); confirm the release-binary diagnostics long-press is removed with #412.

### Swing 1 — The only app that can actually run an elimination trial *(owner side; in flight)*
**B-417 PRs 4–7** (trial card v2, off-diet exposure detection, completion milestone, vet-report render — **PR 4 shipped via #454** while this plan was in review) **+ B-351 Phase B** (set-membership correlation in the engine) **+ B-416** (re-derive `proteins` for the live single-protein rows — **shipped via #452** same day). Done means: an owner starts a trial in-app, the engine models *every* protein in every food (a rabbit-and-chicken food never again reads as clean rabbit), and the report answers its own first question — "is this diet trial working?" — with real rows. This is the claim no competitor can currently make at any price: *the only product that models what is actually in the food.*

### Swing 2 — The household runs the trial, not the owner *(trial integrity + retention)*
**B-292** (minimal household primitive: invite a caregiver, shared write, `logged_by`, RLS) **+ B-288** (owner-configured confirmation pushes). These are not "table stakes we're behind on" — inside the category play they are **contamination control** (the unwitnessed spouse-treat is the canonical trial-killer; DogLog et al. ship sharing as convenience, we ship it as protocol integrity) and the **retention spine** that keeps capture alive long enough for the engine to fire (the Bearable warning: a correlation product dies when capture cost exceeds interpretive payoff). Both are gated on PM rulings (§6 D2/D3), not on build capacity. `rls-privacy-reviewer` mandatory throughout.

### Swing 3 — The artifact talks back *(vet side; the boldest net-new bet)*
CompanAIn is buying the reader of the artifact via clinic enrolment. We should **not** race them to a portal — the review's own §8 finding says pet-side interoperability doesn't exist and the owner-controlled, no-vendor-approval PDF is the only route that scales. The counter-move is smaller and meaner: **every shared report becomes a doorway.** The token link a vet opens (Step 9 PR 6's public path, already planned) gains a **one-shot, no-account response leg** — a 30-second structured acknowledgment ("reviewed" / "what I'd want tracked before the next visit") plus optional free text, landing back in the owner's record as a vet-visit note. No enrolment, no login, no relationship for the vet to manage — which is exactly why a busy GP might actually do it. Direction needs ratification as a new Open Question (§6 D4) before any design; `rls-privacy-reviewer` and real-vet input are hard gates (this is an unauthenticated *write* path into a health record — see §7 T&S).

### Swing 4 — Proof nobody else can print *(validation)*
IAMS publishes 90% accuracy on 14k expert-labelled images; we publish nothing and **no real veterinarian has ever read our report**. In order: **R1** — the PM emails the real Nyx report to their own GP (open since 2026-07-02; an email; the cheapest strategic unlock in this entire plan) → **R2** — the booked visit with the report in hand → then **B-467**, a published-validation program: real-vet panel reads of real reports, a written method paper on the case-crossover design (publishable in its own right), accuracy/utility numbers we can print. "Vet-validated" becomes literally true before any store copy claims it — the one claim the review says rivals cannot fake.

### Swing 5 — Claim the category in public *(positioning + submission)*
The store listing leads with the wedge, not "AI": the ownable zero-competition keywords (gated on **B-468** — verify search volume via Apple Search Ads before betting the listing), independence stated plainly (*"the only one that can tell you the culprit is the food you're being sold"*), the engine named by its design (case-crossover, not "AI-powered"), the two-sided uncalibrated-AI framing with the Lovet 25%-regret stat. Pricing gets a deliberate decision, not a default: the diet trial is a *bounded 8–12 week job* and the products aimed at it price accordingly (ThePawcess $39 one-time) — a genuine tension with D-M5's monthly-forward ruling that must be reconciled, not ignored (§6 D5). Swing 5 fires **last**: claims only after Swing 4's proof exists.

---

## 3. What we are NOT swinging at

Ambition without discipline is how the review's §3.2 drift table happened. Explicitly out:

- **Hardware**, and any attempt to out-capture the litter boxes. Our answer to "why log when my box does it?" is positioning (the box sees one box; the food's identity, the stairs, and the spouse's treat are invisible to it), not devices.
- **Android now.** One platform until the category is claimed on it.
- **A clinic portal / EMR integration.** Swing 3 is deliberately the anti-portal.
- **A general chatbot.** Ask stays scoped answer-cards over the pet's own record; the general flag stays off.
- **A social layer.** The T&S surveillance guardrail on B-292 stands — pet-centric visibility only, no feeds, no per-person stats.
- **The emerging-signals tier** — unchanged open PM call; not part of this play.
- **Paywalling anything in the trial loop.** The entire wedge — trial lifecycle, contamination flags, the report, the vet response — is care, not convenience. Pets > $ is the brand's spine and, per §2 Swing 5, also the competitive positioning. Premium continues to wrap convenience only.

**What yields:** the plan proposes **Ask A5–A7 re-sequences behind Swing 1's completion** (or rides as spare capacity) — it was ruled "the next main project" on 2026-07-18, *before this landscape existed*, and nothing in the review's evidence ranks a Q&A surface above the wedge, the household, or the proof. That is a genuine PM re-sequencing decision (§6 D6), flagged, not made. Widget W6 (a TestFlight cut) rides whenever the next build is cut; it's cheap and its DogLog-review evidence says owners want it.

---

## 4. Sequencing and capacity

This repo routinely runs six-plus parallel sessions; the swings are built to fan out:

| Track | Files/surfaces | Runs |
|---|---|---|
| Gate 0 | storage policies, auth flow, dashboard deletes | Now, days |
| Swing 1 | trial surfaces, `detection.ts`, `report.ts`, extraction | Now (mid-stream) |
| Swing 2 | new RLS/schema, local notifications | The moment D2/D3 land |
| Swing 3 | PR 6's public token path, then the response leg | Design discovery after D4; build after PR 6 |
| Swing 4 | PM-led (R1/R2), then B-467 | R1 is **today-shaped** |
| Swing 5 | store assets, pricing, docs | Last, after Swing 4 |

**Known collisions, named up front:** `report.ts` is shared between Swing 1 (B-417 PR 7) and Swing 3 (PR 6 rebuild of `view-report`) — serialize those two PRs. `generate-signal` deploys serialize as always. STATUS.md at wrap is mitigated by the `docs/sessions/` convention. Swing 2's schema PRs are isolated per the standing rule.

---

## 5. What "over the fence" means

Measurable, in rough order:

1. **A real owner who is not the PM** starts, runs, and completes a diet trial entirely in-app — and the vet report answers "is this diet trial working?" from real rows.
2. **A vet we have never briefed** reads the report cold and acts on it (R1 → R2 → panel).
3. **The first vet response** arrives through the artifact's own doorway (Swing 3).
4. **The store listing owns the elimination-diet shelf** — keywords volume-verified, listing live, independence claim in the copy.
5. **A published validation artifact exists** that a competitor cannot produce without our data and our engine.

---

## 6. The decision checklist (everything this plan needs from the PM)

| # | Decision | Unlocks |
|---|---|---|
| D1 | Ratify this document as the operating plan (or amend the swing set) | Everything below |
| D2 | Rule the **B-288 open question** — are owner-configured confirmations "nudges" under Principle 4's cap? Designer's channel-trust dissent stands and is restated in §7 | Swing 2 (reminders half) |
| D3 | Ratify **B-292's OQ2** (household primitive) + the review §11.7 re-prioritization to `Now` | Swing 2 (household half) |
| D4 | New Open Question: **build the one-shot vet response loop, or stay a one-way artifact?** Direction only — design follows | Swing 3 |
| D5 | **Pricing shape** — bounded-job SKU (trial pass) vs D-M5's monthly-forward ruling; explicit reconciliation | Swing 5 |
| D6 | **Re-sequence Ask** (ruled "next main project" 2026-07-18, pre-landscape) relative to the swings | Capacity for Swings 1–2 |
| D7 | Ratify the review's **§11 Tier-2 edits** (supersede the June refresh; correct PerkyPet; downgrade Zoetis/Digitail/Fi; promote CompanAIn; drift table to STATUS.md) | Honest docs |
| D8 | **Send the R1 email** (action, not decision — open since 2026-07-02) | Swing 4, and the "vet-validated" claim chain |
| D9 | The open **B-416 sub-decision** (Class-B re-key of the 3 `ocean whitefish` primaries) — becomes Swing-1-blocking | Swing 1 |

One sitting clears D1–D7 + D9; D8 is an email.

---

## 7. Persona risk register (the team's named risks, with mitigations)

- **Dr. Chen:** *Claims before validation.* Swing 5 is hard-gated behind Swing 4's R1/R2 — no "vet-validated," no accuracy language, until a real vet has read a real report. And Swing 3 must never become a diagnosis channel: a vet response is a **note in the owner's record**, never in-app medical advice we relay or rephrase — liability and register both.
- **Trust & Safety:** *Swings 2 and 3 are the two largest access-surface expansions in the product's history* — household shared-write RLS, and an unauthenticated vet-facing **write** path. `rls-privacy-reviewer` is a merge gate on every PR in both; Swing 3 needs an explicit abuse model before design ships (a leaked link must not let a stranger write into a health record — one-shot, token-bound, owner-revocable, rate-limited, content-typed). **B-041 export** joins Gate 0's tail before any real user base exists: the review confirmed delete works and export is referenced but implemented nowhere.
- **Dir. of Engineering:** *Mid-stream abandonment and scope creep.* No track abandons; Swing 3 reuses PR 6's token machinery — zero new auth systems; schema PRs stay isolated; the two named `report.ts` collisions serialize. The swing adds **no new architecture**, only new surfaces on shipped rails — that's what makes it a swing and not a rewrite.
- **Designer:** *Channel trust is one bucket.* If D2 ratifies confirmations, the per-account budget, fail-safe silence, and self-pruning are **design constraints, not settings**. Dissent recorded, again. Separately: the trial-completion moment (B-284 N6) is Swing 1's emotional payoff — sequence it with PR 6/7, not after.
- **Jordan / Sam:** *Capture cost must stay under payoff.* The 15-second start-a-trial device measurement (B-417 PR 3 residual) is still open; every Swing 2 prompt must survive "while my dog is being weird." The Bearable review is the tombstone we're avoiding.
- **QA:** *The drift table was earned.* No claim enters any doc until a binary or a deploy read-back verifies it — the review itself drifted within 24 hours of publication; freeze it (D7) and keep the standing "claims we cannot make" list current.
- **Product Owner:** *The backlog stays honest.* This plan invents no scope silently: B-467 (validation program) and B-468 (keyword-volume check) are added with this session; the vet loop is an Open Question candidate (D4), not a backlog row; everything else already has an ID.

---

## 8. Changes recorded with this session

- **Added:** backlog rows **B-467** (published-validation program, `Later`, blocked on R1/R2) and **B-468** (ASO keyword search-volume validation, `Next`, blocks the Swing-5 listing).
- **Awaiting PM ratification (flagged, not written):** the review's §11 Tier-2 edits (D7); the two Open Question additions (D4 vet loop, D5 pricing); this document's adoption (D1).
- STATUS.md gains one PM-action pointer to §6. Session record: `docs/sessions/2026-07-26-swing-for-the-fences-category-play.md`.
