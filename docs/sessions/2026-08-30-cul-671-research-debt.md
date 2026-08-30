# §17 research debt — the remaining slices (CUL-671)

**Date:** 2026-08-30
**Mode:** DISCOVERY (verification pass; deliverable is committed docs, no code)
**Issue:** CUL-671 · **Track:** Event Taxonomy Expansion (B-756 / CUL-509)
**Outcome:** shipped via #763

---

## What this was

The last of §17's research debt, left over after the 2026-08-26 hard review discharged the W2-anchor slice. Three items: fold HR-29's evidence-pack corrections in as a dated addendum, finish the remaining fact-check breadth (the FLUTD sign-list beyond W2; the competitor claims), and write the re-query scope rule into §17.

**Item 3 was already done** — the v1.3 pass had written the account-scoping rule into both §17 and §2. Verified rather than redone, and recorded as such.

## What was produced

**`docs/research/2026-08-event-taxonomy-evidence.md` §V — a dated verification-pass addendum.** The pack is a frozen brief, so §V is strictly additive: every claim the pass touched keeps its published wording and gains an inline **⚠ §V.n** pointer to the row that corrects it. That is the §9b shape the spec already uses, and it is the shape that preserves the "what we knew when" record while making a correction unmissable to someone reading the claim rather than the addendum. Ten pointers; one line appended to the header's Verification-status sentence so a reader who never scrolls to the bottom still learns §V exists.

**Headline: no matrix ranking, floor, threshold or score moved — again. Two claims did not survive, and both are competitive rather than clinical.**

## The seven fold-ins (§V.1–§V.2)

Six from HR-29 plus the ISFM quotation spec §9a rule 8 asked for. Two got sharper on re-check rather than being transcribed:

- **Cardalis (§V.1c).** HR-29 recorded ">40 unverified, >30 verified as the in-app alert." Re-checking the public App Store listing found **no numeric threshold at all** — the description says measure, record, track, and "Contact your veterinarian if values increase or if you have concerns." So both halves are unverified from public sources. The >30 operational threshold is fine; it stands on the four primary studies and the Clinician's Brief summary, which is where it should have been cited from. What the Cardalis citation supports is what §5 row 5 already uses it for — a tap-counter RRR app exists and graphs a trend.
- **The never-hairball citation (§V.1d).** Cornell confirmed to carry the 1–5% prevalence and **no mention of hairballs at all**. Of HR-29's three proposed replacements, **PetHealthNetwork's article is dead** (301 to an IDEXX category page) and **Trudell is a vendor** selling the AeroKat chamber. Lead with **VCA**, which carries the confusion sentence, the posture sentence, and — independently — the post-tussive sentence the cough↔vomit adjacency rule rests on. The correction lands in `2026-08-signals-deep-dive.md` §4, where the citation actually lives; a ⚠ pointer went there.

**And one precision finding on rule 8 itself (§V.2).** The rule says the 2025 iCatCare/ISFM consensus "carries the every-cat lead sentence and the male intensifier verbatim." The **male intensifier is verbatim** — *"Urethral obstruction (UO), which occurs almost exclusively in male cats, is a manifestation of LUT disease with life-threatening complications."* The **every-cat lead sentence is ours**: the consensus has no owner-facing sentence of that form. It has the *warrant* — "almost exclusively" is not "exclusively", so a female cat is not exempt, and the triage instruction is population-wide ("Cats presenting with LUTS should be triaged rapidly … to determine if they have UO"). **The rule is clinically unchanged; only its attribution is one notch stronger than its source.** Same defect class as the two corrections either side of it, which is why it belongs in the pass rather than riding through on a discharged slice.

## The remaining breadth (§V.3–§V.4)

**FLUTD.** All seven §C5 rows confirmed. The consensus adds four things for a **W3+** leaf, none touching W2 — the load-bearing one being that **periuria must be distinguishable from urine spraying** ("essential to differentiate medical and behavioural causes"), a gap leaf 6 (`urine_outside_box`) inherits. The safe direction is the consensus's own and matches the house invariant: the ambiguous case routes toward the **medical** read, never the behavioural one.

