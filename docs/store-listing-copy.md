# Culprit — App Store Listing Copy
**Status:** 🟡 Draft for PM review · **Date:** 2026-08-09 · **Guide step:** 13 (`docs/app-store-submission-guide.md`) · **Backlog:** B-269
**Author lenses:** Sr. Product Designer (nyx-voice) · Trust & Safety (Guideline 1.4.1 clinical honesty) · Product Owner (ASO)

> **How to use this doc.** Every field below is copy-paste-ready for App Store Connect and is inside Apple's character limit (verified — see the count beside each). Read the **§ Clinical-honesty check** and **§ What this copy deliberately does NOT claim** before submitting — both are load-bearing for a health-adjacent app under Guideline 1.4.1 and must match the age-rating answers. PM decisions and a pre-submission verification list are in **§ Notes for the PM**.

---

## 1. App Store name — LOCKED (do not edit)

```
Culprit — Pet Health Tracker
```

**28 / 30 characters.** Locked per B-272 (guide step 1). This is the *App Store display name*, independent of the on-device name (`app.json` `name: "Culprit"`). The em-dash + descriptor is the strongest single App Store search signal, so the name already carries "Pet / Health / Tracker" as indexed terms — which is why the keyword field (below) never repeats them.

---

## 2. Subtitle (≤ 30 characters) — ⚠️ PM decision: a subtitle is already locked in ASC

**Proposed (recommended):**

```
Diet trials & symptom diary
```

**27 / 30 characters.**

> **Deciding:** whether to keep the subtitle already entered in App Store Connect or replace it with the one above.
>
> **Context:** B-272 (2026-07-08) locked **"Track symptoms, find triggers"** (29/30) into the ASC record — *before* the diet-trial lifecycle shipped (B-417, #450–481) and before the July competitive audit crystallized the diet-trial wedge as the uncontested lane to plant a flag in. Revisiting it now is timely, not second-guessing.
>
> **Options:**
> - **(A) Adopt "Diet trials & symptom diary" (recommended).** Names the wedge in the reactive owner's own words; carries `diet` + `trials` + `symptom` + `diary` into the index (all ownable, low-competition); "diary" is warm and a record-keeper framing that *helps* the 1.4.1 posture. Costs a subtitle edit (allowed — a subtitle change just rides the 1.0 submission, which hasn't happened).
> - **(B) Keep "Track symptoms, find triggers."** On-brand (echoes "find the culprit"), already entered. But it omits the diet-trial wedge, "Track" duplicates "Tracker" in the name (wasted ASO), and "find triggers" is a slightly more assertive/cause-implying register than a record-keeper needs. **If kept, the keyword field must change** — `diet`/`trial` are no longer indexed via the subtitle, so add them to keywords (see §5 note).
> - **(C) "Diet trials & symptom logs" (26)** — same as A if "diary" reads too soft.
>
> **Consequence:** picking A vs B decides both the human sub-headline *and* which wedge terms the keyword field must carry — the two fields are coupled, so decide this before finalizing §5.

Why the recommendation: the entire strategic thrust of this listing — verified in `docs/culprit-competitive-landscape-2026-07.md` §1③ — is the elimination-diet / diet-trial lane that *no competitor and zero of 207 harvested listings occupy.* The subtitle is the second-strongest ASO signal after the name; spending it on the wedge, in the owner's own words, is the higher-conviction play.

---

## 3. Promotional text (≤ 170 characters)

```
Your vet said to track it — Culprit makes it a two-tap habit. Log meals, symptoms and diet trials, then hand your vet a clean report at the next visit. Free.
```

**157 / 170 characters.**

Promotional text sits above the description and is **editable any time without a new build or review** — use it for seasonal or launch messaging later. This draft leads with the wedge (the vet directive), the friction fix (two taps — the real shipped number for a repeat food), the record→report arc, and Pets > $ (Free).

---

## 4. Description (≤ 4000 characters)

