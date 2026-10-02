# History v2, step 0, Bundle C: a read that answers only for the pet on screen, and a dose row that always says what happened

**Date:** 2026-09-25

Shipped via #908 (CUL-1120, CUL-1124). Follow-ups filed: CUL-1184, CUL-1185, CUL-1186, CUL-1187. A decision brief for v2's dose row posted on CUL-1163 (HV-6).

## The ask

Bundle C of the History v2 project, the optional step 0 session: CUL-1120 and CUL-1124 in one session and one PR, in today's History, which every account sees until History v2 goes to everyone. Gate checked: Bundle A merged as #904. Plan posted with one decision; the PM ruled **(a)** and said go.

## What was wrong

- **CUL-1120.** `loadEvents` returned early whenever a read was out (`if (loadingRef.current) return`), which drops the NEWER request. A pet switch while a read was in flight never read the new pet, so the old pet's rows landed under the new pet's name and stayed until something else reloaded. Bundle A's evidence: it fires reliably on a cold start from a widget whose pet isn't the active one. The same drop hit a filter picked or a door tapped during a read. `loadFreeFeeding` had no guard at all. And the C-12 flags were per screen, not per pet: after a switch, a failed read left the old pet's rows up with no error, because a list that isn't empty never shows the error state.
- **CUL-1124.** `EventRow` drew the adherence chip only inside the drug name's branch, so a dose with no name showed no Given, Partial, Missed or Refused, and a refusal read like a given dose. `getTimeline` named a dose only from the item cache, so a dose of a course typed in by hand read "Medication" while the vet report named it. The issue's pre-step, answered as an aggregate count: 94 live doses, 94 linked to a named item, 0 course-only. No real row shows either defect today, so every fixture is built for its case (C-35).

## What changed

- **`app/(tabs)/history.tsx`:** a replace read carries a load id and supersedes; its answer is written only if it is the newest and still for the active pet. Load more waits its turn, and only extends a list that is the active pet's. `loadFreeFeeding` gets the same two checks. Every answer (rows, loaded, error, visits, the bowl strip) is stamped with its pet, and only the active pet's are drawn. The Remove rollback, the live insert from Today's list, and a failed Load more's retry touch only the list their row belongs to.
- **`components/history/EventRow.tsx`:** the dose line renders for a dose with a name, a chip or a doubt. The chip shows on every dose, and the doubt test reads the narrowed adherence, as the record screen does.
- **`lib/db.ts`:** `getTimeline` and `getEventById` join the dose's course for `regimen_drug_name`, scoped to the same pet (the server has no same-pet trigger on `medication_id`).
- **`lib/doseDisplay.ts` (new):** `doseDrugLabel` (the item, else the course, else null) and `asDoseAdherence` (an unknown value reads as unrated instead of crashing the row).

## Decisions

- **PM ruling (a):** a dose nothing names reads only "Medication" plus its chip, never "no medicine named". An item or course that hasn't reached the phone reads exactly like none, so the explicit wording would be a false claim during a sync. The v2 spec's §3.6 has the same gap; the brief is on CUL-1163.
- **The helpers live in a new client-only module.** `lib/medications.ts` is inside `generate-report`'s shipping closure (C-26), so a helper there, or even a comment edit, would redeploy the vet report on merge. The same reason left its B-161 comment uncorrected (noted on CUL-1184).
- **Stamps, not a reset during render.** The house has been burned by setState during render (the `EventTypeSheet` lesson), and the `loadedFor` shape was already the codebase's answer (`AppointmentStrip`, `LookCard`).
- **Scope held to History.** The record screen, Home v1's Today strip and the meal's cross-link still name by item only (CUL-1184). Home v2's row and `lib/dayEvents.ts` belong to HV-6.

## Verification

- **Red first:** 9 of the 11 new CUL-1120 cases were run against the unfixed screen and failed for the defect itself: the new pet's read never issued, old rows on screen, no error state, a stale retry paging the new list. The other two (the bowl strip taken down at once; a Today row for another pet kept out) were added to pin two guards the first nine did not reach. Their mutations fail them.
- **Mutations:** each CUL-1120 safeguard, broken alone, fails at least one test (restore the drop, drop the answer check, drop each render gate, the rollback guard, the retry guard, the bowl read's checks, the live insert guard). The one survivor, stamping the error flag, guards only the frame before the new read clears it, which `act` can't observe; it is stated, not claimed. All 9 CUL-1124 mutations are caught, and each review fix was proven the same way.
- **Suites:** full suite green (10,003 passed, 3 skipped at the review fix), `tsc --noEmit` clean, the touched suites green under Kiritimati, Chatham and Honolulu, and CI green on #908. History's suites no longer print React `act` warnings; the main suite had four before this change.

## Reviews

- **`adversarial-reviewer`, Dr. Chen's lens (HOLDS WITH NOTES):**
  - Held: Sam's unnamed Refused dose, the unnamed in-doubt combo, the 26-dose hand-typed course, the cross-pet link, and an item and course that disagree (the item wins).
  - "Missed" does not conflict with the med strip's N1: the chip repeats the owner's own tap, and no code infers it.
  - Latent break: an adherence value this build doesn't know decided doubt on the raw value, so on a combo whose meal was refused the row went silent while the record screen marked it in doubt. Fixed.
  - The record read's pet guard was untested. Fixed.
  - Noted, unchanged: the known G4 gap, where a combo dose logged before its meal is rated reads Given. v2's inline meal intake answers it.
- **`code-reviewer` (fix before merge, then clean):** found the same doubt bug independently, and verified that on an unnamed dose the whole line vanished. The fix was already pushed, and the test now covers the named and unnamed cases. Load ids, stamps, SQL and React correctness were checked and found solid.
- **No voice or copy pass needed:** no new owner-facing string ships.

## Residuals

- CUL-1184: the other dose-naming surfaces (the record screen, Home v1's Today strip, the meal's cross-link, and `lib/medications.ts`'s B-161 comment).
- CUL-1185: Home v1's Today strip can show the previous pet's day for a moment after a switch, and Today's loader has no guard against a late answer.
- CUL-1186: editing a course relabels its past doses in the vet report, while History keeps each item's name. Dr. Chen to say which name is the record's.
- CUL-1187: the read-only chip needs a rule for an unknown adherence value before S1 adds `vomited_up`, and it announces itself as a button (C-7).
- CUL-1163 (HV-6): the v2 wording decision, with (a) recommended.
