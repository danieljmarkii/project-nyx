# Quick Win sweep (second of the day): Early access, the Didn't-eat heads-up, a real DST test, the iPhone time seed, a replaced photo's date

**Date:** 2026-09-24 · **Branch:** `claude/stoic-feynman-skvcnm` · shipped via #900 · five picks, one commit each, one `code-reviewer` pass (ship-ready, no findings in the changed code; its two out-of-scope finds are on Linear)

| Issue | Outcome | Proof |
|---|---|---|
| CUL-70 | **Shipped.** The shelf says "Early access" wherever it is shown or spoken; the per-card pill is cut; the ruled Review-Notes line is in | 7 tests red on the pre-fix screens. A planted ", beta" in the switch label and a planted "Beta" in the footer each red the shown-or-spoken walk on their own |
| CUL-893 | **Shipped.** The intake-first sheet calls `applyMealTrialFlag`; the one-copy scan covers it | The scan and both wiring tests red on the pre-fix sheet; the failed-write case is refactor safety |
| CUL-948 | **Shipped.** DST cases find the running zone's own transitions and bite in the Chatham job | Under `TZ=Pacific/Chatham`, `floor` / `ceil` / `trunc` in place of `round` each red an edge; under UTC all three survive; an empty finder reds the non-vacuity case |
| CUL-984 | **Shipped.** On iOS, opening the time picker commits the 9:00 it shows; Clear (and the arm switch) closes the wheel | Five iOS tests red on the pre-fix components; the Android pair reds when the iOS guard is dropped |
| CUL-956 | **Shipped.** `/log` replaces a photo's date with the photo | The unstamped-replacement test reds on the pre-fix screen. The vet-visit instance was already gone; SimpleEventConfirm and food-capture checked and clean |
| CUL-1052 | **Cut, Gate: design.** The refusal's placement under a collapsible field is a new call, and the helper line the fix leaned on is wrong | Verified at `StartTrialModal.tsx:216-220` and `lib/dietTrialSetup.ts:179-185` |
| CUL-1148 | **Filed, Gate: design.** The start-trial helper says "Most skin trials run N weeks" with N from the owner's typed length | Found sizing CUL-1052 |
| CUL-1149 | **Filed, Gate: design, then widened to Medium.** An EXIF-dated event time outlives the photo that set it: after a replace (found fixing CUL-956), and after Back into a meal, where the meal takes the abandoned symptom photo's time as `'exif'` (found by `code-reviewer`) | `app/log.tsx` `handleBack` resets the photo but not `occurredAt` / `occurredAtSource`; `handlePickFood` reads `usingExif` |
| CUL-1150 | **Filed, Gate: device.** After a visit, *Set a date* books on the wheel's first stop on iOS, so the six-week seed can't be kept | `components/vetvisits/AfterVisitBody.tsx:274-290`; flagged by `code-reviewer` as a neighbour of CUL-984 |
| CUL-947 | **Gate: design** | The past-visit sheet's saved moment is a surface choice; verified at `app/vet-visits/index.tsx:207` |
| CUL-1019 | **Gate: clinical** | The done-definition is a `vet-report-cold-read` of the new fixture |
| CUL-1075 | **Quick Win removed** | An engineering call and its own session; stays High in the Design v2 order |
| CUL-876 | **Gate: device**, blocked by CUL-872 | Its other prerequisites (N-3b, N-4b, N-5, N-6 live) are met |
| CUL-421 | **Left** | In review on #791 |
| CUL-1092, CUL-1097, CUL-937, CUL-1098, CUL-1087, CUL-1095, CUL-720 | **Left** | Each re-verified at file:line and still true; CUL-720 was gated earlier today |

**PM action:** CUL-1151 (Waiting on PM, Gate: device), the on-device pass for the three visible changes: Early access, the Didn't-eat heads-up, the iPhone visit time.

**Lesson:** CUL-1052 told the builder to verify its "legibility beat" rather than assume it, and the check found the beat false for every custom length, not just the absurd one. When a fix leans on an existing sentence to explain itself, read the sentence with the fix's inputs before building on it.
