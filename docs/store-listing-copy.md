# Culprit — App Store Listing Copy
**Status:** 🟡 Corrected for 1.2.0, ready for App Store Connect · **Date:** 2026-08-09 · **Last Updated:** 2026-10-15 (CUL-1775: the October brief's correctness fixes, the CUL-1768 rulings D1, D2 and D4, and synthetic panel 2's four inputs) · **Guide step:** 13 (`docs/app-store-submission-guide.md`) · **Backlog:** B-269
**Author lenses:** Sr. Product Designer (nyx-voice) · Trust & Safety (Guidelines 1.4.1 and 2.3.7, clinical honesty) · Product Owner (ASO)

> **How to use this doc.** Every field below is copy-paste-ready for App Store Connect and is inside Apple's character limit (see the count beside each). Read **§6 Clinical-honesty check** and **§7 What this copy deliberately does NOT claim** before submitting; both are load-bearing for a health-adjacent app under Guideline 1.4.1 and must match the age-rating answers. PM notes and a pre-submission verification list are in **§8**.
>
> **Words this listing never uses, in any field or note** (restart, 2026-10-11; Guidelines 1.4.1 and 2.3.7): the five words listed in the restart comment on [CUL-1775](https://linear.app/projectnyx/issue/CUL-1775), which are kept out of this file entirely, this note included, so a grep for them comes back empty. The disclaimer says the same thing in plain words ("it can't tell you what's wrong"). Grep this file for them before every edit lands.

---

## 1. App Store name — LOCKED (do not edit)

```
Culprit — Pet Health Tracker
```

**28 / 30 characters.** Locked per B-272 (guide step 1). This is the *App Store display name*, independent of the on-device name (`app.json` `name: "Culprit"`). The em-dash + descriptor is the strongest single App Store search signal, so the name already carries "Pet / Health / Tracker" as indexed terms, which is why the keyword field (below) never repeats them.

---

## 2. Subtitle (≤ 30 characters) — RULED: keep the one in App Store Connect

```
Track symptoms, find triggers
```

**29 / 30 characters.** Entered in ASC under B-272 (2026-07-08). **Kept by the PM's D2 ruling (b), 2026-10-12** ([CUL-1768](https://linear.app/projectnyx/issue/CUL-1768)); the October brief's "Food trials & symptom diary" was not adopted.

**Open:** synthetic panel 2 found that "find triggers", next to the name "Culprit", reads at the search card as "the app finds the cause" ([CUL-1831](https://linear.app/projectnyx/issue/CUL-1831), `docs/store-page-panel-2-2026-10.md` F2). Whether to reopen D2 is the PM's call on [CUL-1929](https://linear.app/projectnyx/issue/CUL-1929). Until it rules, this field stays as above, and the promotional text (§3) carries the line that the vet makes the call, where a skimmer sees it.

---

## 3. Promotional text (≤ 170 characters)

```
Noticed a new symptom, or started a food trial? Log your dog or cat's meals and symptoms in a few taps. Culprit keeps the record; your vet makes the call. Free.
```

**160 / 170 characters.**

Promotional text sits above the description and is **editable any time without a new build or review**. This version answers three of panel 2's inputs ([CUL-1775](https://linear.app/projectnyx/issue/CUL-1775)):
- **The vet makes the call, above the fold.** 13 of 24 panel runs never tapped *more*, so the description's disclaimer never reached them.
- **Cats are named.** The page never said "cat"; the cat owner asked whether it works for cats in 3 of 3 runs.
- **One vet line, not two.** The old text opened "Your vet said to track it", and so does the description. This one carries the owner who hasn't seen a vet yet; the description keeps the vet-directive line.

"Free" is a present-tense fact: nothing is gated before the cut (D7, 2026-10-12).

---

## 4. Description (≤ 4000 characters)

```
Your vet sent you home to track it. Culprit makes that easy to keep up.

Whether your dog or cat is on a food trial, you're watching a new symptom, or you're just trying to answer "is she getting better?", Culprit turns a few seconds a day into a record you and your vet can actually use.

Confirm, don't type
A food trial runs 8 to 12 weeks. Symptom monitoring can run longer. Most tools ask too much, so the logging stops by week two. Culprit is built the other way around:
• Log a food your pet had recently in two taps
• Note a symptom the moment it happens, an itch, a vomit, a loose stool, one-handed and in seconds
• Snap a photo of a food or its label and let Culprit read the details for you

Made for food trials
Start a trial, set the food your vet chose, and Culprit keeps the record straight: what was eaten, when something off-plan slipped in, and how the symptoms tracked alongside it. When the appointment comes, the whole trial is in one place, instead of "I think it was about three times."

Patterns to bring to your vet
As your log grows, Culprit surfaces what it notices, and every pattern comes with its counts: how many of the vomiting episodes it could time came within 30 minutes of eating, for example. These are patterns to talk over with your vet, not verdicts. Culprit shows you what the record says and leaves the answer to your vet.

Ready for the appointment
Before the visit, Culprit gathers what's worth raising, your own questions and the report in one place.

An organized summary for your vet
Export a PDF with the symptoms and their timing, the trial so far, medications and photos. Hand it over or send it ahead. No app and no account needed on their end.

More than one pet
Track every pet in your home. Each one keeps its own foods, history, and report.

Care features are free, and stay free
Logging, health flags, trends, insights, and the vet report are free, with no trial clock and no paywall in front of them. If paid features ever arrive, they'll wrap convenience, never the things that keep your pet well.

What Culprit is, and isn't
Culprit helps you observe, organize, and remember what's happening with your pet. It keeps a record; it can't tell you what's wrong, and it is not a substitute for professional veterinary care. If you're worried about your pet, your vet is the right call, and in an emergency, contact your vet or a local emergency clinic right away.

Culprit isn't owned by a food or pharmacy brand, so nothing here is nudging you toward a sponsor's product. It works for you and your pet, no one else.
```

**2,569 / 4000 characters** (counted 2026-10-15). Deliberately not padded to the cap.

**What changed from the 2026-08-09 draft, and why** (the October brief §10.2, `docs/culprit-competitive-landscape-2026-10.md`, plus panel 2):

| Was | Now | Why |
|---|---|---|
| "Log a repeat meal in two taps — the food you set up once is a single tap away" | "Log a food your pet had recently in two taps" | A food first logged today is not offered until tomorrow; the shortcut is recent foods, not every food set up once |
| "itching tends to peak 3 to 6 hours after meals with chicken" | the vomiting-timing pattern with its counts | No template emits the chicken line, and it implies a food cause the engine does not show. The new example is Signal pattern ⑤'s real shape (`supabase/functions/generate-signal/phrasing.ts`, `templatePostprandialTiming`): its denominator is the episodes it could time, never every vomit logged |
| "A report your vet can read in a minute … a clean, clinical summary … laid out the way a vet actually reads" | "An organized summary for your vet" | The report titles itself an owner-reported summary, and the listing claims no vet's reading of it |
| "Track every pet in your home, free." | "Track every pet in your home." | D4 (2026-10-12): monetization is undecided, so the pet line claims nothing about price. "Stay free" stays on the care list only (Pets > $) |
| (none) | "Ready for the appointment" | Vet visits and the visit rundown ship in 1.2.0 (`app/vet-visits/`, `app/rundown.tsx`) |
| the only itch word left with the chicken example | "an itch, a vomit, a loose stool" | Panel 2 input 4: keep one itch or skin word; all three are quick-log types (`constants/eventTypes.ts`) |
| "running an elimination diet" | "Whether your dog or cat is on a food trial" | Panel 2 input 2 (name cats); "food trial" is the owner's word (brief §10.1) |
| "It does not [name a disease] … leaves the [naming] to the professional" | "It keeps a record; it can't tell you what's wrong … leaves the answer to your vet" | The restart's banned-word rule (2026-10-11) is newer than the brief's "keep as written" |

Description changes require a new version submission (unlike promotional text and keywords). Keep this stable once submitted.

---

## 5. Keywords (≤ 100 characters, comma-separated)

```
elimination,food,allergy,sensitivity,novel,protein,hydrolyzed,vomiting,diarrhea,itching,vet,dog,cat
```

**99 / 100 characters.** Unchanged: D2 (b) did not adopt the brief's keyword swap.

**Rules honored:**
- **No word already in the name or subtitle.** Apple already indexes `culprit, pet, health, tracker` (name) and `track, symptoms, find, triggers` (subtitle), so repeating them here would waste budget. None appear above.
- **Single tokens, no spaces.** Apple builds search phrases by combining tokens across name, subtitle and keywords, so atomic words maximize coverage per character. With the kept subtitle these form `novel` + `protein` → **novel protein**, `food` + `allergy` / `sensitivity` → **food allergy / food sensitivity**, `hydrolyzed` + `food`, `dog`/`cat` + `vomiting`/`itching` + `tracker`, `track` + `symptoms` (subtitle) → **track symptoms**, `vet`.
- **Not formed with the kept subtitle:** "elimination diet" and "food trial" (no `diet` or `trial` token is indexed). D3 (2026-10-12) found neither phrase has App Store volume, so owners on the wedge arrive from vets and the web; no change is made for them.

> **Coupled to the subtitle.** If the PM reopens D2 ([CUL-1929](https://linear.app/projectnyx/issue/CUL-1929)), revisit this string with it: any token the new subtitle carries comes out here, and its freed characters go to the next term.

> **ASO caveat** (`docs/culprit-competitive-landscape-2026-07.md` §9; D3): these terms are uncontested, but exact popularity scores need a draft Search Ads campaign in the PM's account. Keywords are editable after launch without review.

---

## 6. Clinical-honesty check (Guidelines 1.4.1 and 2.3.7, and the age rating)

This copy is read by App Review against **Guideline 1.4.1 (Physical harm)** and must be consistent with the age-rating answers and the B-270 veterinary disclaimer. Pass on each rule:

| Rule (clinical-guardrails / design principles) | How the copy holds it |
|---|---|
| **Never claims to name a disease or cause** | Stated outright in the promotional text ("your vet makes the call") and the description ("it can't tell you what's wrong … leaves the answer to your vet"). No feature is described as identifying a disease, allergy, or cause. The one pattern example is a timing count, not a food. |
| **Never claims medical advice, treatment or cure** | Absent entirely. Culprit "observe, organize, remember": a record-keeper, not a clinician. |
| **Never reassures on absence (n=1 asymmetry)** | No "your pet is fine / all clear / nothing to worry about." Patterns are framed as things to bring to the vet, not verdicts, and they come with their counts. |
| **Health flags surface without alarm** | "health flags" = things worth a vet's attention; no urgent or alarm language, and no claim that the app can spot illness. |
| **Points to the vet, including emergencies** | The disclaimer paragraph plus the emergency instruction ("contact your vet or a local emergency clinic right away"). |
| **The banned words (2.3.7)** | None of the five words the header note points to appears in any field or note (grep before every edit). |
| **Voice (nyx-voice)** | No exclamation marks; specific over generic (two taps, 8 to 12 weeks, 30 minutes, dog or cat); warm-not-cute; plain language, no unexplained jargon. |

**Age-rating answer (for the PM, in ASC): ✅ Entered 2026-08-09 → rated 4+.** The medical or treatment-information question was answered as informational pet-health tracking, not medical treatment; the exact wording is in `docs/app-store-age-rating.md`. This description is written to be consistent with that answer; if the answer and the description disagree, that mismatch is a rejection trigger.

---

## 7. What this copy deliberately does NOT claim

The July competitive audit (`docs/culprit-competitive-landscape-2026-07.md` §3.2) found the docs had drifted ahead of the shipped binary. Store metadata that describes features not in the submission build breaks **Guideline 2.3.1** (metadata must match the app). This copy is scoped to what ships in 1.2.0, and intentionally omits:

- **Reminders / notifications.** Not featured as "reminders."
- **A shareable vet *link*.** Delivery is an on-device **PDF** via the share sheet; the copy says "Export a PDF … hand it over or send it ahead," never "share a link." (No code mints a share token.)
- **Home Screen widget.** Data-gated in TestFlight as of October; not featured.
- **Ask.** Allowlisted to two accounts as of October; not featured.
- **Barcode scanning** (does not exist) and **general data export** (not built). Neither appears.
- **Reintroduction** ("elimination and reintroduction"): unbuilt; the copy says "food trial" only.
- **Any vet endorsement** ("vet-approved", "designed with vets") and **any AI headline.** The record, the trial and the report lead (D1 (a), 2026-10-12).
- **Premium tiers.** Nothing is gated today (D7). The copy states care is free *as a present-tense fact*, and says nothing about price on the pet count (D4).

Every competitive sentence stays at text-evidence strength until the hands-on rival pass ([CUL-1777](https://linear.app/projectnyx/issue/CUL-1777)) runs; the only one here is the independence paragraph, re-verify it at entry.

---

## 8. Notes for the PM

**Decisions still open that touch this doc:**
1. **Subtitle reopen** ([CUL-1929](https://linear.app/projectnyx/issue/CUL-1929)). If it changes, §5 changes with it.
2. **Frame 1** of the screenshot set follows D1 (a) in `docs/store-screenshot-plan.md`, not here.

**Field editability (plan around this):**
- **Editable any time, no review:** promotional text, keywords.
- **Requires a new version submission:** name (locked anyway), subtitle, description.

**Category (guide step 1):** primary **Lifestyle**, secondary **Health & Fitness**. Avoid **Medical**: it invites the strictest review lens for no benefit to a tracking app.

**Pre-submission verification: confirm each featured capability is in the *cut build* before submitting** (the §7 discipline, applied forward):
- [ ] **The food-trial lifecycle is in the binary.** Featured prominently; confirm an owner can start a trial in the cut build.
- [ ] **Vet visits and the visit rundown are in the binary**, reachable without a flag, so "Ready for the appointment" is true for the reviewer.
- [ ] **The demo account (B-271) has a live food trial and a few weeks of logs**, so the reviewer sees the trial, the Signal, the trend, and a rendered vet report, not empty states.
- [ ] **The vet report renders its trial section, medications and photos for the reviewer.** If any is missing in the cut build, soften the matching words in "An organized summary for your vet" before submitting.
- [ ] Photo food and label extraction, and multiple pets, are present.

**Confirm-with line when done (guide step 13):** `Guide step 13 complete: copy entered, age rating 4+.`

---

## Persona sign-off
Designer ✓ (nyx-voice: no exclamation, specific over generic, warm-not-cute, plain language; cats named; the pre-vet owner carried) — Trust & Safety ✓ (Guidelines 1.4.1 and 2.3.7: no claim to name a disease or cause, no reassurance, no banned word; disclaimer and emergency line present, one of them above the fold; consistent with the 4+ age-rating answer) — Product Owner ✓ (ASO: no name or subtitle token repeated in keywords; the subtitle coupling pointed at CUL-1929) — Dr. Chen ✓ (the pattern example is a timing count with its honest denominator, never a food).
