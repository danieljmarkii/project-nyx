# Quick-win sweep — the vet-doc date stem, parseTs, the occurred_at_source guard, the JS bundle

**Date:** 2026-09-13

Shipped via #845. Four issues closed, one new one filed, three read-and-cut with their reasons recorded on the issue.

## What shipped

Twelve Quick Win candidates read in full; four cleared the bar (no PM gate, no Edge-Function deploy hold — every function in `deploy-manifest.json` is `pending` or `hold`, which is half the reason these four were the ones left — no clinical / statistical / RLS / Storage / deletion review, under an hour each, disjoint files). One commit per issue.

**CUL-127 — the deleted vet document's date stem** (`lib/vetDocumentLibrary.ts`). One label composed two readings of `deleted_at`: the stem through `formatVetDocumentDate`, which hand-parses the leading `YYYY-MM-DD` lexically off the stored UTC text, and the countdown beside it through `daysLeftToRestore` → `localDayIndexOf`, which counts local calendar days. Delete late evening west of UTC, or early morning east of it, and the two halves of one string disagree by a day.

The lexical parse is not the bug, and that distinction is the whole fix: it is correct for the calendar-date columns it was written for (`document_date`, `visited_at`), where there is no time to shift and `new Date('2026-07-26')` would file the document a day early for every owner west of Greenwich. `deleted_at` is an instant, so it needs indexing before formatting. Fixed on the stem rather than the countdown because B-421 puts the day boundary at local midnight and the countdown is the half already honouring it — which is what the issue itself had reasoned, correctly, a month earlier.

**CUL-356 — `parseTs` accepted one spelling of "no zone"** (`lib/hydration.ts`). `parseTs` decides LWW. It normalized exactly the seconds-only SQLite space form under a comment that read as a guard over the whole class, and the comment named this issue by its legacy number as the out-of-scope remainder. The two missing forms are not hypothetical: `YYYY-MM-DD HH:MM:SS.sss` is SQLite's `strftime('%f')` output and how Postgres renders a bare `timestamp`; `YYYY-MM-DDTHH:MM:SS[.ffffff]` is what PostgREST returns for a column typed `timestamp` rather than `timestamptz`. Either parses as local, so on a non-UTC device an older copy can be judged newer, overwrite a newer one, and LWW converges on the loss.

The half the issue did not ask for is the one that needed guarding hardest: the `$` anchor after the optional fraction, so a value already stating `Z` or an offset passes through untouched. A match loose enough to catch the new forms but not anchored would re-stamp a correct `+05:30` as UTC — causing the exact failure this change prevents, in the one case that *is* reachable today.

**CUL-536 — a standing guard that the `occurred_at_source` flip rule has one implementation** (`guards/occurredAtSource.test.ts`). C-10 already said every point-time edit routes through `sourceAfterPointEdit`; nothing checked it, which is how CUL-326 rotted for months.

Scope was measured before the detector was written, and the measurement is the design. Twenty-one files in the scanned tree name `occurred_at_source`, so an every-mention scan would have meant allowlisting `sync.ts`'s pass-through, `db.ts`'s interfaces and `localSchema.ts`'s DDL — a registry pre-authorising every hole it lists, and the exact trap the sibling confidence guard records having tried and reverted. Asking one narrower question instead — *who chooses between source values?* — hits three files, each earning its exemption.

The issue's design note predicted the completion cards would need allowlisting as "a legitimate second pattern". They do not: all three call the shared predicate and never choose a literal, so they never reach the detector. The two exemptions the measurement actually turned up (`lib/db.ts`'s read-time narrowing, `SimpleEventConfirm`'s dirty-tracking shape key) were ones the issue had not anticipated. A predicted registry and a measured one were different sets, which is the argument for measuring.

**CUL-690 — the JS bundle beside the binary version** (`lib/appInfo.ts`, `lib/support.ts`, `app/settings.tsx`, `app/settings/feedback.tsx`). Neither `APP_VERSION` nor `APP_BUILD` moves on an `eas update`, so two devices on different JS bundles reported the same `v1.0.0 (build 35)` and an OTA-delivered bug reached the support inbox tagged with a string that could not distinguish it from the build before it.

Built to the issue's scope sketch, with one deliberate departure: three states, not two. The sketch says it degrades to `embedded`; that is right for a device we can read and wrong for one we cannot (Expo Go, a bare dev client, a read that threw), where reporting "embedded" asserts the thing that could not be read. Given the issue exists because a string could not tell two things apart, a readout that guesses would rebuild the bug one level up. Same reasoning on the mail footer, where an absent bundle prints `unknown` rather than dropping the line.

## What broke, and how

The `code-reviewer` pass found a real bug in CUL-690 — in the defensive read this session had described as the careful part.

`readUpdates()` wrapped its property reads in a try/catch under a comment claiming it protected against "Expo Go, a bare dev client". It did not. `expo-updates/build/ExpoUpdates.js` calls `requireNativeModule('ExpoUpdates')` at *its own* module scope, and `requireNativeModule` throws `Cannot find native module 'ExpoUpdates'` when the native side is absent. That throw lands while `import * as Updates from 'expo-updates'` is being evaluated — before any `try` in the file is entered, and an ES import cannot be wrapped in one. So in exactly the scenario the comment named, the import crashed evaluation of `lib/appInfo.ts`, which `app/settings.tsx` and `app/settings/feedback.tsx` both import at their top level: **the blank screen the comment said it was preventing, caused by the line meant to prevent it, on a screen every owner opens, by a diagnostic.** `lib/appInfo.ts` was also the only file in the app touching `expo-updates`' JS API, so that commit is what introduced the exposure.

