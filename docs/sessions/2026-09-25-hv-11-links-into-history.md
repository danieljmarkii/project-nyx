# History v2 step 3, HV-11: every link into History

**Date:** 2026-09-25

Shipped via #918 (CUL-1168, and `Fixes CUL-498`). Filed: CUL-1251 (Ask's server counts 7 / 14 / 30 as UTC days), CUL-1252 (the rundown's History tiles open the active pet), CUL-1253 (the §5.8 spec edit, approved and written as spec v1.6 in this PR).

## The ask

HV-11 of History v2 (spec §5.8, H-7; AC 28, 36, 37). The work was a registry of every link into History, a guard that fails the build on an unregistered one, and each in-app sender landing on its filter, window or day in the new screen. Each link had to land right with the flag off, with it on, and when the flag flips after mount. The widget's link stays frozen. It also closes CUL-498: Ask's 14-day and since-the-trial audits now reach History. It ran beside HV-10, and this session left `components/motion/` and the screen's layout alone.

A plan was posted in the session with three decision briefs, and the PM ruled the team's recommendation on all three:
- **D1:** ship the phone half of BRK-5. Moving Ask's server to local days is CUL-1251.
- **D2:** each of the rundown's three tiles gets its own landing.
- **D3:** Ask's trial link opens History only where History offers that window.

## What changed

- **`lib/historyDoors.ts`, the registry.** It has nine rows: the widget (frozen), the Patterns month, the flag-off calendar, the look card's *more today*, Patterns' *What you noticed*, Ask's answer link, Ask's chip, a medication's past course, and the rundown. Each row names its files, its builder, what it sends, and where it lands with the flag off and on.
  - The header states the rule. A parameter v1 does not read (`course`) may be sent in both flag states. A parameter v1 does read (`type`, `window`, `date`, `day`) takes a new value only under the flag.
  - The file also holds the builders the in-app senders now call: `historyHref` and `rundownHistoryHref`.
- **`guards/historyDoorways.test.ts`, the guard.** It reads every `.ts`/`.tsx` file in every top-level directory, a set derived from the repository on each run. The excluded directories are named with a reason each, and a stale exclusion fails.
  - **Three detectors:**
    - (a) a string literal that opens with a route to History, in any shape the app uses;
    - (b) one hop: every file that names a row's builder must be that row's sender;
    - (c) in a builder file, every exported function that builds the route must itself be some row's builder.
  - **Blind spots are stated in the file.** A route assembled from pieces is pinned as a test showing it is *not* detected.
- **The reader.**
  - `lib/historyDoorParams.ts` gains `course` and `type=symptoms`.
  - A tap is now spent once across the screen swap a flag flip causes. Both one-shot memories, the door's and the widget pet's, moved from per-mount refs to `lib/spentTaps.ts`, and `wipeLocalSession` clears it.
  - `hooks/useHistoryDoor.ts` reads the pet store live. When a widget link's switch has already been spent and the owner is on another pet, the link is dropped instead of landing late.
- **Ask.** Under the flag, *Last 14 days* and *Since the trial started* open History. The trial window opens History only when History offers it for this pet today: `hooks/useHistoryTrialOffered.ts` checks through the same `readWindowFacts` History's own controls read, and fails closed to Patterns. With the flag off, the routes and labels are byte-identical to today's.
- **The medication screen.** Each past course's *See doses in History* now sends its course key. v1 ignores the key, and v2 lands on that course over All time.
- **The rundown.**
  - Under the flag:
    - *since the last visit* lands on Since the last vet visit;
    - *None logged in 30 days* lands on All symptoms, Last 30 days;
    - a past course with no regimen lands on that course, All time.
  - These scoped doors apply only when the rundown is about the pet on screen. History shows the active pet, so a scope over another pet's record would be confidently wrong (C-9).
  - With the flag off, or for another pet's appointment, the tiles push the bare route as before.
- **`guards/historyV2FlagOff.test.tsx`.** The rundown screen and Ask's answer card read the gate only to choose a link. They join `DRAWS_ELSEWHERE_OK` as deciders. Each names its flag-off proof test, and the guard checks that the test exists and still pins the flag-off link.
- **`docs/engineering-lessons.md`.** Two dated addenda:
  - C-22: a ref is once per mount, and a flag that swaps screens is a remount.
  - C-38: a registry that knows a file does not know what the file exports.

## Decisions

