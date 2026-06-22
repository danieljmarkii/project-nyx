# Project Nyx — Research Dossier
**Version:** 1.0 | **Status:** Stable | **Last Updated:** May 2026

---

## About This Document

This document is strategic intelligence. Its job is to answer three questions: Is the problem real? How large is the opportunity? Who are the humans we're building for — and where are our assumptions wrong?

It is not a pitch deck. Sources are cited throughout; inferences and triangulations are explicitly flagged as such.

**Scope:** US market only. Competitive analysis lives in a separate document with its own update cadence.

**Update this document when** new research materially changes the market picture, persona assumptions are invalidated by user research, or a flagged open question gets answered.

---

## Section 1: Market Context

### The Pet Industry Is Large and Growing

The US pet industry reached $158 billion in 2025, projected to hit $165 billion in 2026. Veterinary care and products account for approximately $37–40 billion annually. This is not a niche market.

Pet ownership continues to expand:

- **95 million US households** own at least one pet as of 2025, up from 82 million in 2023
- **71 million households own a dog** (53% of US households); dog ownership grew by ~4 million households year over year
- **49 million households own a cat**, up from 40 million in 2023 — a 23% jump in a single year
- Millennials represent the largest segment of pet owners (30%); Gen Z is the fastest-growing cohort and the most likely to have a multi-pet household (70% own two or more pets)

*Source: APPA 2025 National Pet Owners Survey / 2026 State of the Industry Report*

### Veterinary Visit Patterns — The Window We're Working In

- Average vet appointment: approximately **30 minutes** per AVMA 2024; routine wellness checks run **15–20 minutes**
- Vets complete an average of **15 scheduled appointments per day**
- Patients visit the vet an average of **2.39 times per year**
- The gap between visits grew to **85.8 days** in 2024 — a 48% increase from 2021

That last number is operationally important. Nearly three months passes between appointments. An owner's verbal recall of what happened during that window is the primary diagnostic input a vet receives. That is the gap Nyx closes.

*Sources: AVMA Veterinary Economics Division 2024; Vetsource White Paper 2025*

### Chronic Conditions and the Clinical Wedge

The strongest initial use case for Nyx is reactive tracking — a vet recommends logging as part of diagnosis or management of an active condition. The clinical prevalence data validates this wedge directly.

**Skin and GI conditions dominate vet visits:**

- Skin allergies (atopic/allergic dermatitis) are the **#1 reason dogs visit the vet** — representing 20% of all dog insurance claims in 2023, or over 410,500 individual claims from Nationwide alone. This has been the top condition for 12 consecutive years.
- Stomach issues / gastroenteritis are the **#1 reason cats visit the vet**
- GI disease is the **third most frequent insurance claim category** for dogs overall
- Nationwide's 2025 analysis of 3.3 million claims confirmed: "chronic diseases dominate the most common claims across both species"

*Sources: Nationwide Pet Insurance 2023–2025 claims data; Today's Veterinary Practice*

**Chronic enteropathy prevalence in dogs:**

- An estimated **2.1–2.9% of dogs** show signs consistent with chronic enteropathy at any given time
- Against a US dog population of ~90 million, that's **1.9–2.6 million dogs** in active chronic GI management right now — each one a candidate for dietary tracking
- IBD and related conditions are the most common cause of chronic vomiting and diarrhea in both dogs and cats
- A cross-sectional study of 43,517 dogs (Dog Aging Project) found chronic diarrhea, pancreatitis, inflammatory GI disorders, and chronic vomiting were all prevalent and frequently co-occurring

*Sources: PMC Chronic Enteropathy in Canines 2019; Dog Aging Project cross-sectional study 2025*

**Diet trials are the standard of care — and they require logging:**

- Dietary management is the **first-line approach** to both diagnosis and treatment of chronic enteropathy
- **50–66% of dogs** with chronic enteropathy respond to a dietary change; diet trials are explicitly called the "gold standard for diagnosis of food allergies and food intolerances"
- Elimination diet trials last **8–12 weeks for skin conditions** and **3–4 weeks for GI conditions** — long, compliance-dependent protocols where daily logging is clinically required, not optional
- An 8-week elimination trial achieves complete remission in **over 90% of dogs and cats** with food-responsive disease — but only if the owner actually completes it

*Sources: Purina Institute; BMC Veterinary Research; Today's Veterinary Practice; Tufts Cummings School of Veterinary Medicine*

### Triangulating the Wedge: How Many Owners Receive a Tracking Directive?

No published study directly measures the percentage of vet visits that result in an explicit logging or tracking recommendation. This is a genuine data gap. What we can do is build a conservative bottom-up estimate from the data we have.

**The triangulation:**

