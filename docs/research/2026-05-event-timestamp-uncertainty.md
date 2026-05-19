# Event Timestamp Uncertainty — Witnessed vs Discovered Incidents

**Date:** May 2026
**Prepared for:** Nyx product team
**Clinical lens:** Dr. Alex Chen (DVM)
**Owner lens:** Jordan + five fabricated peer personas
**Scope:** What we currently know — and don't know — about how often pet owners *witness* an incident (vomit, diarrhoea, accident) versus *discover* it after the fact, and what that means for an event-logging schema built around a single precise `occurred_at` timestamp.
**Status:** Point-in-time evidence capture. Not a product decision. Informs future schema, design, and correlation-engine decisions.

---

## 1. Trigger

Two real-world incidents reported by the PM while using the MVP:

1. **The 4am treat counter.** PM woke to a pile of vomit on the kitchen counter, next to where treats had been placed at ~4am. Reasoned reconstruction: pet ate the treats, vomited there, returned to rest. PM has a confident *point estimate* (~4am) but did not witness the event.
2. **The 2pm–4pm bedroom window.** PM found two vomit piles in the bedroom at ~4pm. PM had passed through that room at ~2pm and confirmed it was clean. The incident occurred inside a *bounded window* (2pm–4pm); no point estimate available within it.

Both incidents currently force the owner to commit to a single precise timestamp in the log. The schema does not represent the difference between (a) witnessing an event, (b) reasoning to a point estimate, or (c) bounding a window.

---

## 2. The Current Schema's Implicit Model

`events.occurred_at` is a single `timestamptz`. The correlation engine and vet report read this field as ground truth. Nothing in the data model surfaces:

- Whether the timestamp was witnessed or estimated.
- Whether the timestamp is a point estimate inside a wider known window.
- The width or edges of that window when one exists.

