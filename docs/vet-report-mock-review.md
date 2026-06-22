# Vet Report Mock — Panel Review & Feedback Log

**Reviews:** `docs/vet-report-mock.html` (Strawman C banded one-pager) · PR #216 · Build Step 9
**Status:** Synthetic-panel pass complete (2026-06-22). **Real-vet panel feedback (R1/R2/R4) is the actual gate — §5 below is reserved for it.**

> **Priority rule (PM directive, 2026-06-22):** on this artifact the **vet lens leads**. PM observations are captured (§3) and cross-referenced to what the vets say; where they conflict on a clinical/report-design call, the vet view governs. Genuine product calls (e.g. the owner band as a distribution channel) remain PM-owned and are routed to the real-vet A/B.
>
> **Honesty flag:** §1–§2 are **synthetic** — the isolated `vet-report-cold-read` GP subagent plus in-context specialist persona lenses (discovery §3). They *inform* the design; they do **not** validate trust. Only real practicing GPs validate R1 (trusted/acted-on) and R2 (handoff moment). Do not treat §1–§2 as the gate.

---

## 1. Isolated GP cold read — PRIORITY (strongest single signal)

`vet-report-cold-read` subagent, reading the rendered artifact with zero build context — exactly how a real GP receives it. **Verdict: CLINIC-READY.** One item it ranks *above* the PM's four, blocking before wider GP review; the rest nice-to-have.