Skin allergies alone represent 20% of all dog insurance claims. GI conditions represent another large share. Even excluding cats and uninsured dogs, the conditions for which diet trials are the clinical standard of care are the most common conditions driving vet visits. A veterinary teaching hospital study found that diet trials had been performed in **64% of dogs with GI complaints** prior to specialist referral — meaning primary care vets are already initiating trials at high rates for that population.

**Conservative estimate:** If 20–30% of dog vet visits involve a skin or GI complaint for which a diet trial or symptom log is clinically indicated, and there are approximately 215 million annual vet visits in the US, the addressable pool of "owners sent home with a tracking directive" is roughly **43–65 million visit-instances per year**. Even assuming most owners already have a solution (they don't) and applying a 5% conversion rate, that's 2–3 million high-intent downloads per year from clinical referral alone.

**Flag:** This is a triangulated estimate, not a surveyed number. The open research question below should be answered with primary data before this estimate is used in investor materials.

**The compliance problem makes the wedge bigger, not smaller:**

- Overall owner adherence to veterinary treatment recommendations: approximately **64%** (AAHA landmark study)
- For complex or lifestyle-change treatments — like an 8–12 week diet trial — adherence drops to **20–30%**
- A veterinary teaching hospital study found that only 53% of dog owners presenting for GI issues could even name the diet their pet was eating at the time of consultation

The failure to track is not an apathy problem. It is a friction problem. The owner who can't name their dog's food three weeks into a diet trial isn't a bad owner — they're an owner without a tool.

*Sources: AAHA compliance research; PMC Lincoln Adherence Instrument study; PMC Dietary Information at Consultations study 2022*

---

## Section 2: The Vet Persona

### Dr. Alex Chen — Composite, Small Animal General Practitioner

- 4–8 years in practice; sees 12–15 patients per day at an independent or regionally-owned clinic
- Caseload is heavily weighted toward skin conditions, GI issues, and chronic disease management in middle-aged and senior pets
- Uses a practice management system (PIMS) — though 23.5% of US practices still have no PIMS at all
- Over **60% of vets report high levels of exhaustion** (Merck/AVMA Wellbeing Study 2024); medical records consume 30–40% of the working day
- Operates under constant time pressure: 30 minutes per patient, 15 patients per day, with emergency cases disrupting scheduled appointments

**What Alex actually needs from an owner:**

Structured longitudinal data in a scannable format. Not "my cat sometimes vomits" — frequency, timing, severity, correlation with specific foods, in something Alex can read in under 60 seconds before walking into the exam room. That currently never exists. Alex gets verbal summaries, occasionally a note-app screenshot, almost never anything resembling a clinical record.

**Where Alex is genuinely frustrated:**

- Owners sent home with diet trial instructions who return weeks later with nothing logged, or with "I think it was about three times"
- Repeat sick visits for conditions that better dietary data would have resolved faster — wasting appointment slots Alex doesn't have
- The 8–12 week diet trial protocol is a known compliance problem in practice; vets understand the tool works but know most owners won't complete it without support

**What Alex needs from Nyx specifically:**

Not another app to learn or recommend actively. A PDF or shareable link that surfaces in the appointment workflow without requiring Alex to do anything different. The ideal state: owner walks in, hands over their phone or a printed summary, and Alex has the data before the exam begins. That requires Nyx to generate something clinical-grade — not a pretty timeline, but a structured summary answering: How often? When? What was the pet eating? Any pattern?

---

### Vet Distribution: What It Is and What It Isn't

The brief previously framed vet recommendation as the primary distribution channel. That assumption has been revised. The updated position:

**Vet distribution is a real and valuable lever — not a slam dunk, and not primary. It requires deliberate infrastructure, not a sales motion.**

**The real barriers to vet recommendation:**

1. **Liability awareness.** Recommending a third-party app is a referral without review. Vets in litigation-sensitive environments are conservative about this, especially for anything that touches health data.

2. **EHR/PIMS integration.** The PDF export is a workable MVP bridge. Long-term, data needs to surface inside the system Alex already uses. An app that requires the owner to pull it up mid-appointment won't get recommended twice.

3. **Recommendation fatigue.** Alex is already asked to recommend pet insurance, prescription diets, supplements, dental chews, and parasite prevention — often with commercial pressure attached. Another recommendation competes for finite trust capital.

4. **No reimbursement incentive.** Veterinary medicine has no analog to remote patient monitoring billing codes. Alex has no financial reason to recommend Nyx and no way to bill for reviewing its data.

**The actual distribution model that works:**

Passive infrastructure, not active selling. A QR code on a discharge sheet for patients starting a diet trial. A one-line mention in a post-visit email. Something that requires zero extra effort from Alex to share. Vets forward useful tools; they don't pitch them.

**The realistic distribution sequence:**

1. Owner-first: owners with active conditions find Nyx directly (search, word of mouth, social)
2. Owner brings data to appointment → vet notices it's actually useful → vet starts sharing QR code on discharge sheets passively
3. Vet recommendation becomes a secondary channel that accelerates growth once product-market fit is established with owners

This is the Calm model, not the Epic model. Build for the end user first. If the app is genuinely useful, the clinical recommendation follows.

---

## Section 3: The Pet Owner Persona

### Jordan — Composite, Dog or Cat Owner, Ages 25–42

- Millennial or older Gen Z; the largest and fastest-growing pet ownership cohorts
- Has owned pets for 2–10 years; the pet is a family member, not a possession
- Currently dealing with a specific, active health concern — GI symptoms, recurring skin issues, weight flag at the last checkup
- Left the last appointment with a recommendation to track diet and symptoms
- Did not track. Has no system. Not because they don't care.
- Uses a smartphone constantly; has never found a pet health app that felt worth opening twice

**Why Jordan doesn't track:**

Jordan is not disengaged. When the pet is sick, Jordan googles, worries, and shows up to appointments wanting answers. The failure to track is activation energy. Logging a single event in existing apps involves opening the app, navigating to the right pet profile, selecting a log type, filling in time/severity/food/notes, and saving — a five-step process that fails at step one in the moment the event occurs. By the time Jordan remembers to log it, the details are gone and the habit is broken.

**Research-backed context:**

- **70% of pet owners** identify their vet as their most trusted source of pet health information — a vet recommendation carries genuine authority in Jordan's decision to download and continue using an app
- Owners of pets with chronic conditions like IBD report measurably lower quality of life, more daily limitations, and more distress than owners of healthy pets — Jordan is not abstractly motivated; Jordan is stressed and wants it solved
- **41% of dog owners and 38% of cat owners** are now purchasing premium food (up from prior years); supplements and functional diets have grown sharply — Jordan is already paying attention to diet
- Pet ownership is increasingly identity-driven; Gen Z in particular treats it as part of their personal identity and life structure

*Sources: Boehringer Ingelheim pet owner survey; PMC IBD owner quality of life study; APPA 2025 Dog & Cat Report*

**What Jordan actually wants:**

Not a medical app. Something that feels like logging a Strava run — fast, automatic, satisfying over time. The feedback loop is the retention mechanism: Jordan needs to see the data accumulating into something meaningful, or the habit dies in week two. A weekly AI summary that says "vomiting is down 40% since the food switch" is not a nice-to-have — it's the reason Jordan opens the app on day 15.

**Jordan's relationship with the vet:**

Jordan sometimes feels rushed or out of their depth in appointments. Research confirms owners prefer vets who speak without jargon, at a pace that allows understanding. Jordan wants to show up prepared — with data, with questions, with some confidence. The AI-generated pre-appointment talking points feature directly addresses this: it turns the data Jordan collected into the conversation Jordan wasn't sure how to start.

**The retention risk:**

Jordan is your primary retention challenge, not your acquisition challenge. The owner with an active health concern will download. The question is whether they're still logging in week six when the pet seems better and the urgency has faded. The design has to make the habit worth keeping even when the crisis has passed — trend visibility, proactive flags, a sense of continuity.

---

## Section 4: Open Research Questions

These are questions this document does not yet answer. Each one is flagged by how much it matters for near-term decisions.

**Critical — answer before investor conversations:**

- **What percentage of vet visits for skin/GI conditions result in an explicit tracking or diet trial recommendation?** The triangulated estimate above is directionally useful but not investor-grade. A survey of 15–20 general practitioners would close this. *Owner: PM.*

**Important — answer before UX design is locked:**

- **What does Jordan's daily routine look like in the 10 minutes after a trigger event?** Logging habit design depends on knowing exactly when and where the event occurs — is Jordan at home, at work, on a walk? A 5-person diary study would materially sharpen the logging gesture design. *Owner: Sr. Product Designer.*

- **What do vet discharge sheets actually look like today?** The passive distribution play (QR code on discharge sheet) requires knowing what the current format is and who controls it. This is a 30-minute research task. *Owner: PM.*

**Useful — answer before vet-facing features are scoped:**

- **Which PIMS platforms are most common among independent small animal practices?** The integration roadmap depends on this. Cornerstone, Avimark, and eVetPractice are likely candidates but market share data would focus the effort. *Owner: Dir. of Engineering.*

- **Are there existing apps with published retention or engagement data?** The RVC Pet Diabetes app and DogLog are both in adjacent spaces. A competitive teardown of their UX and any available retention signals belongs in the Competitive Analysis document. *Owner: PM.*

---

## Version History

| Version | Date | Summary |
|---------|------|---------|
| v0.1 | May 2026 | Initial draft. Market context, clinical wedge, vet persona with distribution pushback, owner persona. Open questions flagged. |
| v1.0 | May 2026 | Stable version for project files. Added claims prevalence data (Nationwide 2023–2025), wedge triangulation, distribution model reframe from "primary channel" to "secondary accelerant," expanded compliance data, updated open questions with owners and priority levels. |
