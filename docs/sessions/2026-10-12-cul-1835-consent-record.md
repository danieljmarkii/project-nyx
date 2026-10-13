# AI consent PR 3b: the ask card on the vomit and stool record, the reading off frames, and "sent only if you tap" on the server

**Date:** 2026-10-12 (into 2026-10-13 UTC)
**One thing:** T5 L1 — A rule belongs where every door passes: the server sees every send, the phone sees only its own · check: pending

Row PR-14 of *App Store 1.2.0 · the first public release* (Wave 2, AI consent), CUL-1835. Shipped via #1209.

## What shipped

Mock round 4 §3 on the record, over PR 3a's consent store, plus the server half of the promise on *What's sent*.

- **The record's frames** (`components/consent/RecordConsentFrames.tsx`, wired into `VomitAnalysisSection` and `StoolAnalysisSection` through `lib/recordConsent.ts`): a `read_disabled` row renders the ask card while unanswered (frames D, E: Allow writes a `backstop` yes and reads this photo in place, Don't allow writes the no, Not now writes nothing), "AI reading is off" after a no (F, with *Turn on AI reading*), "Not read yet" with *Read this photo* after a yes (H). A call over an unread photo keeps leading, with G's off line (no link) or the ask card under it, whose vet line backs the log rather than conditioning it. A capped row under a no or no answer drops the cap copy, which promised a read tomorrow. Every non-read state carries the vet line; photoless records keep their shipped silence.
- **D0** on the named card and the sheet's beat: "Photo saved. Want an AI to describe it?" with Open, only while unanswered and never beside a floor line.
- **The server keeps "sent only if you tap"** (`supabase/functions/_shared/aiConsent.ts`, `_shared/incident-analysis.ts`): a granted owner's photo whose event was logged before the current yes began (the first yes after the latest no, from `ai_consent_events`), or whose photo reached the server before it, or whose log stamp is more than five minutes in the future, takes the declined branch as `photo_predates_consent` unless the request carries `owner_tap: true`. No unit, no download, no model; the contextual escalation is still written. Fails closed on every unreadable input.
- **The taps** (`lib/analysis.ts` `TriggerOpts.ownerTap`): the record's Read this photo, Allow, Re-run and Try again, and adding or replacing a photo on the record or the edit screen. The mount, the log path and Ask never claim one.
- The six held consent functions' fingerprints moved; they stay held until PR-17.

## How it got there (three review rounds)

1. **Round 1 FAILED the first design**, a phone-side hold on the record's mount trigger. Adversarial: holding the invoke also skipped the photo-free check, so a cat vomit logged offline, then a yes, with reduced intake, never got `feline_reduced_intake` (refloor skips `photo_read_pending`, the phone's floor has no intake arm, stool has no preview). Privacy: the hold still leaked through a second phone (hydrated upload time), a no-to-yes flip during the log upload, Ask's `planPhotoRead` over `read_disabled` rows, and a fast phone clock. Both converged on the server. The code review's bugs (photoless consent frames, a stuck pending frame, a dead end on a held photo) were fixed on the way.
2. **The PM ruled on CUL-1913:** the server enforces it, and no TestFlight build with 3a/3b ships before PR-17.
3. **Round 2:** privacy found a fast phone clock could still carry a photo past the event-time test (fixed with the database-clock upload time and the future-stamp check) and an unpinned history order (an `ascending: true` mutant survived; now pinned). Adversarial pass 2, the last one allowed, found one QUIET break: a photo added under the yes to a record logged before it was held unseen behind the old calm read. Fixed by counting a photo add as the tap, which the PM then ruled on (any deliberate owner action on the record that asks for a read counts).

## Falsification, stated

- Dr. Chen / adversarial: a held photo with a contextual flag on a fresh row, an owner-edited row, a prior read, a `may_wait` TRUE row, under the EN-4 floor and the EN-7 recheck: the call is written every time, no download ✓. A decline with a tap stays declined and never reads the history ✓.
- Privacy: yes → no → log → yes, a second phone's upload, a mid-send flip, Ask A8, a fast clock whose photo uploaded before the yes: all held ✓. `owner_tap` forged as `'true'`, `1`, `{}`: not a tap ✓. Six fingerprints recomputed, nothing un-held changed ✓.
- Mutation: `photoNeedsTap` forced false reds 4 pipeline tests; `!!owner_tap` reds 1; the history order flipped reds the pin.

## Residuals (LOUD, filed as CUL-1914)

Frame H's "logged while AI reading was off" is untrue for a flag-off row or a slow phone clock; a tap at the daily cap over `read_disabled` changes nothing visible; a call over a held photo under a yes has no "photo wasn't read" line (Re-run reads it); Ask relays a gated escalation as a read that ran; a phone more than five minutes fast holds every photo for a tap. And one narrow leak the reviews accepted: a phone running ahead whose offline photo uploads after the yes.

## The one thing

The first fix put the promise on the phone, and the phone could only keep it for the doors it owns. The server is the one place every send passes through, from this phone, another phone, Ask, or a retry that started before the answer changed, so a rule there covers doors the phone never sees. The phone still has a job: it says when the owner tapped. The server decides what that tap is allowed to open.
