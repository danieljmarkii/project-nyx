# History v2, step 0, Bundle A: a day link read by its sender, and a widget pet that lets go

**Date:** 2026-09-24

Shipped via #904 (CUL-1073, CUL-1119). Follow-up filed: CUL-1177. Evidence posted for Bundle C on CUL-1120.

## The ask

Bundle A of the History v2 project: CUL-1073 and CUL-1119 in one session and one PR. History's day link had to read a local day with its bounds parsed, so the Design v2 month's day detail could gain its "Open in History" door; and the widget's `?pet=` had to apply once per tap, so a later pet switch in the app sticks. Plan posted, PM said go.

## What was wrong

- **History read every `?date=` as a UTC day** (`effectiveRange` → `utcDayBounds`), and `getTimeline` compared the bounds as text. The widget sends the owner's LOCAL day, so its day view was off by the owner's offset for everyone outside UTC: in Honolulu at 3 PM it showed a day that ended at 2 PM and began at 2 PM the day before. The flag-off calendar sends a UTC day on purpose (its sheet counts one), so the parameter meant two clocks.
- **The widget's pet never let go.** `useWidgetPetLink` re-selected the widget's pet whenever the active pet differed from `?pet=`, with `activePetId` in its dependencies. History is a tab that stays mounted with the widget's params in place, so every in-app switch was reverted a frame later. The log screen did the same while open; the issue had it as unconfirmed, and the new log test reds against the old hook. Both screen suites stubbed the hook to a no-op, which is why nothing saw it.

## What changed

- **`lib/historyDateFilter.ts` reads a day link by sender** (H-7): `?day=` (new, the month's door) and `?date=` with `src=widget` are local days; a bare `?date=` keeps its UTC meaning until the flag-off calendar retires at D2-8. A day key must round-trip, because `Date` rolls Feb 30 over to Mar 2 rather than refusing it. Local bounds are built from the key's components, so a 23-hour day is one day.
- **Every History bound is parsed** (C-40). `lib/historyPage.ts` (`readHistoryPage`) gives the SQL a copy of the range one minute wider on each side and places each row on its parsed instant. It returns `fetched`, the query's own count, because History pages by OFFSET and a dropped edge row still took a place in the query; a page made only of edge rows is read past rather than returned empty, and "has more" is the last query's own answer. The live insert of a freshly logged event uses the same predicate. The presets ride the same path, so a synced row at exactly local midnight now counts toward Today.
- **The widget's pet is a one-shot per tap** (C-22): the pair (pet, `ts`) is spent in a ref before `selectPet`. It waits for the pet list on a cold start instead of spending the tap on an empty list; an unknown pet spends the tap, so it cannot fire later if the list gains it. History passes `ts`; the log screen has none to pass, so there it is once per open.
- **The month's day detail has its door:** `Open in History · Sep 2`, the shipped sheet's link, pushing `{ day, ts }` through `historyDayHref`. It appears only once the rows have answered and there is at least one. The door's label and History's pill are one function (`historyDayLabel`).

## Decisions

- **A new `?day=` rather than `?date=&src=month`.** An existing parameter never changes meaning in place, and a parameter with one meaning from birth is what the doorway registry (HV-11) can list without footnotes. The widget keeps `?date=` because it is frozen; History reads it by its `src`.
- **A minute of slack, not the month's day.** History pages this read by OFFSET and every slack row is fetched and then dropped; a day's worth could fill a page with the neighbouring day and leave the list blank. The spelling hazard lives inside one second.
- **No mock frame for the door.** It is the shipped sheet's link, copied as is, restyled only to sit left-aligned in the slot at the slot's type size. The PM was offered one in the plan.
- **The trade in CUL-1119, said out loud.** The widget mints `ts` when it draws, not when it is tapped, so a second tap on one drawing does not re-apply the pet after an in-app switch. The day link already behaved this way. The old hook only "handled" that case by reverting every switch. Filed as CUL-1177 rather than widening this PR: the fix is an app-side per-tap signal keyed to the link's target path.

## Verification

- 13 mutations in the build (two more in the review round, below), each restored from a tarball snapshot; every one reds at least one test: widget date read as UTC, no prefilter slack, a text `inRange`, a text live insert, paging by the list's count, the hook spending on an empty list, an unknown pet left unspent, the nonce ignored, History passing no nonce, History ignoring `?day=` on a mounted tab, the door on an empty day, the door sending `?date=`, and no round-trip check. The old hook reds 7 of 9 hook tests and the log screen test.
- A real-SQLite test drives History's read and the month's `readDayRows` over one table straddling both midnights and holds them equal; the exact bound through the same SQL is shown to misplace the synced edges, so the prefilter is load-bearing.
- The widget's emitted link is parsed and fed to the reader, so the frozen sender and History are bound in one test.
- Full suite green; `tsc --noEmit` clean; the touched suites green under Kiritimati, Chatham and Honolulu, and under the 30, 180 and 400 day clock skews.
- `code-reviewer` (isolated, run over a copy of the tree): no bugs, no anti-patterns, ship-ready. It enumerated every sender of a History route across the repo and found each read as the table says. One cleanup taken rather than filed: the first draft stated as a blind spot that a page of nothing but edge rows would come back empty with more to read (the first page of a scope would then draw the empty state over a record that has rows); the read now goes on past such a page. Proven by two mutations: returning the first page anyway reds two tests, and treating an empty page as full at a zero limit hangs the suite. One nit left as is (three test files each define a two-line fixture helper; the files are self-contained by convention).

## Residuals

- CUL-1177 — the widget's `ts` is minted at draw time.
- CUL-1120 (Bundle C) — the widget's arrival on a non-active pet races the read already in flight, and the new pet's read is dropped; evidence and a test shape posted on the issue.
- The flag-off calendar's own sheet still compares its UTC bounds as text; it retires at D2-8.
- A door into a day in an earlier year prints no year ("Dec 31"), as History's pill always has; the H-10 formatter (`lib/recordDates.ts`, HV-3) is the place to fix both.
