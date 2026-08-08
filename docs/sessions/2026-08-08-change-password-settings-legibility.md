# Change-password Settings tile — legibility fix (the "contact support" misread)

**Date:** 2026-08-08
**Outcome:** shipped via #607 (You-screen Account card).
**Surface:** `app/settings.tsx` (Account card) + `components/profile/OwnerNameRow.tsx`. B-280 (closed) polish — no build-phase change.

## The ask

PM, using the app: *"the 'change password' tile still says contact support — but we have a change-password workflow now."* Two requests: (1) verify the workflow is fully functional, and (2) update the text so it no longer advertises an out-of-date "contact support" route.

## What we found (verification — request 1)

The change-password workflow is **built, merged, and passing tests** — B-280 is closed. Two capabilities:

- **In-app change password** (Settings → You → **Change password ›**) — `app/settings/password.tsx`, shipped #551. Re-auth with current password (`signInWithPassword`) → `updateUser` → optional evict-others. **9/9 suite green.** Works today for the normal case.
- **Forgot / reset password** — `app/(auth)/forgot-password.tsx` + `reset-password.tsx`, shipped #553/#554; `PASSWORD_RECOVERY_ENABLED` is ON. **60/60 suite green.**

**Remaining for true go-live is PM-only + server-side, already tracked:**
- **B-657** — the §9.2 GoTrue dashboard checklist (recovery email template still says "Nyx"; password-changed email; enumeration-protection; OTP/JWT expiry) + the §10 on-device QA matrix.
- In-app change password wants the **"Secure password change"** toggle ON, or the current-password field is decorative against a direct-API bypass on an unlocked phone.

So the code is complete; recovery is not *fully* live until B-657's dashboard + device pass is done.

## The text (request 2) — it was a layout bug, not stale text

On current `main` the "Change password" row already routes to the working screen — it does **not** say contact support. A PM **screenshot (build carrying #551 + the #567 Notifications row)** was decisive: the "contact support" is the **email-change** note, and the real defect is layout. The card's "Your name → *Shown as the owner on the vet report.*" row teaches that a grey line under a row is *that row's caption*, so the grey email note sitting directly under "Change password" reads as **Change password's** caption → "Change password → contact support."

### Iterations (three commits, squashed into #607)
1. **`instead` wording** ("…account email *instead*, contact support.") — too weak; the words weren't the problem, the adjacency was.
2. **A divider** between the row and the note — **Designer verdict: NEEDS-WORK.** A hairline is a weak defeater of the caption prior, and it stranded the note as an orphan sentence three cells from its referent.
3. **Designer's option D (shipped).** The note is *about the email*, so move it beside the email in the identity block, where the card's own caption pattern reads it correctly. **"Change password" becomes the card's clean final chevron row** — no grey line under it to misread. The misread is removed *by construction*, not patched.

### Final design
- Email + its change-via-support caption stack in an `identityText` column beside the avatar; note **gated on a real email** (never under the `'Signed in'` fallback).
- "Change password" is a pure nav row; trailing divider + note deleted.
- Copy **verbatim from spec §5.7** — only placement moves → **no Tier-2 spec edit**; the §11/B-429 lost-mailbox breadcrumb survives.
- Polish: the card's two captions unified to `colorTextTertiary` (`OwnerNameRow` hint was `secondary`) so they read as one register. `OwnerNameRow` is settings-only, so the token change is contained.

## Decision record
- **The call was delegated to the Sr. Product Designer** (via the `pm-feature-review` lens, run un-anchored on purpose — the build context had already committed to the divider). It rejected divider (option A) and note-removal (option B — removing the note *would* need a §5.7/§11 Tier-2 edit and deletes the only in-app breadcrumb for an owner who lost their signup mailbox, a cost the spec already weighed and declined), and chose D (a refinement of "email as its own row" that avoids duplicating the header email).
- **Generalisable rule reaffirmed:** a grey caption inherits the row directly above it. Don't place a note about X under the control for Y.

## Verification
- `tsc --noEmit` clean; full jest suite green via pre-push hook (208 suites / 4587 tests); change-password + recovery suites specifically green (9 + 60).
- Persona sign-off: **Designer ✓** (option D, the recommended design) · **nyx-voice ✓** (copy verbatim from §5.7, no "coming soon") · Engineer ✓ (copy/layout only, no logic) · Data / Dr. Chen N/A.
- No adversarial-review needed — no clinically/statistically load-bearing logic changed.

## Residuals / follow-ups (not filed new — already tracked)
- **B-657** — recovery go-live dashboard + on-device QA (PM-only).
- **B-427** — build in-app email change to retire the support note here entirely (optional, bigger; its own PR).
- **B-429** — lost-signup-mailbox ops runbook (the note's honest backstop).

## JS-only — reaches devices via OTA
The fix is JS/layout only, so an `eas update` (Runtime A OTA) surfaces it on an existing TestFlight build — no native rebuild. Until it ships the device shows the old layout, but the password change itself already works there.