This is the same accuracy problem veterinary history-taking has documented in clinic — owner-reported histories are known to conflate witnessed and inferred events ([Clinician's Brief — History-Taking](https://www.cliniciansbrief.com/article/history-taking)). The clinical workaround is reflective listening: the vet paraphrases back to flush the difference ("It sounds like Leo had two episodes this morning — did you see both, or find them?"). The app currently has no equivalent.

---

## 3. Witnessed-vs-Discovered Prevalence

### 3.1 Persona estimates — Jordan + five peer owners

The internal working assumption coming into this brief was that ~80% of incidents are witnessed and the discovered case is the edge case. That number had no data behind it; it was a designer's prior. The PM challenged it. To stress-test, the product team sketched five additional pet-owner archetypes alongside Jordan and assigned each a plausible witnessed-rate estimate.

> **These are fabricated persona estimates, not survey data.** They are useful for sizing the question, not for staking a decision. The "Open Questions" section below proposes a real survey.

| # | Owner archetype | Pet | Lifestyle | Witnessed % | Rationale |
|---|---|---|---|---|---|
| 1 | Jordan | Mochi, 4yo dog, GI issues | Works full-time, partnered | ~30% | Most incidents overnight or while at work; reconstructs from evidence. |
| 2 | Priya | Indoor cat, 7yo | WFH, home most days | ~20% | Cat is a private vomiter; usually found behind furniture. |
| 3 | Hank | Senior dog, 12yo | Retired, home all day | ~70% | Constant proximity; observes most events directly. |
| 4 | Lena & Marcus | Two young dogs | Family w/ kids, suburban | ~50% | Multiple eyes but dogs spend time unsupervised in yard. |
| 5 | Chris | Puppy, 8mo | Lives alone, office 4 days/wk | ~25% | Crated during work; most events overnight or crate-bound. |
| 6 | Sam | Indoor cat, 3yo | Frequent traveler, sitter visits | ~15% | Pet camera + sitter coverage; still finds dried evidence on return. |

**Persona average: ~35% witnessed, ~65% discovered.**

Variance is wide and tied to lifestyle, not pet temperament. Only the retired-owner archetype, with continuous presence, exceeds 70%.

### 3.2 Literature findings

No published study directly quantifies witnessed-vs-discovered ratios for owner-reported pet incidents. That absence is itself the most important finding here — the 80% prior is not contradicted by evidence, but it is also not supported by it.

Adjacent evidence that bears on the ratio indirectly:

- **Bilious vomiting in dogs is mechanistically biased toward unwitnessed hours.** It "usually occurs in the early hours of the morning" or "late at night, when the dog's stomach is empty," driven by fasting-state gastric motility. Pets fed once a day or irregularly are most at risk ([AKC — Bilious Vomiting Syndrome](https://www.akc.org/expert-advice/health/bilious-vomiting-syndrome-in-dogs/); [Wag — Bilious Vomiting Syndrome](https://wagwalking.com/condition/bilious-vomiting-syndrome); [K9 Magazine — Morning vomiting](https://www.k9magazine.com/why-is-my-dog-being-sick-in-the-mornings/)). A clinically meaningful slice of vomit events occurs precisely while the owner is asleep.
- **Vomiting is common and largely managed at home.** The Dogslife longitudinal cohort (6,084 Labrador Retrievers) found 18.9% of dogs vomited in a two-week observation window. Only **28% of vomiting reports led to a vet visit** ([Dogslife cohort — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5424887/)). Owners are the primary observers; their records are the dataset. A second four-breed cohort ([PMC: longitudinal study, four large breeds](https://pmc.ncbi.nlm.nih.gov/articles/PMC3293024/)) reached a similar conclusion.
- **Feline vomit reporting is known to undercount.** The cat hairball literature acknowledges that owner-observed endpoints systematically miss events because cats vomit in concealed locations and during unobserved hours ([PMC — Hair balls in cats](https://pmc.ncbi.nlm.nih.gov/articles/PMC10816490/); [Canadian Veterinarians — Hairballs are not normal](https://www.canadianveterinarians.net/media/dojiquvt/hairballs-are-not-normal.pdf)).
- **Veterinary clinicians treat owner history as known-imperfect input.** "Most of the time, the owner or attendant fails to provide pertinent and adequate history and inaccurate history may lead to misdiagnosis." Best-practice technique is reflective listening to disambiguate witnessed from inferred ([Clinician's Brief — History-Taking](https://www.cliniciansbrief.com/article/history-taking)).
- **The pet-camera market is an indirect tell on owner awareness of the gap.** Two-thirds of pet owners use a camera to check on pets; 44% check in four or more times daily ([Comcast pet camera survey](https://corporate.comcast.com/press/releases/two-in-three-pet-owners-use-camera-to-check-in-on-pets)). Owners are aware that incidents happen when they're not watching, and a meaningful subset is already paying to close that gap.

### 3.3 Convergent reading

Persona estimates and literature converge on roughly the same picture: **discovered incidents are not an edge case; for dogs they may be the majority, and for cats they almost certainly are.** A defensible working range, pending real survey data, is **witnessed 30–40% / discovered 60–70%**, with cats skewing toward the discovered end and dogs in households with continuous human presence skewing toward the witnessed end.

> **Designer's note (logged for the record):** The 80% prior was wrong directionally, not just numerically. It led the team into treating "witnessed" as the default UX path and "discovered" as a secondary affordance. The evidence here flips that priority.

---

## 4. Why It Matters Clinically

A false-precision timestamp is not a neutral data choice. It propagates into differential diagnosis.

- **Acute vomiting / regurgitation.** Symptom-to-meal latency is a primary diagnostic input. A vomit logged at 7:42am that actually occurred at ~4am moves the latency from ~40 minutes post-treats to ~3.5 hours. The first reads as likely dietary indiscretion or sensitivity; the second is more consistent with bilious vomiting syndrome — a different workup with a different management plan (see also the [2026-05 feeding-windows brief](./2026-05-feeding-windows-and-partial-eating.md) §2 for the timing thresholds).
- **Diet-trial correlation.** Elimination-trial protocols rely on temporal proximity between exposures and signs. A meal eaten at 3pm correlated to a vomit "between 2pm and 4pm" is ambiguous in a way the current schema cannot represent. The correlation engine treats it as a clean hit or miss; clinically it is neither.
- **The vet report.** A vet reading "Vomit, 2026-05-18 07:42 ET" assumes that is a witnessed time. If the owner reconstructed it from a pile found at 7:42am, the report is misleading without the owner being deceitful. Dr. Chen has flagged that she would prefer "found at 07:42, occurred between ~04:00 and 07:42" — the wider but honest representation — over the false-precise single timestamp.

> **Dr. Chen's lens:** "Witnessed vs discovered is a distinction I already make in clinic. I ask 'did you see it happen?' on every vomit history I take. The current app surface is asking me to trust answers to a question it never asked."

---

## 5. The Design Space (Observations, Not Recommendations)

Three coarse modeling options have been discussed by the team. Trade-offs only; no recommendation in this brief.

**Option A — Boolean witnessed flag.** Add `occurred_at_witnessed: bool` to `events`. Keep `occurred_at` as the canonical timestamp; the flag tells consumers whether to trust its precision.
- *For:* Minimal schema change. No correlation-engine rewrite. Cheap UX (one toggle).
- *Against:* Discards the actual window in Case 2 (2pm–4pm). A "discovered, ~unknown" event with confidence flag is barely more useful than the current state.

**Option B — Window fields with derived point.** Add nullable `occurred_at_earliest` and `occurred_at_latest`. Keep `occurred_at` as a derived point (midpoint or `latest` when only one edge is known) so existing queries don't break.
- *For:* Represents Case 2 honestly. Backward-compatible reads. Vet report can render either a point or a range as appropriate.
- *Against:* Correlation engine eventually needs to weight windowed events differently (Step 10 concern). Two additional fields in every event.

**Option C — Confidence enum + optional window.** Add `occurred_at_confidence: 'witnessed' | 'estimated' | 'window'` plus the nullable window fields from Option B.
- *For:* Most expressive. Distinguishes a confident point estimate (Case 1) from a witnessed event from a bounded window (Case 2).
- *Against:* Most schema surface. Risks UX bloat — three categories may be more than the quick-log path can carry without violating Design Principle 1.

A consequential interaction: whichever option ships, the witnessed case must remain a one-tap log. The 30–40% rate is still common enough that taxing it would degrade overall logging compliance, and Jordan was explicit that any added friction on the quick-log path is a non-starter.

---

## 6. Open Questions

The literature does not resolve, and the team has not decided:

- **What is the real witnessed-vs-discovered ratio, measured?** No published study directly quantifies it. A short owner survey (N≥30, recruited via Reddit /r/dogs and /r/cats, Typeform-style, three questions) could replace persona guesses with real data inside a single sprint. Cost is near-zero; signal is high.
- **Does the ratio differ enough between species to justify divergent UX?** Persona estimates and the cat literature both suggest cats skew discovered; whether this warrants species-conditional UI is unclear.
- **Recall bias on the witnessed rate.** Owners may over-report witnessing because witnessed events are more memorable. Even a real survey may produce an inflated witnessed number relative to ground truth.
- **For windowed events, how should the correlation engine weight them?** Use the midpoint? Sample across the window? Down-weight the event's contribution to a correlation score? This is a Step 10 design question, not blocking now, but the schema choice constrains the answer space.
- **Vet report rendering of a window.** "Between 14:00 and 16:00" on a clinical-grade report — does Dr. Chen want a textual range, a visual bar across the timeline, or both? Untested.
- **Edit-history honesty.** If an owner logs a window, later remembers an exact time, can they promote it to witnessed? What does the audit trail look like? Not yet considered.
- **"Found" as an event-type modifier vs a global flag.** Some event types (vomit, diarrhoea, accident) are commonly discovered; others (eating a meal, giving a medication) almost never are. Whether the affordance is global or event-type-scoped is open.

---

## Sources

- [Incidence rates and risk factor analyses for owner reported vomiting and diarrhoea in Labrador Retrievers — Dogslife Cohort (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5424887/)
- [A longitudinal study on diarrhoea and vomiting in young dogs of four large breeds (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3293024/)
- [Bilious Vomiting Syndrome in Dogs (AKC)](https://www.akc.org/expert-advice/health/bilious-vomiting-syndrome-in-dogs/)
- [Bilious Vomiting Syndrome (Wag)](https://wagwalking.com/condition/bilious-vomiting-syndrome)
- [Why Does My Dog Throw Up In The Morning? (K9 Magazine)](https://www.k9magazine.com/why-is-my-dog-being-sick-in-the-mornings/)
- [Hair balls in cats: a normal nuisance or a sign that something is wrong? (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10816490/)
- [Hairballs are not normal: a practical approach to the vomiting cat (Canadian Veterinarians)](https://www.canadianveterinarians.net/media/dojiquvt/hairballs-are-not-normal.pdf)
- [History-Taking: How to Obtain an Effective Patient History (Clinician's Brief)](https://www.cliniciansbrief.com/article/history-taking)
- [Two In Three Pet Owners Use A Camera To Check In On Their Pets (Comcast)](https://corporate.comcast.com/press/releases/two-in-three-pet-owners-use-camera-to-check-in-on-pets)
- Companion brief: [Feeding windows and partial eating (Nyx research, May 2026)](./2026-05-feeding-windows-and-partial-eating.md)