Verified at the `expo-modules-core` source rather than taken on the reviewer's word, then fixed by moving the resolution inside the try as a `require` — the shape `lib/vetDocumentPickers.ts` (B-548) already ships for the same reason.

The more useful half is why nothing caught it, because that part generalises:

1. **jest-expo auto-mocks native modules.** `expo-updates` resolved to a generic stub and `require` never threw — `JS_UPDATE_ID` came back as the literal string `"mock"`, not `null`. The absent-module path is unreachable from a normal test and has to be constructed.
2. **`app/settings.test.tsx` derives its expected value from the same exports it checks.** That is the right test for "does the line mount" and is structurally incapable of catching this: it never varies the environment those exports are read from. This session described that split as deliberate — it was — without noticing it left the module itself with no test at all.

`lib/appInfo.test.ts` is new and puts the assertion on the module **load** rather than on a call, which is the only place a static import and a require-inside-try differ.

The four mutation proofs run on that commit were all real and none of them was pointed at the thing that was broken, because they proved the *formatter* and never the *module boundary*. The generalisable rule: a try/catch around property reads does not cover the import that produces them, and a harness that auto-mocks native modules stays green through that forever.

## Everything was proven by mutation

Fifteen mutants across the four commits, each reding only its own assertion. The ones worth keeping:

- **CUL-127:** reverting the fixed line reds the 23:30-local case at UTC−10 (`Deleted Jul 25`) and the 00:30-local case at UTC+14 (`Deleted Jul 23`). Both are green at UTC by construction — the device zone *is* the UTC day there, so no fixture can separate the two readings, and the `App (jest, non-UTC timezones)` job is what holds the fix. The test file says so rather than leaving it as a surprise. Both hemispheres are covered deliberately: a one-sided fixture only guards the one whoever wrote it lives in.
- **CUL-356:** restoring the old regex reds the two new zone-less cases; dropping the `$` anchor reds four, including the offset pass-through.
- **CUL-536:** reinstating the real CUL-326 straggler in `app/food-capture.tsx` reds *both halves independently* — a new chooser appears and a known caller disappears. Dropping a directory from `SCAN_DIRS` reds the non-vacuity floor, which is derived from the repository rather than from the constant under test. Neutering `blankComments` reds the comment case. Counting distinct instead of occurrence literals reds the single-literal flip, which is the shape the rule itself is written in.
- **CUL-690:** restoring the static import reds two tests with the literal native-module error propagating out of the load; widening the catch so it always reports unreadable reds the other two — a fix that degenerated into "always unknown" would otherwise pass every absent-module assertion while reporting nothing on a real device.

## Test-file archaeology worth noting

CUL-127's `buildDeletedVetDocumentRow` describe carried a long comment explaining why it sat on UTC literals at a shared time-of-day: that choice pinned the countdown's *difference* while leaving the stem **un-exercised by construction** — it is lexical, so it never moved. The seam was documented in the test as a reason not to test it. A stated limitation reads as a decision, which is also why `parseTs`'s narrow regex survived under a comment naming its own gap. Both are the same failure mode: writing the hole down and then treating the writing as the fix.

## Residuals

- **CUL-959 filed** (new): the three `document_date ?? created_at` sites (`vetDocumentLibrary:159`, `vetDocumentDetail:131`, `vetDocumentCapture:520`) have CUL-127's bug on the fallback arm — `created_at` is `TIMESTAMPTZ`, fed to the lexical formatter. Dormant: `document_date` is nullable at the schema level but no shipped write path produces a null. Not folded in, per the out-of-scope rule; widening a sweep PR on a dormant branch is how a two-line fix acquires a third review. The commit comment on CUL-127 reasoned explicitly about `formatVetDocumentDate`'s *other* callers and stopped there — `?? created_at` sat in the same expression and read as one argument. Reasoning about a function's callers is not the same as reading every argument they pass it.
- **CLAUDE.md C-10 does not name its new guard.** Every other convention there names its enforcement. `guards/claudeMdBudget.test.ts` makes any addition a paid-for trade against a deletion in the same file, which is not a call to improvise inside a sweep. Flagged on CUL-536; worth a one-line swap in a session already trimming the file.
- **CUL-536's third blind spot is stated, not closed:** the caller inventory matches the identifier, so a renaming import escapes it. Dormant — all seven call sites use the name directly — and listed rather than fixed, because a half-done alias resolution reads as coverage it does not have.

## Read and cut, with the reason on the issue

- **CUL-781** (CI `npm ci` in the `edge-functions` job) — cannot be done from a cloud session at all: there is no Deno here, and the experiment *is* the deliverable. Wants a throwaway CI PR or a Codespace. The work is fifteen minutes; the environment is the gate.
- **CUL-766** (arrival-moment VoiceOver inertness) — the issue asks for device verification *before* building, and the change makes a currently-inert region tappable on a safety surface, where getting it wrong is silent rather than visibly broken. Belongs in a session already on a device for the Signal surface.
- **CUL-813** (route-level coverage for the photo-add chain) — a full harness build, past an hour.
- **CUL-510 / CUL-400** were claimed and released by a sibling session (`claude/elegant-bohr-3k4tbg`) about an hour before this one started, both with detailed findings. Left alone. That sibling is also why a single 90-minute base-drift check-in was armed after the push; it fired once, found nothing, and stopped.

## Process note

The claim ritual worked exactly as designed. Two of the twelve candidates carried a live `Claimed` marker naming another branch, posted an hour earlier — so this session skipped them instead of building near-identical work, which is the collision CUL-624 exists to prevent.
