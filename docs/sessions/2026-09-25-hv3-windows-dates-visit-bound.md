# History v2 HV-3: the windows, the one date formatter, the shared visit bound, the scope store

**Date:** 2026-09-25

Shipped via #909 (CUL-1160). Filed CUL-1189 (Waiting on PM). Coordination posted on CUL-1161 (HV-4), CUL-1164 (HV-7) and CUL-1170 (HV-15).

## The ask

HV-3 of History v2, one of five step-1 sessions running at once. It builds the rules for time that every History surface will share: the window table (§3.9), the one date formatter (H-10), the "since the last vet visit" bound shared with the vet report (H-11), and the History scope store (§5.2). Nothing renders yet; HV-7, HV-8 and HV-9 build the screen on these. The plan was posted and the PM said go.

## What changed

- **`lib/recordDates.ts`: the one formatter.** Bare in the current year, stamped outside it, the year once per range (*Dec 27, 2026 – Jan 2*). Day keys in, never instants, and no imports, so it is zone-free and the Edge Functions can use it as is. It also holds `recordDayIndex`, the one strict day-key parser the other modules share.
- **`lib/visitWindow.ts`: the visit bound.**
  - The latest visit strictly before today, including its day, compared as parsed day indices (C-40).
  - The answer is a branded `SinceVisitDay` that the window table requires, so "one function" is enforced by the compiler rather than by review.
  - The local read takes its database as a narrow structural parameter (the `CacheFlushDb` precedent), which keeps the module free of React Native imports, so HV-15 can import it into `generate-report` unchanged.
  - Registered in `guards/visitReaders.test.ts`. `lib/visitWindow.guard.test.ts` pins the report's copy of the rule (`resolveScope`, rung 1) and the module's Deno-loadable import graph, until HV-15.
- **`lib/historyWindows.ts`: §3.9's table in local days.**
  - Every window is clipped to the pet's record and today, and comes out as `WindowBounds`.
  - The trial window is offered while the trial runs (`isTrialRunning`, §11) and is dated by `exposureRange`, never `range`. `windowTrialOf` is the only way to build it.
  - Also: one long and one short name per window, months grouped under their year, the All time fallback, `weekStartOf`, and the `?window=` codec that keeps v1's `today` / `7d` / `30d`.
- **`store/historyScopeStore.ts`: the scope.**
  - The filter, the window, search, the landed day and the strip's week.
  - A pet switch resets all of it inside the pet store's own update, which a render test proves never shows one pet's name over another's filter. Every setter names its pet.
  - The landing is a one-shot request taken in one step (C-22).
  - The read key uses the resolved dates.

## Decisions

- **A month outside the current year reads *September 2025*** on the pill and the count line, and sits bare under its year on the sheet. This is H-10 applied to months; the mock only drew 2026.
- **The trial window follows belief, a reversal of the plan.** The plan read §3.9's "offered while the range reaches today" on its own, and kept offering an un-ended trial's window. The adversarial pass showed that trial still offered a year later: vomits after the owner went back to the old food would read as a failed trial. §11 says "only while the trial runs", and in this app that is `isTrialRunning`. So now belief decides *if* the window is offered and evidence decides *when* it starts. Stated on CUL-1189 for the PM to object to.
- **A fallback window is not written back to the store.** The owner's choice stays, so a window that is only briefly unavailable (facts being recomputed across midnight) comes back by itself.
- **The shared parser lives in `recordDates`, not `lib/utils.ts`.** `utils.ts` is in three Edge Functions' shipping closure, and a change there redeploys them on merge (CUL-1147), `generate-report` among them while its own deploy is in flight.

## The reviews

- **`code-reviewer`** (isolated): ship-ready, no bugs, four nits, all taken.
  - Search writes that change nothing no longer notify subscribers.
  - `applyDoor` answers false when its day was refused.
  - One shared parser.
  - The same-`today` contract is written on `WindowFacts`.