```
Your vet sent you home to track it. Culprit makes that easy to keep up.

Whether you're running an elimination diet, watching a new symptom, or just trying to answer "is she getting better?", Culprit turns a few seconds a day into a record you and your vet can actually use.

Confirm, don't type
A diet trial runs 8 to 12 weeks. Symptom monitoring can run longer. Most tools ask too much, so the logging stops by week two. Culprit is built the other way around:
• Log a repeat meal in two taps — the food you set up once is a single tap away
• Note a symptom the moment it happens, one-handed, in seconds
• Snap a photo of a food or its label and let Culprit read the details for you

Made for diet trials
Start a trial, set the food your vet chose, and Culprit keeps the record straight: what was eaten, when something off-plan slipped in, and how the symptoms tracked alongside it. When the appointment comes, the whole trial is in one place — instead of "I think it was about three times."

Patterns to bring to your vet
As your log grows, Culprit surfaces what it notices — like "itching tends to peak 3 to 6 hours after meals with chicken," or a symptom that's been easing since a food change. These are patterns to talk over with your vet, not verdicts. Culprit shows you what the record says and leaves the diagnosis to the professional who can make one.

A report your vet can read in a minute
When it's time for the visit, export a clean, clinical summary as a PDF — frequency, timing, food-to-symptom windows, and the trial so far, laid out the way a vet actually reads. Hand it over or send it ahead. No app and no account needed on their end.

More than one pet
Track every pet in your home, free. Each one keeps its own foods, history, and report.

Care features are free — and stay free
Logging, health flags, trends, insights, and the vet report are free, with no trial clock and no paywall in front of them. If paid features ever arrive, they'll wrap convenience — never the things that keep your pet well.

What Culprit is — and isn't
Culprit helps you observe, organize, and remember what's happening with your pet. It does not diagnose, and it is not a substitute for professional veterinary care. If you're worried about your pet, your vet is the right call — and in an emergency, contact your vet or a local emergency clinic right away.

Culprit isn't owned by a food or pharmacy brand, so nothing here is nudging you toward a sponsor's product. It works for you and your pet — no one else.
```

**2,511 / 4000 characters** (verified). Deliberately not padded to the cap — every line earns its place; filler would dilute the scan.

Description changes require a new version submission (unlike promotional text/keywords). Keep this stable once submitted.

---

## 5. Keywords (≤ 100 characters, comma-separated)

```
elimination,food,allergy,sensitivity,novel,protein,hydrolyzed,vomiting,diarrhea,itching,vet,dog,cat
```

**99 / 100 characters.**

**Rules honored:**
- **No word already in the name or subtitle** — Apple already indexes `culprit, pet, health, tracker` (name) and `diet, trials, symptom, diary` (subtitle), so repeating them here would waste budget. None appear below.
- **Single tokens, no spaces** — Apple builds search phrases by combining tokens across name + subtitle + keywords, so atomic words maximize coverage per character. This list yields high-intent, low-competition phrases the July competitive landscape verified as *ownable* (zero competing listings across 207 harvested pet listings): `elimination` + `diet` → **elimination diet**; `novel` + `protein` → **novel protein**; `hydrolyzed` + `diet` → **hydrolyzed diet**; `food` + `sensitivity` → **food sensitivity**; `cat`/`dog` + `vomiting`/`itching` + `tracker` → **cat vomiting tracker / dog itch tracker**; `vet` + `report`.
- The cluster maps exactly onto the wedge: diet-trial terms (`elimination, novel, protein, hydrolyzed`), skin (`allergy, sensitivity, itching`), GI (`vomiting, diarrhea`), and category/species anchors (`food, vet, dog, cat`).

> **Coupled to the §2 subtitle decision.** This list assumes subtitle **A** ("Diet trials & symptom diary"), which indexes `diet`/`trials`/`symptom`. If the PM keeps subtitle **B** ("Track symptoms, find triggers"), those wedge terms drop out of the index — add them back here, e.g. `diet,trial` in place of two lower-value tokens (drop `cat`→no, keep species; drop `hydrolyzed`+`novel` is the wrong trade — instead swap `food`→`diet` and `sensitivity`→`trial`, keeping the string ≤100). Verified clean either way: none of these 13 tokens overlaps *either* subtitle option.

> **ASO caveat carried from `docs/culprit-competitive-landscape-2026-07.md` §9:** these terms are *uncontested*, but their search **volume is unverified**. An uncontested keyword with negligible volume is not an opportunity. Validate with Apple Search Ads keyword-volume data before spending on ASO; the organic listing costs nothing to ship as-is.

---

## 6. Clinical-honesty check (Guideline 1.4.1 + age rating)

This copy is read by App Review against **Guideline 1.4.1 (Physical harm)** and must be consistent with the age-rating answers and the B-270 veterinary disclaimer. Verified pass on each rule:

