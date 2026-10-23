# Culprit — App Review Notes (for App Store Connect)

**Status:** Build-ready for 1.2.0 · **Date:** 2026-10-15 · **Issue:** CUL-1848 (feeds CUL-188) · **Spec:** [`nyx-demo-account-requirements.md`](./nyx-demo-account-requirements.md) §7 and §15 · **Research:** [`research/2026-10-app-store-requirements.md`](./research/2026-10-app-store-requirements.md) rows C9, 1, 4, 5, 7, 9, 10
**Rulings applied:** D7 (a) — the demo account sees what every account sees, and the notes name each feature that is present and off · D13 (a) — no AI consent on the demo account, so the reviewer meets the consent ask live and the notes say how to see a read.
**Replaces:** the 2026-08-11 notes (B-271 PR 2), written before the redesign, vet visits and AI consent.

> **How to use this doc (PM).**
> 1. Put the demo credentials (§1) in ASC → App Review Information → the **Sign-In Required** username/password fields — **not** in the Notes text.
> 2. Copy the fenced block in §2 into ASC → App Review Information → **Notes**.
> 3. Before you paste: replace the one bracketed line (**Tested on**) with the devices and iOS versions from the device pass, and attach the consent screen recording from a throwaway account (D13 (a)).
> Nothing below the fenced block is pasted; §1 and §3 are for you.

---

## 1. Demo credentials — enter in the ASC "Sign-In Required" fields (never in the Notes text)

- **Username:** `support@getculprit.app`  *(the ratified demo account — DB-4; a public support address, not a secret)*
- **Password:** `«mint directly in App Store Connect»`  *(D4 — the password is never written to the repo, a terminal, or any agent session; it is set by hand in ASC and lives only there)*

Placeholder only. Do not paste a real password into this file.

---

## 2. Reviewer notes — paste this block into ASC → App Review Information → Notes

```
Culprit: notes for App Review

What Culprit is
An informational health record for pet cats and dogs. Owners log meals, symptoms, weight and photos, and Culprit turns that record into patterns and a report they bring to their veterinarian. It does not diagnose or treat, provides no veterinary service or telehealth, and collects no human health data. Offered in the United States only.

The demo account
Pre-confirmed, so no email access is needed. All data is fictional: Cooper, a dog 19 days into a 42-day venison diet trial. The account has never answered the AI question, so you will meet that ask live.

A short path
1. Home. The Signal leads with safety: Cooper is eating less than usual. Below it, beef may be linked to his vomiting, from four logged feedings. Each card shows its counts and is something to watch or raise with a vet, not a diagnosis.
2. Under it: a vet recheck in three days (Get ready lists what to bring) and the diet trial, Day 19 of 42.
3. Today asks how Cooper seems (Noticed). One tap records it.
4. History holds the record, including the vet visit that started the trial.
5. Pet tab: Vet visits, then Vet report > Open vet report > Send to vet. A PDF opens in the share sheet; no app or account is needed to read it.

AI and consent
To see an AI read: tap +, Vomit, Saw it, Add a photo, Log it. Before anything is sent, the record names Claude, an AI made by Anthropic, says what is sent, and offers Allow, Don't allow and Not now. Allow runs the read. The same ask comes before a food label photo (Foods > Add food). Change it any time: Home > your avatar (top right) > AI reading. Without a yes nothing is sent, and the app still works.
A read describes one photo. It can point to signs worth a call to the vet; it never says a pet is fine, never diagnoses and never recommends treatment. No regulatory clearance applies because no diagnostic claim is made. A disclaimer is accepted during onboarding.

Account
Sign-up asks for a first and last name because the owner's name is printed on the vet report. Home > your avatar opens Settings. Delete account permanently removes the account, its records and photos; it asks you to type DELETE and enter the password. Deleting this account removes the demo data, so please avoid it unless you are testing deletion.

Present but off for every account in this version
- Ask (questions about the pet's record): no entry point. The consent sheet's list of what is sent names it "where it's turned on".
- Updated pattern rules and follow-up prompts: off, nothing visible.
- Paid features: no in-app purchase, subscription or paywall. The label photo screen says label reading may become part of Premium later; nothing is for sale in this version.
- Home Screen widget: shows "No pet in this slot yet".
None will be turned on without a version that describes it.

Permissions
Camera and photos only when you add a photo. Notifications only if you turn on the evening summary in Settings; it is a local notification, with no push. No location, health, contacts, microphone or tracking.

External services
Supabase (account, data, server functions); Anthropic Claude (photo and label reads, pattern wording, only after Allow; Anthropic does not train on this data); Resend (account emails); Expo (app updates). No ads, no analytics, no third-party tracking.

Tested on
[PM: devices and iOS versions from the device pass]

Contact
support@getculprit.app. We usually reply within a day.
```

