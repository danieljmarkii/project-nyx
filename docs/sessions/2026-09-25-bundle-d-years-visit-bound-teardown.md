# History v2 Bundle D: a year only outside this year, the rundown on the shared visit bound, realtime closed at sign-out

**Date:** 2026-09-25

Shipped via #920 (CUL-1126, CUL-1127). Filed CUL-1254, CUL-1255, CUL-1256 and CUL-1257 (Waiting on PM). CUL-1127 item 2 moved to CUL-1188 by PM ruling.

## The ask

Bundle D of History v2, step 4: two small issues from the round-3 critique, built in one session and one PR, any time after HV-3 (#909) merged. CUL-1126 puts the year back on dates outside the current year on the surfaces that shipped without it. CUL-1127 is four small defects: a since-visit bound compared as text, a hydration pager that trusts a short page, realtime channels left open at sign-out, and a stale comment. The plan was posted with two decision briefs; the PM ruled both and said go.

## The two rulings

- **The trial surfaces take the house date form ("Aug 27"), not the day-first "27 August".** B-706's consistency pass had made every trial screen day-first so the card and the trial lists matched. Moving only the card would re-open that split, and keeping day-first would leave History's "Since Jul 26" and the card's "26 July" naming one trial date two ways. The two options cost the same code. The PM ruled (a): the whole trial family moves, so the card, the strip, the setup and window sheets and the trial lists still match each other and now match History too.
- **The hydration pager (CUL-1127 item 2) moves to CUL-1188.** CUL-1188 was filed the day after this bundle's prompt, by HV-5's review, and fixes the same loop in full: keyset paging, a count, the watermark held when short, a time budget, a sign-out check per page. A count-only patch here would have been rewritten there, tests and all, and the gap is latent (1,000-row pages under a 5,000-row server cap). `lib/sync.ts` is untouched.

## What changed

- **Years (CUL-1126).**
  - Every date below goes through `lib/recordDates.ts` (HV-3's one formatter), against the surface's own clock: bare in the current year, stamped outside it, a range's year stated once.
  - The rundown: the since-visit date, "last Jul 10, 2025" on a current med, and the past-meds block. That block spans twelve months, so it crosses a new year every January.
  - The app's report screen: the scope line is now `reportScopeLine` in `lib/reportRange.ts`.
  - Today's History: `EventRow`, `FreeFeedingStrip` and `BoundaryMarkerRow`.
  - The whole trial family, per the ruling.
- **One name for the window.** "Since the last vet visit" on the rundown, the report screen and the saved-visit moment, imported from History's `ANCHORED_WINDOW_NAMES` rather than retyped.
- **The rundown on the shared bound (CUL-1127 item 1).**
  - It reads `readLatestVisitBefore` (`lib/visitWindow.ts`, H-11): the latest visit strictly before the rundown's day, the report's rung 1.
  - "New since" moved to a pure `countSinceVisitChanges` that compares local day indices, never text (C-40). The old text bound was UTC midnight. West of UTC it counted a food first fed the evening before the visit as new; east of UTC it missed one first fed the morning of the visit.
  - `guards/visitReaders.test.ts` failed on the rundown's now-stale exemption, as it is built to, and the entry came out. Five comments elsewhere that cited the rundown's `MAX(visited_at)` were corrected.
- **Sign-out closes realtime (CUL-1127 item 3).**
  - `watchAnalysisRow` registers each watch's teardown in a set, and `cancelAllAnalysisWatches()` stops them all (timers, channel, no give-up).
  - `wipeLocalSession` calls it before its first await, then `supabase.removeAllChannels()`, which closes channels whoever opened them.
  - The file names its blind spot, a watch opened after the wipe (CUL-1256).
- **The month model's header (item 4)** now describes `monthReads`' predicate: every event type except a look, not the Trial panel's comparison-gate set.
- **`lib/utils.ts` is untouched on purpose.** It is in the shipping closure of `ask`, `generate-signal` and `generate-report`, so an edit there redeploys all three on merge. `formatLongDate` is now dead code, and its removal rides CUL-1254, which edits that file anyway.

## The reviews

- **`code-reviewer`: ship-ready.**
  - One nit taken. `EventRow`'s comment claimed every row shares one `today`, but each row reads its own. The comment now says what the row does, and `history.tsx` gets no threaded prop, since v1 History is being replaced.
  - One pre-existing nit left: `StartTrialModal` uses the wall-clock default of `formatTrialEndDate`.
- **`adversarial-reviewer`: HOLDS WITH NOTES.** Everything was probed in a scratch copy.
  - **Boundaries held.** Meals at 23:59 the night before and 00:00 on the visit day, across five DST dates and six zones (UTC−10 to UTC+14), with mixed `Z` / `+00:00` spellings.
  - **Anchor held.** A visit today with older and future rows anchors on the older one. A pet weighed at today's visit keeps Get ready's weight row silent. Three boundary mutations each failed tests.
  - **One real break, fixed in this PR.** The saved-visit moment told the owner *"'Since last visit' on Home starts again from here"* the day a visit is saved. That was true only while the rundown's anchor was unbounded, and this PR removed that. The line now moves with the report: it is said for a visit dated before today and dropped for one dated today (the report line already says "From tomorrow…"). Its test was rewritten to pin the new rule, and reverting the fix fails it.
  - That also made a sentence in the History v2 spec untrue (§3.9, "Home's *since last visit* restarts the day a visit is saved"). It is a Tier 2 edit, filed for approval as CUL-1257.
- **`rls-privacy-reviewer`: HOLDS WITH NOTES.** It drove the real realtime-js 2.105 through a dead transport.
  - Every live watch and channel closes before the next owner's `SIGNED_IN` re-authenticates the socket. Each leave resolves locally, so the list is empty in about 1 ms, and an in-flight tick is fenced twice (`done` and the sign-out epoch).
  - My comment claimed each unsubscribe waited on a server reply; it does not, and the comment now says so.
  - **Not closed:** a read started before sign-out, on a record screen still mounted under another route, can finish afterwards and open a new watch under the next owner. RLS refuses the rows, but the id still travels under the wrong login. Filed as CUL-1256 with the trigger's missing epoch fence, the chain map and two pre-existing low items.
  - **Separately:** `useEventStore.todayEvents` is never reset at sign-out, so the next account's first Home paint could show the previous account's day. Filed as CUL-1255, High, `Gate: privacy`.

## Verification

- `tsc` clean. The full jest suite (508 suites) passes in UTC and in all three non-UTC CI zones (Kiritimati, Chatham, Honolulu). The suite ran again on every push through the pre-push hook.
- **Mutations: 6 run, every one restored and killed.**
  - The since-visit day compared on its UTC day: red at UTC−10 and UTC+14, in opposite tests.
  - The four teardown mutants: the cancel removed, the channel close removed, the cancel moved after the first await, and a watch that never registers.
  - The saved-moment line reverted to its old condition.
- A process note: the first mutation was reverted with `git checkout`, which also discarded that file's uncommitted edits. A pre-mutation backup restored them, and every later mutation ran against a committed tree.
- `main` moved during the session (HV-10 #919, HV-11 #918). It was merged in; the two conflicts were additive and both sides were kept.

## Residuals

- CUL-1256: the late-open watch and its siblings (above).
- CUL-1255: Today's rows survive sign-out.
- CUL-1254: about ten other surfaces print yearless dates through `formatCalendarDate`, plus `formatLongDate`'s retirement.
- CUL-1257 (Waiting on PM): approve the §3.9 spec correction.
- CUL-1188: the hydration pager, now carrying CUL-1127 item 2.