- D1 to D3, as above (PM, on CUL-1168).
- **Where the gate is read.** A sender reads it only where it decides a link, and draws nothing of v2. The guard accepts that as a "decider" with a named proof, rather than listing the rundown screen as a rendered surface: its first frame is a spinner, and its tiles arrive after a read, so a first-frame tree comparison would have compared nothing.
- **The issue put `useHistoryDoor.ts` in `components/historyV2/`.** HV-7 had put it in `hooks/` on purpose (the flag-off guard wraps every namespace export into a component), and the code wins. The conflict is flagged on the issue.

## The reviews

- **`code-reviewer`: ship-ready, no correctness bugs.** It mutation-tested the guard on a scratch copy of the real tree and confirmed every detector, plus the stated per-file blind spot. It asked for three things, all done in the review round:
  - **A rendered test of Ask's answer card** (`components/ask/AskAnswerCard.test.tsx`). It is now the flag-off proof the guard names for that file, and it was proven by swapping the reach's two fields and by ignoring the offer check.
  - **A test for the door's wait branch.** The honest answer is that the branch is unreachable while the widget hook switches first in the same flush. It only guards against the two hooks being reordered, and the hook now says so. The cold start it sits beside is tested and mutation-proven.
  - **A note on a widget tap spent with no switch.** That only happens for a pet the account no longer has, since `usePet` loads the list in one step. It is now written in `lib/spentTaps.ts`.
- **QA lens.** `app/(tabs)/history.doors.test.tsx` runs every registered door with the flag off (v1's page read), on (v2's scope), and flipping on after mount. It also covers two re-apply cases: the widget's pet after the owner moves away, and an old link over the owner's later choice.
- **Adversarial review: N/A.** No detection, correlation, AI-read or escalation logic changed. The Data Scientist lens still tried two falsifications on the count-agreement promise:
  - **A trial past B-422's grace**, still `status = 'active'` on Ask's server. It lands on Patterns, not All time, so the link never opens a list wider than the count ✓.
  - **Ask's 7 days at 11:30 PM local.** The link lands on the window table's seven local days (AC 28 ✓), but the server's count is UTC days. That did **not** hold end to end. It is ruled D1 and filed as CUL-1251.

## Verification

- `tsc --noEmit` is clean. The full jest suite passed: 511 suites, 11,562 tests (6 skipped, none of them this work's). The touched suites also pass under Pacific/Kiritimati, Pacific/Chatham and Pacific/Honolulu. CI passed on the first push.
- **Live mutations, all red and all restored:**
  - an unregistered file spelling a route;
  - the rundown's row removed;
  - a new caller of `historyDayHref`;
  - the door's spent memory put back in a ref;
  - the widget pet's spent memory put back in a ref;
  - the rundown's pet check removed;
  - the answer card's reach fields swapped;
  - the trial-offer check ignored;
  - the door spending a tap before a pet exists.
- **After the first wrap, HV-10 (#919) merged to `main` and was merged into this branch.** Both conflicts were additive, and both sides were kept:
  - the flag-off guard's pinned consumers now list the History tab, Home's Today card (HV-10) and the two link deciders (HV-11);
  - the sign-out wipe clears both HV-10's removal notices and this PR's spent taps.

  After the merge, `tsc` was clean and the full suite passed (515 suites, 11,621 tests). The merged suites passed in the three zones, and CI passed on the merge commit. The doorway guard found no new link into History among HV-10's files.
- **The first cut of the guard stayed green when the rundown's row was removed.** The rundown's builder lives in a file the registry already knew for another row. Detector (c) closes that hole. The C-38 addendum tells the story.

## Residuals

- CUL-1251: Ask's server still counts 7 / 14 / 30 as UTC days, so an answer and the list it opens can differ by an entry logged near midnight UTC. v1 already had a third definition (now minus N × 24 hours).
- CUL-1252: in Get-ready mode for another pet's appointment, the rundown's History tiles open the active pet's History. With the flag on, they keep the bare route in that case rather than a wrong scope.
- The registry works per file. A second door added to a file that already holds one is not a new finding; that blind spot is stated in the guard.
- A course key for a course that no longer exists lands on an empty course filter named *Medication*. HV-9's label rule covers the name; the list says *Nothing matches that filter*.
- CUL-1253: the §5.8 spec edit that makes the table say what the rows say. The PM approved it at the wrap, and it is written in this PR (spec v1.6).
- For the device pass (HV-13): each door once on a phone with the flag on, and one Beta-shelf flip while History shows.