| # | Finding | Severity | Status |
|---|---|---|---|
| GP-0 | **Metronidazole confound was positioned two sections from the trend claim** — a page-1-only reader could credit the diet for an antibiotic started the same day. "Letting the diet quietly take credit for an antibiotic's possible effect is the highest-consequence misread available here." | **Blocking (before real vets)** | ✅ Fixed — `Reading the trend` note now sits directly under the charts |
| GP-1 | Charts had no date axis / trial-start marker — couldn't tell if the worst week was before or after the diet started (the central confound). | Nice-to-have (strong) | ✅ Fixed — dashed trial-start (May 8) line + May 1 / Jun 21 anchors on both charts |
| GP-2 | Owner band: keep it (doesn't erode trust, walled off + disclaimed) but **reframe from success → change + confound**. | Nice-to-have | ✅ **RESOLVED — band removed** (PM, 2026-06-22); report is vet-only |
| GP-3 | Scope is clear ("since last visit", stated 3×). General policy: default since-last-visit + ~90-day fallback; owner range OK **but disclose out-of-window events** (cherry-pick guard). | Policy (spec) | → §4 / spec |
| GP-4 | Page 1 **is** scannable in 60s; SOAP-adjacency genuinely helps familiarity ("oriented in seconds, no app vocab"). Real density issue = restatement (glance ↔ diet) + 2 long notes. Appendices correctly verbose. | Nice-to-have | Partially done (de-dup'd the pre-trial note); rest → §4 |
| GP-5 | Surface chronic duration ("~3 months") on page 1; B&W test-print the zebra/band shading. | Nice-to-have | ✅ Duration added; B&W print = PM action |

Standout praise (unprompted): timestamp handling (`seen`/`est`/`range` + overnight events as windows) — *"the most clinically honest timestamp handling I have seen in an owner-generated artifact"*; denominators everywhere; adherence honest about unconfirmed doses; no causal or falsely-reassuring claim; clears Principle 6 (no branding/decoration).

---

## 2. Specialist panel lenses (in-context, synthetic — discovery §3)

- **GI / internal medicine (v1 default rotation):** Trend + denominators + the metronidazole-confound callout are the right spine for a chronic-enteropathy work-up. The 10 off-diet exposures incl. 3 poultry treats are trial-integrity breaks, correctly surfaced; the "4 of 9 vomits on an exposure day" line is exactly what I'd weigh. Endorses GP-1 (relate the slope to the diet/drug start). Would eventually want fecal-score consistency, but owner data may not carry it.
- **Nutritionist (DACVN, v1 default rotation):** Appendix C is genuinely WSAVA-shaped — amounts, schedule, who feeds, treats, supplements, **and "food used to give meds" (on-trial canned)**, the detail most histories miss. Page-1 "3 poultry-based" correctly flags off-trial allergen exposure on a hydrolyzed trial. Gap (future, owner-data-limited): body-condition score / caloric adequacy.
- **Emergency / criticalist:** Safety-leads slot correctly **empty** for an improving patient (no fabricated "all clear"). The 4 no-log days (3 recent) could mask deterioration — flagged, good. For the **cat / feline-48h-window** case the slot must *lead*; that's the second mock to build.
- **Skeptical / adversarial GP (the trust attack):** Denominators, associational-only, honest unconfirmed-dose adherence, and "deleted entries excluded" all lower my distrust of owner data. The **owner band is the one thing that reads "consumer app" — I'd skip it** (supports a vet-only A/B). My biggest catch was GP-0 (confound positioning) — now fixed. Won't trust owner-set ranges without the out-of-window disclosure (GP-3).
- **Vet tech / practice manager (workflow):** This gets received at the desk and scanned into the PIMS as a document. Needs to print clean mono on Letter/A4 (test the zebra shading) and keep pet-name + range in a header that survives as a filed doc (it does). A filename/header convention for PIMS archival is worth specifying (discovery R8).

---

## 3. PM observations (captured) — cross-referenced to the vet panel

> Verbatim intent from the 2026-06-22 review; the vet read is the priority response.

1. **Bar charts lose meaning without dates.** → **Vets agree** (GP-1 + GI + criticalist). Fixed: trial-start (May 8) divider + May 1/Jun 21 anchors; the chart now answers "did the peak come before or after the diet/drug started?" (it peaked just *after* — clinically interesting).
2. **Do we like the "for the owner" section? Pros and cons.** → **RESOLVED 2026-06-22 — band removed (PM decision).** The report is vet-only (Strawman A); the owner's surface is the Patterns dashboard (B-023). Aligns with the skeptical-GP lens and the original cold-read P6 concern. §8.1 closed → option (a), vet-only.
3. **Should it have a date filter / will it get long (e.g. a year)?** → **Vets: scope is already right** (since-last-visit; this is a snapshot, not the full year). Default = since-last-visit + ~90-day fallback; owner *should* be able to set the range — **but the report must disclose events outside a custom window** (cherry-pick guard, the one new thing the vets add). The range *selection* is an app-side action when generating (the B-023 "Share with my vet" bridge), not a control on the static report. → spec / §4.
4. **Too text-heavy? Familiar enough for a 60s scan?** → **Vets: yes, scannable in 60s, and SOAP-adjacency makes it familiar without teaching.** The real fix isn't "less content" — it's removing page-1 *restatement* (glance ↔ diet) and compressing 2 notes; appendices should stay verbose (reference). Partially done; rest in §4.

---

## 4. Synthesis — disposition

**Applied this session (vet-endorsed):** GP-0 metronidazole adjacency · GP-1 chart dates + trial-start marker · GP-2 owner-band reframe (success→change+confound) · GP-5 chronic-duration on page 1 · partial GP-4 de-dup.

**For the requirements spec (policy):**
- **Report scope policy (GP-3 / discovery §8.3):** default since-last-visit → ~90-day fallback; owner range override; **mandatory "N events outside this range" disclosure** on any custom window (anti-cherry-pick). The vet's strongest non-obvious add.
- **Page-1 de-densification (GP-4):** one home per fact (glance = headline, diet section = detail); compress the timing section to its two-line finding. Editorial — PM to steer how aggressive.
- **PIMS archival header/filename convention (vet-tech lens / discovery R8).**

**Resolved (PM, 2026-06-22):**
- **Owner band removed — the report is vet-only (Strawman A).** §8.1 closed → option (a); R4 is no longer an open A/B. The owner's surface is the Patterns dashboard (B-023). (Formalize §8.1 in the requirements spec.)

**PM manual:**
- **B&W test print** — confirm the zebra-row + owner-band gray shading render cleanly on a mono laser (the brief says it's printed mono often).

**Second mock to build (coverage gap):** the **cat / safety-led case** (Sam, intake-decline + feline 48h window) to exercise the safety-leads slot — Mochi's improving case can't show it. Strengthens R1/R2.

---

## 5. Real vet panel feedback — R1/R2 (THE GATE — to be filled after the sessions)

_Recruit 5–8 real practicing GPs (discovery §10). Capture per reviewer; this is what locks/changes the design before the requirements spec. (R4 — the owner band — is resolved: removed, so the report is vet-only; no A/B needed.)_

| Reviewer (role) | R1 — would you act on it / want it again? | R2 — how would you receive it (phone/print/email)? | Other |
|---|---|---|---|
| _…_ | | | |
