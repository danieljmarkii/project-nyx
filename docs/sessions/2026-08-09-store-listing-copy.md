# App Store listing copy — Culprit (guide step 13, B-269)

**Date:** 2026-08-09 · **Outcome:** shipped via #617

## What shipped

Drafted **`docs/store-listing-copy.md`** — the App Store listing metadata for the 1.0 submission, delivered for PM review, with every field character-verified inside Apple's limit:

- **Subtitle** (proposed) `Diet trials & symptom diary` — 27/30
- **Promotional text** `Your vet said to track it — Culprit makes it a two-tap habit…` — 157/170
- **Description** — 2,511/4,000 (seven scannable sections + disclaimer/emergency line)
- **Keywords** `elimination,food,allergy,sensitivity,novel,protein,hydrolyzed,vomiting,diarrhea,itching,vet,dog,cat` — 99/100
- **Name** (locked, B-272) `Culprit — Pet Health Tracker` — 28/30

Trackers updated in the same PR: submission-guide **step 13** row (→ 🟡 drafted, awaiting PM review) and backlog **B-269** (→ Partial: copy done, screenshots + age-rating questionnaire remain). One surgical STATUS.md edit annotating the runway PM-action item's "listing copy" as drafted.

## How it was grounded

- **Wedge (research §1 + `culprit-competitive-landscape-2026-07.md` §1③):** the elimination-diet / diet-trial lane is verified *uncontested* — zero competitors, zero of 207 harvested App Store listings carry "elimination diet / food trial / novel protein / hydrolyzed." The subtitle + keywords plant a flag directly in it, and the description leads with the diet trial. Positioning leads with **the artifact + the finding, and independence** ("not owned by a food or pharmacy brand" — the brand name does the work), **not** "AI" (cheap on this shelf, per the audit's explicit guidance).
- **Pets > $:** care features stated free in the present tense (true today — nothing is gated; paywall is a flagged-off mock).
- **nyx-voice:** no exclamation marks, specific-over-generic (two taps, 8–12 weeks, 3–6 hours, chicken), warm-not-cute, plain language.

## Clinical honesty (the load-bearing part — Guideline 1.4.1 + 4+ age rating)

The copy is read by App Review against **1.4.1 (Physical harm)** and must match the age-rating answers. Documented pass in the doc's §6: **no diagnosis / treatment / medical-advice claim** (stated outright: "It does not diagnose… leaves the diagnosis to the professional who can make one"); **no reassurance-on-absence** (the one trend example is framed "patterns to bring to your vet, not verdicts" — a multi-sample trend, never an n=1 all-clear); **disclaimer + emergency line** in the description. Age-rating answer pre-written: *"informational pet-health tracking, not medical treatment or diagnosis"* → **4+**.

## The scope guard (why this isn't just four strings)

The July competitive audit found the docs had drifted **ahead of the shipped binary**, and store metadata describing features not in the build is a Guideline 2.3.1 rejection. The doc carries a **"claims we do NOT make"** list (§7) scoped to what actually ships: **no** reminders (only an off-by-default daily summary exists), **no** shareable vet *link* (delivery is an on-device PDF — the copy says "export a PDF… hand it over or send it ahead"), no widget/Ask/barcode/data-export claims. Diet trials **are** featured because the B-417 lifecycle shipped (PRs #450–481) — with a §8 pre-submission verification list flagging that the cut build must contain it and that the vet-report trial block rides the **B-494 `generate-report` redeploy**.

## Decision surfaced (not resolved — carried in the merged doc)

**Subtitle fork.** B-272 already locked **"Track symptoms, find triggers"** (29/30) into ASC on 2026-07-08, before the diet-trial lifecycle shipped and before this positioning existed. Presented as a decision brief (doc §2/§8, PR body): **(A)** adopt "Diet trials & symptom diary" (recommended — carries the wedge into the index, safe record-keeper register) vs **(B)** keep the locked value (on-brand but omits the wedge, "Track" dupes "Tracker", needs a keyword swap). The two options are **coupled to the keyword string**. Not silently overwritten; PM rules and I finalize.

## DoD / gates

Docs-only, no code / schema / store logic → `tests: N/A` (Engineer exemption). Character limits verified programmatically (not by eye). Persona sign-off: **Designer** (nyx-voice) · **Trust & Safety** (1.4.1) · **Product Owner** (ASO no-overlap + ownable-term coverage + the unverified-search-volume caveat). No adversarial-reviewer needed — no clinically/statistically load-bearing *logic* changed; the clinical bar here is a copy-honesty check, done in-context against clinical-guardrails Pattern 6.

## Residuals

- PM subtitle decision (above) + paste into ASC + answer the age-rating questionnaire.
- §8 pre-submission verification (build contents + the B-494 redeploy) before submitting — the guardrail against a 2.3.1 metadata mismatch.
- Keyword **search-volume** is unverified (competitive §9): the terms are uncontested but validate with Apple Search Ads before spending on ASO. Organic listing costs nothing to ship as-is.