**And a numeric claim that does not survive:** §C5's three Stella 2011 relative risks (9.3 / 9.8 / 1.6) could not be corroborated from any accessible source — the paper is paywalled, and the accessible release for the same study reports **n=32 (12 healthy + 20 FIC) over 77 weeks** and a **3.2-fold** overall increase, not per-behaviour RRs. The pack never states the n. Do not repeat the RRs; the structural claim the study is actually cited for (this domain is counted as discrete daily events, not rated) is untouched.

**Competitors — two claims fell.**

1. **§B-B whitespace #2 is FALSE**, and was false *fourteen days before the pack was committed*: **PetLog shipped "Reluctant" (eats listlessly but tries) and "Barely ate" on 2026-08-10**, which is offered-vs-eaten, typed and structured. It is the row annotated "Directly validates the intake-is-not-preference wedge." **The surviving claim is stronger than the one it replaces: nobody *routes* a decline toward a health signal.** Capture is no longer whitespace; interpretation still is — and interpretation is what the invariant was always about. No E-axis cell moves (the matrix cites §B-B #4/#7/#9/#10, never #2 — meal refusal is shipped Nyx behaviour, not a candidate leaf).
2. **"No competitor keeps all health capture free" is overstated.** DogLog's gate ($3.99/mo, $39.99/yr) falls on *records and pet count* — vaccinations, medical info, the per-pack pet limit — while its one-tap capture menu reads as free; PetLog states "no login or subscription needed for basic features." The accurate form is narrower and still ours: **no competitor keeps all health capture free *and* free of a pet-count gate.**

**The gate held, and that is the finding worth keeping.** Both dead claims were caught *before* publication: `store-listing-copy.md`'s competitive line sources the diet-trial lane to a different document, so nothing public rested on either. "Re-verify before any public-materials use" did exactly the job it was written for — and three of the six products re-checked had moved in six days, which is why the rule is now stated as **re-verify at use, not at citation**.

One live residual: **PetLog now advertises "AI-powered insights to detect patterns"**, so the flat "no competitor computes food↔symptom correlation" claim in `docs/research/README.md` is contested by a vendor claim nobody has checked. Narrow it or install and verify — flagged, not silently edited.

## Decisions made

None. This pass rules nothing; it verifies. Every edit is a status or an attribution, and the three content edits it surfaced were **proposed, not written** (Tier-2 protocol).

## Persona flags

- **Data Scientist** — the Stella RRs are the classic shape: three precise-looking numbers from a paywalled paper, cited without the n that bounds them. Precision is not provenance.
- **Product Owner** — a competitive sweep has a half-life. This one was stale on one row on the day it was committed, which is an argument for re-verify-at-use over re-verify-on-a-schedule.
- **Trust & Safety** — nothing touched. No data path, no query run this session (the re-query was already done and scoped).

## Documentation updates

**CLAUDE.md (Tier 1, applied inline).** The living-vs-frozen paragraph gained the missing half: it said frozen briefs are *not* edited in place, but never said how to correct one. Now it does — a dated `§V` addendum **plus** inline ⚠ pointers, both halves load-bearing (the addendum alone is unread by anyone who scrolls to the claim; an in-place rewrite destroys the record the freeze exists to keep). With the corollary this session paid for: on a **competitor** brief, re-verify **at use, not at citation**.

**`docs/nyx-event-taxonomy-requirements.md`** — `Last Updated` bumped to 2026-08-30 (living doc, material §17 edit); version stays 1.3, since nothing in the spec's content moved.

**`STATUS.md` — deliberately untouched.** No track started or ended, no standing hold changed, no build phase moved, no pointer went stale. Event Taxonomy Expansion is already named there and its state is in Linear. Per `/wrap` 3b, this session had nothing to write here.

## Files

- `docs/research/2026-08-event-taxonomy-evidence.md` — §V addendum + 10 inline ⚠ pointers + a header pointer
- `docs/research/2026-08-signals-deep-dive.md` — ⚠ citation pointer at §4 (the Cornell/hairball fix)
- `docs/nyx-event-taxonomy-requirements.md` — §17 status: the fold-in and both breadth slices discharged; the three proposed Tier-2 edits named as still owed
- `docs/research/README.md` — index rows: fact-check now complete; the contested correlation claim flagged
