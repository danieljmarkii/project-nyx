# Vet report v2 PR-18: the send sheet, the quote-only email, a confirmation that never celebrates a flag

**Date:** 2026-11-02
**One thing (re-ask):** S1 L1 — Code vs build vs OTA (from 2026-10-10: a change that touches only JavaScript can reach an installed build without a new binary) · check: pending
**One thing:** S1 L1 — Code vs build vs OTA: a new native module needs a new binary, and the JavaScript must survive running on the old one · check: pending

Dispatched row for [CUL-2298](https://linear.app/projectnyx/issue/CUL-2298) (VR2-18), shipped via the session's PR on branch `claude/vet-report-v2-pr18-11021639`.

## What shipped

Arriving from the composer, the report's bar now reads **Send…**. Tapping it reads the live flags first (the button shows its loading state), then presents one sheet: the call card in its first frame, focus on it, no pulse, no haptic; then Email, Print, Share the PDF, Copy the email text. Email swaps the same sheet's panel to a draft built from a fixed template: every sentence is a fixed string, the call card's own record line, or the owner's typed note and questions in quotation marks. The subject names the pet with surname, each live flag in words, the window and the visit, and a guard cuts any digit beside %, kg or lb. Vet documents are listed one by one, each off. The sheet closes before Mail, Print or Share present and hands the choice back from its exit. The confirmation names the pet, the window and how it left, in words chosen by what the platform reported: only an iOS Mail "sent" reads "Sent from your Mail app"; a cancelled or saved draft makes no card. A quiet send gets the calm completion arrival with the check; anything else (a flag, or a read that failed) shows no check and repeats the call card above Done. No send fires a haptic.

Off the composer path, "Send to vet" is unchanged.

## Decisions taken in the row

- **No clinic phone, hours or emergency vet exists in the app**, so the call rows are worded, not dialled, and the after-hours preset keys on assumed 8:00 to 18:00 local hours; both rows always print and outside the day the emergency clinic leads. Filed as [CUL-2413](https://linear.app/projectnyx/issue/CUL-2413).
- **Copy copies the email text** (the clipboard cannot hold a PDF), **vet documents ride Email only** (the share sheet takes one file), and the email's sentences snap rather than crossfade. Filed as [CUL-2414](https://linear.app/projectnyx/issue/CUL-2414).
- **"Saved" and "Open in Reports" wait for VR2-20 and VR2-21**: nothing is kept yet, so the card never says it is.
- **`expo-mail-composer` loads lazily** (the `expo-document-picker` precedent): on a binary built before it, Email reads "Mail isn't set up on this phone" and the other targets work. Native-build cut: the next 1.3.0 EAS build (a new dev client and a new TestFlight binary).
- **PM ruling (b) on PR-19's fork, recorded on CUL-2298 mid-row:** `expo-screen-orientation` rides the same cut. `app.json` now lets the binary rotate; iOS holds portrait from the plist default (`initialOrientation: PORTRAIT_UP`, pinned by `guards/nativeConfig.test.ts`), the root locks portrait for Android, and `useRotationUnlocked` is the exam-room route's unlock. The sheet lists "Show on this phone" once the screen can open exam-room mode; whichever of PR-18 and PR-19 merges second wires `openExamRoom`.

## The review round

The adversarial pass found two QUIET breaks, both fixed: a send-time flag read that failed threw away the flags the composer had already shown and offered "couldn't check" with no call rows (now `liveForSend` keeps the known flags); and before opening time the emergency row said "tonight", which reads as leave to wait (now "now"). Merging `main` brought #1400's `sustained_refusal` trigger, which the subject's own noun catalogue would have printed as "eating less"; the catalogue is gone and the subject reads each flag in the card's words, with a test pinning the two equal. The code review's fixes: keyboard avoidance on the draft, print separating a dismissed sheet from a failed job, a failure alert in each target's own words, Copy's text never claiming an attachment, and the confirmation taking `quiet` explicitly. Upstream and out of lane: a single day of total refusal is worded "eating less" on every surface ([CUL-2424](https://linear.app/projectnyx/issue/CUL-2424), Live harm, waiting on the PM's ruling); the send read's missing timeout ([CUL-2425](https://linear.app/projectnyx/issue/CUL-2425)).

---

### One thing — Code vs build vs OTA (S1, L1)

Your phone runs two layers. The **binary** is the app Apple installed: its native parts (camera, Mail, files) are compiled in and only change when you install a new build. The **JavaScript** is the app's behaviour on top, and an over-the-air update can swap it without a new install. Today's Email button needs a new native part, Apple's Mail composer, so it only truly works once a new build exists. Until then the same JavaScript can land on phones whose binary has no Mail part, and it must not crash there.

**Like:** a new recipe that calls for a stand mixer. You can mail the recipe card to every kitchen tonight, but kitchens without the mixer need the card to say "no mixer? whisk by hand", or the cook stops at step 3.

**In today's work:** `lib/reportSendActions.ts:22`
`const requireMail = (): unknown => require('expo-mail-composer');` loads the Mail part only when the owner taps Email, inside a try, so an old binary gets "Mail isn't set up on this phone" instead of a crashed report screen.

**Why it matters to you as PM:** any row that adds a native dependency needs a build cut on your calendar, and until that build ships, testers on the old binary see the fallback, not the feature.

**Check:** If this PR merges and an update reaches your current TestFlight build tonight, what happens when you tap Email, and what do you have to do before it opens a real Mail draft?
