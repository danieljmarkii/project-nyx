# A booked vet visit quiets "worth booking a vet visit" on Home (CUL-2652)

**Date:** 2026-11-07
**One thing:** S1 L1 — The server ships on merge and the app ships at a cut, so a new value an old app doesn't know must read as the louder thing · check: pending

BUILD session on CUL-2652, branch `claude/keen-meitner-1u62xl`; shipped via #1478.

## What shipped

- **The Signal reads appointment dates.** `readCareRecord` (`generate-signal/index.ts`) selects `id, scheduled_at, cancelled_at, deleted_at` from `vet_appointments`. That is the date-only read amended AC 10 allows, plus the row id, which carries the "How did it go?" link and the paging key. It reads from the Signal's lookback, newest first, and pages to the end. A short or failed read empties the care record, so every concern keeps asking. `guards/visitReaders.test.ts` pins the columns, and `scheduled_at` joins the paging guard's time columns.
- **A new care state, `visit_booked`.** It applies to a raised chronicity concern with a standing visit whose local day falls in [today, today + 30].
  - The card drops its ask and shows "Visit booked for Nov 14. Worth mentioning the vomiting." with no "Your vet knows" tag.
  - In the 7 days after the visit it reads "Nov 14's visit. How did it go?" and opens that screen. If nobody answers, the ask comes back on day 8.
  - The cached sentence is the standalone one Get ready, Ask and the summary relay: "A vet visit is booked for Nov 14. Worth mentioning Nyx's vomiting."
- **What keeps its ask.**
  - A worsening card keeps its rail and asks "worth calling before Nov 14" (frame 3 B).
  - So does `raised_again`.
  - Escalations keep their sentence, ask and rank. They gain a `bookedVisit` fact beside the finding, never a care state.
  - The call-today card adds "Visit booked for Nov 14. A call today may still be worth it." A call-now card adds nothing.
- **Other cards.**
  - The weight card is booking-only on the server. This build draws no Home row for it.
  - `with_vet` → `recheck_booked` now runs on the date rule, with no topic test.
- **Spec:** care-state v1.5 (§3.1, §3.3, §4.7) carries every ruling. The engine version moves to `signal.12`.

## Why a new state and not `recheck_booked`

`recheck_booked` sits under the "Your vet knows" tag, which would put words in the owner's mouth. A new value is also the deploy seam. The server deploys on merge, and the installed app reaches it later. An older app reads an unknown state as none, so it keeps the shipped ask: louder, never quieter. So this needed no deploy hold.

## Rulings (PM, 2026-11-07)

Ruling 1: A. Ruling 2: any visit, no topic test. Guard: A, 30 days. Ruling 3: B, the softened line. Ruling 4: A. All four came in on the issue before the session started. In session: the worsening brief went **A** (a worsening card keeps its ask) and the mock frames were OKed. After the adversarial pass: **A, one quiet window per course.**

## The falsification rounds

- **Mutants.** Each of these broke a test:
  - the horizon moved from 30 to 31;
  - the after-window moved from 7 to 8;
  - the cancel filter dropped;
  - the worsening rule disabled;
  - the spent-window rule removed, its bound shifted by a day, and its weight half disabled.
- **Adversarial pass 1 (isolated)** returned FAIL on three quiet breaks:
  1. The summary was keyed by sign, so the worsening card for the same sign took the quiet chronicity sentence and lost its ask. It is now keyed per card.
  2. A passed visit quieted a concern that began after it, for example a vaccine six days before a new course. A passed visit now quiets only a concern whose onset is on or before it.
  3. Ask treated a tampered `visit_booked` on a worsening card as watched. It now honours that state on chronicity only.
- **Pass 1's hole #3.** A quiet card with no answer has no reference to re-raise from, and a pet on monthly injections would stay quiet forever. The PM ruled **A**: once a visit's week has passed unanswered in this course, a later booking never quiets the card again. The rule only adds a condition to going quiet, so it can only make Home louder. No second adversarial pass was run for it.
- **The code review** found:
  - a style-budget red;
  - a VoiceOver hint saying "Opens this signal" while the row opened "How did it go?";
  - a malformed booking that left a silent row. The ask now stays.
- **Held:**
  - A Los Angeles visit at 22:30 on day 30 counts by local day.
  - A short read stays raised.
  - The burden card keeps its ask and rank.
  - The call-now card gets no "may still be worth it".

## Residuals, stated

- Inside one quiet window (at most 37 days) a rise below the worsening lane's floor does not re-raise. The worsening lane and the burden card are the net (§4.4).
- The finding screen still says "worth booking": CUL-2670.
- The burden card's "soon" tier and the intake "word with your vet" asks are untouched over a booking: CUL-2671.
- A midnight clock flake in the TodayCard and Home first-paint tests blocked one push: CUL-2672.
