# The Signal screen re-reads, refreshes on edits and opens offline (CUL-1219, PR-26)

**Date:** 2026-10-03
**One thing:** none — dispatched session

Shipped via PR-26's pull request (number in the PR title's thread). A `/dispatch` child of *Out of beta — Noticed, Design v2, History v2, the trial screen*, row PR-26.

## What shipped

- **The re-read (BRK-43).** `SignalScreen.tsx` reads on every focus, `signalTick` and `hydrationTick`. Only the first read blanks; a re-read swaps the load only when it changed (`sameLoad`), so the body, its scroll, the identity-keyed draw and the landing stay mounted. A failed re-read keeps what is on screen. When an episode leaves, VoiceOver focus moves to the gallery header (the title if the gallery went). Home's "Noted — updating …" line shows while the route's pet's regen runs, paired with `useLiveRegionAnnouncement` (C-44).
- **The offline open (GAP-7).** `readSignalCacheOrLast` (`lib/signal.ts`) keeps the last answered `ai_signals` row per pet, in memory only, and stands it in when the network read throws. The screen says "Couldn't refresh just now. Last updated …". Cleared in `cancelPendingSignalRegens` (from `wipeLocalSession`), with an epoch so a read in flight across sign-out keeps nothing; `loadSignalScreen` refuses the kept row for a pet the account's list does not hold.
- **The flight (BRK-15).** The flown chart aborts when the load settles ready with no weekly hero, as it already did for failed, missing, withheld and set aside.
- **The tile's time (BRK-8).** A bout whose photo sits on its re-log opens that re-log and now says its time and date; counts still key on the bout's onset day.
- **Edits refresh the Signal (BRK-44).** `app/edit-event.tsx` triggers the debounced regen only when an engine input moved (time, confidence, a new photo, another food), so a peek-and-save spends nothing against generate-signal's daily cap (CUL-1087); the lookup is best effort and never fails a stored save. `app/event/[id].tsx` refreshes after a photo add (once it landed and its read had its turn) and after a removal.

## Falsification

- Each new test was run red by mutating the source it guards: the blanking, the heroless abort, the failed re-read, the tick deps, the wipe, the epoch, the membership check, the tile time, the as-of line, the edit gate, the edit lookup, the photo-upload gate.
- `code-reviewer`: one bug (the edit lookup could report a stored save as failed) and a cap over-spend on a failed upload; both fixed and tested.
- `rls-privacy-reviewer`: one break (a read in flight at sign-out refilled the kept map; reproduced by probe); fixed with the epoch and the pet-membership check, both tested. Shared-access revocation N/A (no sharing yet).

## Residuals

- CUL-1552: a cold start with no network has no kept row, so the screen still cannot open then (needs a persisted, wiped copy; a T&S call).
- The privacy reviewer could not verify from code whether an A-account Signal screen can survive under the stack across an involuntary sign-out; its own component state predates this diff. Device check named in the PR.
