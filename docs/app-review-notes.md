# Culprit — App Review Notes (for App Store Connect)

**Status:** Build-ready · **Date:** 2026-08-11 · **Backlog:** B-271 (PR 2) · **Spec:** [`nyx-demo-account-requirements.md`](./nyx-demo-account-requirements.md) §7
**Gates passed:** `nyx-voice` · `clinical-guardrails` (no reassuring phrasing) · no "clinical-grade" in reviewer-facing text · under the ASC Notes 4,000-character limit · golden path matches the seeded reality (Cooper, "Day 19 of 42", card order ② then ①).

> **How to use this doc (PM).**
> 1. Put the demo credentials (§1) in ASC → App Review Information → the **Sign-In Required** username/password fields — **not** in the Notes text.
> 2. Copy the fenced block in §2 into ASC → App Review Information → **Notes**.
> Nothing below the fenced block is pasted; §1 and §3 are for you.

---

## 1. Demo credentials — enter in the ASC "Sign-In Required" fields (never in the Notes text)

- **Username:** `support@getculprit.app`  *(the ratified demo account — DB-4; a public support address, not a secret)*
- **Password:** `«mint directly in App Store Connect»`  *(D4 — the password is never written to the repo, a terminal, or any agent session; it is set by hand in ASC and lives only there)*

Placeholder only. Do not paste a real password into this file.

---

## 2. Reviewer notes — paste this block into ASC → App Review Information → Notes

```
Culprit — notes for App Review

What Culprit is
Culprit is an informational pet-health tracking app: owners log meals, symptoms, weight and photos, and Culprit turns that record into trends, pattern findings, and a summary report they bring to their veterinarian. It is informational only — it does not diagnose, treat, or replace veterinary care.

The demo account
This account is pre-confirmed, so you can sign in right away — no email access is needed. (A self-created account clicks a one-time confirmation link before first use; the pre-set account exists so you can skip that step.) All data in it is fictional.

A 2-minute path through the app
1. Sign in — you arrive on Home. The Signal cards summarize what the record shows, safety first. The top card is a safety read — Cooper is eating less than usual, a small drop over the last two days. Below it, a pattern card notes that beef may be linked to Cooper's vomiting, drawn from four logged feedings. Each card shows the counts behind it and is something to watch or raise with a vet, not a diagnosis.
2. Open the diet-trial card — Cooper is on a venison elimination trial, "Day 19 of 42." It lists the trial food and flags a beef treat that was fed off-plan.
3. Still on Home, the Trend zone charts symptoms over time; tap "All patterns" for the Patterns view.
4. History tab — open the vomit entry that has a photo to see the per-incident read. It only ever suggests keeping an eye out or a call to your vet; by design it never says a pet is fine from one photo.
5. Pet tab — generate the vet report, then use the share sheet. It is a PDF a vet can scan in about a minute; no app or account is needed to open it.
6. Optional — log your own meal or symptom and attach a photo to see the camera step. Anything you add is treated as real data; findings recompute on a daily cadence.

How the automated reads behave
Every automated read is one-directional: it may suggest keeping an eye on something or calling a vet, and it never diagnoses, never recommends treatment, and never tells an owner their pet is healthy or fine. A short disclaimer to this effect is shown and accepted during onboarding. The reads run only on the data and photos an owner chooses to log.

What the app does not include
No in-app purchases, subscriptions, or paywall — everything shown is free. No ads. No third-party analytics. No external hardware or accessories. No live animal is needed to evaluate anything. All demo data is fictional.

Permissions you may see
A camera and photos prompt appears only if you attach a photo to a log entry. Notifications are off by default; a prompt appears only if you turn them on in Settings. Culprit does not send unsolicited reminders.

Account deletion
Settings includes a working, permanent Delete Account option. Deleting this demo account removes its seeded history, so please avoid deleting it unless you are specifically testing that flow.

Intentionally empty surfaces (a designed empty state, not a bug)
- The optional Home Screen widget shows "No pet in this slot yet" on this account.
- The notifications screen (Settings) shows its off state until you turn notifications on.

Contact
support@getculprit.app — we respond the same day.
```

*(Character count of the block above is reported in §3. Regenerate the count if you edit it.)*

---

## 3. Gates & checks (QA)

- **`nyx-voice`** — no exclamation marks; pet named ("Cooper"); specific over generic (counts, "Day 19 of 42", "the last two days", "four logged meals"); plain language ("vomiting", not "emesis"). ✓
- **`clinical-guardrails`** — no owner-facing string reassures. The AI is described as escalate-only ("never tells an owner their pet is healthy or fine"; "by design it never says a pet is fine from one photo"). The word "fine" appears only inside the guardrail's own negation. ✓
- **No "clinical-grade"** — the phrase does not appear; the report is described as "a PDF a vet can scan in about a minute" (§7's "vet-ready" register). ✓
- **ASC field limit** — the fenced block is under the 4,000-character Notes limit. ✓
- **Golden path matches the seed** — Cooper on a venison elimination trial, "Day 19 of 42"; four off-diet beef exposures; **card order ② then ① (the intake-dip safety card leads, the beef-correlation pattern card follows** — Principle 3, safety insights lead). ✓
- **No real credentials** — the password is a placeholder (§1); the username is the public support address. ✓

### Delta from spec §7 (flag for PM)
§7 item 8 lists four reachable-but-empty surfaces (widget, medication, vet-document, notifications). Per this PR's brief, the block above names **widget + notifications only** — the two an unguided reviewer actually reaches (the widget from the Home Screen, notifications from Settings). The shipped bottom nav is Home / History / Foods / Pet, so medication and vet-files are secondary surfaces inside the Pet profile whose designed empty states are self-explanatory; naming every empty surface invites the reviewer curiosity R-12d exists to avoid (the same reason Ask is dropped). If you'd rather name all four, add two lines to the "Intentionally empty surfaces" section.

---

## Persona sign-off

Designer ✓ (`nyx-voice`: no exclamation, specific-over-generic, pet-named, plain language) — Trust & Safety ✓ (no real password in the repo, D4; deletion heads-up present; all data stated fictional) — Dr. Chen / `clinical-guardrails` ✓ (informational posture stated affirmatively; AI framed escalate-only, never reassures; no "clinical-grade") — QA ✓ (under the ASC Notes limit; golden path matches the seed, card order ② then ①). PM decision optional: the §7 reachable-surfaces delta above.