| Rule (clinical-guardrails / design principles) | How the copy holds it |
|---|---|
| **Never claims to diagnose** | Stated outright: "It does not diagnose… leaves the diagnosis to the professional who can make one." No feature is described as identifying a disease, allergy, or cause. |
| **Never claims medical advice / treatment / cure** | Absent entirely. Culprit "observe, organize, remember" — a record-keeper, not a clinician. |
| **Never reassures on absence (n=1 asymmetry)** | No "your pet is fine / all clear / nothing to worry about." The one trend example ("a symptom easing since a food change") is framed as a *pattern to bring to your vet, not a verdict* — a multi-sample trend the shipped Signal already states, never a single-sample all-clear. |
| **Health flags surface without alarm** | "health flags" = things worth a vet's attention; no urgent/alarm language, no claim to detect illness. |
| **Points to the vet, including emergencies** | Explicit disclaimer paragraph + emergency instruction ("contact your vet or a local emergency clinic right away"). |
| **Voice (nyx-voice)** | No exclamation marks; specific over generic (two taps, 8–12 weeks, 3–6 hours, chicken); warm-not-cute; plain language, no unexplained jargon. |

**Age-rating answer (for the PM, in ASC): ✅ Entered 2026-08-09 → rated 4+** (full answer record: `docs/app-store-age-rating.md`). The **medical/treatment-information** question was answered *"the app provides informational pet-health tracking, not medical treatment or diagnosis."* This description is written to be consistent with that answer — if the age-rating answer and the description disagree, that mismatch is a rejection trigger.

---

## 7. What this copy deliberately does NOT claim

The July competitive audit (`docs/culprit-competitive-landscape-2026-07.md` §3.2) found the docs had drifted ahead of the shipped binary. Store metadata that describes features not in the submission build is a **Guideline 2.3.1 (accurate metadata)** rejection. This copy is scoped to what actually ships, and intentionally omits:

- **Reminders / notifications** — the only shipped notification is an off-by-default daily summary (B-661); not featured as "reminders."
- **A shareable vet *link*** — delivery is an on-device **PDF** via the share sheet; the copy says "export a PDF… hand it over or send it ahead," never "share a link." (No code mints a share token.)
- **Home Screen widget** (built, not in a distributed build), **Ask** (allowlisted to one user), **barcode scanning** (does not exist), **general data export** (not built). None appear.
- **Premium tiers** — nothing is gated today; the paywall is a flagged-off mock. The copy states everything is free *as a present-tense fact*, not a tier comparison.

---

## 8. Notes for the PM

**Decisions this draft needs from you:**
1. **Subtitle** (§2) — keep the ASC-locked "Track symptoms, find triggers" or adopt "Diet trials & symptom diary" (recommended). This also determines the §5 keyword string (coupled).
2. **The §7 pre-submission verification list** — build contents + the B-494 `generate-report` redeploy for the vet-report trial block.

**Field editability (plan around this):**
- **Editable any time, no review:** promotional text, keywords. (Safe to iterate post-launch — e.g. once Search Ads volume data lands.)
- **Requires a new version submission:** name (locked anyway), subtitle, description.

**Category (guide step 1 recommendation, revisit here):** primary **Lifestyle**, secondary **Health & Fitness**. Avoid **Medical** — it invites the strictest review lens for no benefit to a tracking app.

**Pre-submission verification — confirm each featured capability is in the *cut build* before submitting** (the §7 discipline, applied forward):
- [ ] **Diet-trial lifecycle is in the binary.** Featured prominently (it is the differentiator). Shipped to `main` (B-417, PRs #450–481) but the submission build must be cut from that history — confirm an owner can start a trial in the cut build.
- [ ] **The demo account (B-271) has a live diet trial + a few weeks of logs**, so the reviewer actually sees the trial, the Signal, the trend, and a rendered vet report — not empty states.
- [ ] **The vet report renders its trial section for the reviewer.** The report's trial block depends on the `generate-report` redeploy held behind **B-494**; if that redeploy hasn't happened, the trial won't render in the report the reviewer generates. Resolve before submitting, or soften the "the whole trial is in one place… report" beat.
- [ ] Photo food/label extraction and multi-pet (both free) are present.

**Confirm-with line when done (guide step 13):** `Guide step 13 complete: copy entered, age rating 4+.`

---

## Persona sign-off
Designer ✓ (nyx-voice: no exclamation, specific-over-generic, warm-not-cute, plain language) — Trust & Safety ✓ (Guideline 1.4.1: no diagnosis/treatment/reassurance claim; disclaimer + emergency line present; consistent with the 4+ age-rating answer) — Product Owner ✓ (ASO: name/subtitle/keyword no-overlap, ownable-term coverage, volume caveat flagged) — PM decision needed on the §8 pre-submission verification list (build contents + B-494 redeploy).