*(The block's size is checked in §3. Re-check it if you edit it.)*

---

## 3. Gates & checks (QA)

- **Every build-note item (CUL-1848)** — Home as it is (path 1–3) ✓ · the consent screen, where it appears and the Settings path ("AI and consent") ✓ · how to see a read: log a vomit with a photo and allow it ✓ · deletion with its password ("Account") ✓ · Settings through the Home avatar ✓ · Noticed (path 3) and vet visits (paths 2, 4, 5) ✓ · every present and off feature, D7 (a) ✓ · the external services: Supabase, Anthropic Claude, Resend, Expo ✓ · US only ✓ · AI reads describe one photo and never reassure ✓ · the individual account line, 5.1.1(ix) ("provides no veterinary service or telehealth, and collects no human health data", the research's row 9 wording) ✓.
- **Matches the 1.2.0 build** (an isolated walk of the code, 2026-10-15): the owner avatar opens the "You" screen, whose "AI reading" row reads Not set / On / Off; the record ask card's buttons are "Don't allow" / "Allow" / "Not now"; the food label sheet ("Snap the label, skip the typing") opens before the camera; deletion asks for "DELETE" and the password; the Early access row does not render for an account on no allowlist, so the August "Early access" line is gone; the Trend zone and the in-History seeded photo read are gone from the path; the vet report button is "Send to vet" and makes a PDF, with no share link. Flags read live on 2026-10-15: `ask_enabled`, `ask_general_enabled`, `widget_enabled` and every `engines_v3_*` key but `en0` are off for everyone; `paywall_enabled` is false; the demo UUID is on no allowlist.
- **Matches the seed** — Cooper, "Day 19 of 42"; four off-diet beef feedings; the recheck three days out, inside Home's five-day window; the visit at D-26 in History; no photo and no AI read on the account (D13 (a)). **Card order:** the intake-dip safety card leads, the beef pattern card follows (Principle 3). The beef card shows because `engines_v3_en11`, which would withhold it, is off until after review.
- **`nyx-voice`** — no exclamation marks; the pet named; counts over adjectives; plain words ("vomiting", "eating less").
- **`clinical-guardrails`** — the AI is described one way only: it may point to a call, it never says a pet is fine. "Fine" appears only inside that negation.
- **No "clinical-grade", "diagnose" as a claim, "accurate", "AI vet" or "symptom checker"** in the block (research row 5). "Diagnose" appears only as a negation.
- **Never "beta"** — the block says "Present but off", never beta (research row 10).
- **ASC field limit** — under 4,000 bytes; 3,457 bytes by `wc -c` on the fenced block, 2026-10-15.
- **No real credentials** — the password is a placeholder (§1); the username is the public support address.

### Left for the PM (not in this doc's power)
- **Tested on:** fill the bracketed line from the device pass before pasting.
- **The screen recording** of the consent ask comes from a throwaway account (D13 (a)); attach it in ASC.
- **The demo account is never answered:** do not tap Allow or Don't allow on `support@getculprit.app`, on any device. A consent row cannot be deleted by any role (migration 100), so one tap ends D13 (a) for good.
- **Before the reviewer signs in:** open Home once on the demo account after the latest re-seed, so the Signal is fresh (§12.3 step 4).

---

## Persona sign-off

Designer ✓ (`nyx-voice`: no exclamation, specific over generic, pet named, plain language) — Trust & Safety ✓ (no real password, D4; the consent path, the Settings switch and the deletion heads-up present; Anthropic named; data fictional) — Dr. Chen / `clinical-guardrails` ✓ (informational posture stated; reads one-directional, never reassure; no "clinical-grade") — App Store consultant ✓ (C9's list: concept, external services incl. AI, region, devices line; 2.3.1(a) every off feature named; 5.1.1(ix) and 5.1.1(x) answered) — QA ✓ (every build-note item checked off above; under the ASC limit).