- **`adversarial-reviewer`** (isolated, Data Scientist lens): FAIL on two spec-level findings, and held everywhere else.
  - **Held:**
    - The visit bound agreed with the report's `resolveScope` over 61,200 fuzz cases in 8 zones, including every DST midnight; a planted `>=` mutant produced 2,507 mismatches, so the fuzz was live.
    - The windows agreed with an independent calendar oracle over 336,000 checks, including Lord Howe's 30-minute DST and zones where DST removes local midnight.
    - The formatter agreed with its oracle over 400,000 checks.
    - A same-day visit, a trial that ended yesterday, and "never before the record" all held.
  - **Fixed in 16346d8:**
    - The trial-overrun window.
    - The read key keyed on the window's name. A read made before midnight would paint days the pill no longer names.
    - A first record passed as an instant was read as "no record", which hid every earlier row.
    - A null `today` in the visit bound was conflated with "no visit".
    - Trial facts computed with a report scope would have mislabelled the anchor.
    - The fallback write-back would have lost the owner's choice.
  - **Routed to the PM (CUL-1189):** a visit or trial dated before the pet's first log. History's window starts at the first log under *Since Jul 26*, while the report counts the unwatched days (*62 days · 54 with a log*). Also, whether the trial window says it is past its planned end during B-422's 56-day grace. The module exposes both facts (`recordStartsLater`, `trialPastTarget`), so HV-7 can build whichever is ruled.

## Verification

- **Mutations: 26 run, every one restored.** 15 in the build round, one equivalent mutant, and 10 in the review round. Every non-equivalent one reds a test, including:
  - the report pin: `>=` becomes `>`, and the window starts the day after the visit;
  - a React Native import, and an extensionless import;
  - the dropped `visitReaders` registration;
  - N × 24h arithmetic, which is green in UTC and red in Chatham and New York (exactly why the DST case exists);
  - the first-record clip, and `.range` read instead of `exposureRange`;
  - a late pet-switch reset (the render-frame test reds);
  - the belief gate, the scoped-facts refusal, and an instant first record read as no record;
  - the read key on the name.
- **The one survivor is equivalent.** Comparing two validated fixed-width day keys as text gives the same answer as comparing them as numbers, so no test can tell them apart. It is recorded here rather than read as a gap (C-35).
- **One guard removed, not kept untested.** A "trial read for another day" check turned out indistinguishable by any test: the evidence check already refuses a trial read the night before, and belief only turns off as days pass.
- **Suites:** `tsc --noEmit` clean. The full suite is green in UTC after both rounds and under Chatham. The changed suites are green under Kiritimati, Chatham, Honolulu and New York, and under 30, 180 and 400-day clock skews. CI is green on both heads.

## Residuals

- **CUL-1189 (Waiting on PM):** the two count-line rulings. They gate HV-7's count line, not this PR.
- **A spec wording edit, proposed:** §3.9's trial row should read "offered while the trial runs (§11) and its range reaches today", to match what is built.
- **Blind spots, stated in `lib/historyWindows.ts`:** a row dated after today, from a device clock that was set forward, sits outside every window. A first record dated after today puts nothing before today in any window.
- **HV-7 has to assemble `WindowFacts` for one `today`:** `windowTrialOf`, `readLatestVisitBefore` and the first record, recomputed together when the day changes. The read key takes the resolved window. Both are posted on CUL-1164.
- **Not wired anywhere yet, by design:** no screen imports these modules until step 2.

## After the wrap: CUL-1189 ruled

The PM ruled both briefs **(a)** the same night, so the ruling rides this PR rather than a second one:

- **Brief 1:** a trial or visit window whose anchor is before the pet's first record keeps starting at the record (GAP-24), and the count line names where it starts (*Since the last vet visit, Jul 26 · record from Aug 3*). The ruling covers the two anchored windows only, so `recordStartsLater` is now null for rolling windows and months (a month already says *from May 14* on the sheet). Proven by mutation: dropping the anchored-only condition reds the new test.
- **Brief 2:** inside B-422's grace, the trial window's count line says *past its planned end* (`trialPastTarget`, unchanged).
- **The spec is v1.2** (`docs/nyx-history-v2-requirements.md`): §0.5 records both rulings; §3.2 carries the two count-line clauses; §3.9's trial row and §5.2 say the window follows `isTrialRunning` (§11), which stood unobjected on CUL-1189; §7 gains AC 40 and 41. The words are HV-7's to build (CUL-1164 has them).

