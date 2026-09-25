# History v2 step 1, HV-5: the read on the phone, and one predicate for every surface

**Date:** 2026-09-25

Shipped via #912 (fixes CUL-1162). Filed: CUL-1188, CUL-1197, CUL-1198, CUL-1200, CUL-1201, CUL-1202, CUL-1203, CUL-1204, CUL-1205, CUL-1206. Handoffs posted on CUL-1158 (HV-1), CUL-1163 (HV-6), CUL-552 and CUL-66.

## The ask

HV-5 of History v2, one session and one PR, run beside HV-1 to HV-4. "Worth a call" (the rose) vanished whenever the phone was offline, because Home's spine, the Patterns month and the Signal screen each fetched the per-incident read's verdict from the server every time they drew it; and they disagreed with each other, because Home dropped the verdict when the owner hid the read while the month and the Signal screen ignored the hide. The issue asked for a local copy of the verdict (four columns, never the words, never the hide stamp), one `readStateOf` every surface reads through, a guard, and the registrations the local-table and haptics rules owe. `components/` and the record screen's analysis sections were off limits. Plan posted; the PM ruled four points and said go.

## What changed

**The first commit (a8a958c).**

- **The copy** (`event_ai_verdicts`, `BASE_SCHEMA_SQL`): event id, status, verdict, server change time. No local FK, no `synced` column; in `LOCAL_WIPE_TABLES` ahead of `events`.
- **`lib/readCopy.ts`**, the only reader and the only writer. One upsert decides last write wins in SQL on parsed instants (`julianday`, C-40), because the landing write runs outside `syncNow`'s single flight. Three callers of that one writer: the hydrate step, both analysis triggers (which save the landed read BEFORE they settle their chain claim, because Home rereads on the settle), and the realtime watch (before each check).
- **`lib/readState.ts`**: `readStateOf` / `readVerdictOf` → `worth_a_call`, `pending`, `calm`, `none`, `off`, `unread`, in that precedence. The rose wins at any status (CUL-812) and for any verdict the app does not recognise; a read in flight outranks a calm verdict; calm needs a finished read; Hide is not an input.
- **Readers rewired** with their signatures kept (HV-1 calls them): `readAnalysisRows`, `nodeReadOf` (gains `unread`, stops dropping the verdict on Hide), the month's `readWorthACall`, the Signal screen's `readVerdicts`. None of them imports the server client any more.
- **`guards/readState.test.ts`**, `ALWAYS_SCANNED` for `lib/readState.ts`, `WRITE_PATH` for `lib/readCopy.ts`; the chain registry moved verbatim to an import-free `lib/analysisChain.ts`.

**The review round (24b7723)**, after the three mandated reviews came back FAIL / FAIL / BUG:

- **R1 (privacy): two sessions must agree.** `refreshReadCopy` now also requires the app's session, naming the same account as auth-js, before it takes the sign-out epoch. In the §6.4 password-recovery swap auth-js still holds the previous account's session after the wipe, so a fire-and-forget chain settling there wrote that account's verdict into the cleared copy.
- **The pull is one keyset stream** (the code review's BUG, the adversarial pass's F5). It paged by offset on `event_id`: a row passed and then re-read during a suspension kept its old verdict forever once a later row carried the watermark past it, and a delete behind the offset skipped a live row while a new row made the count look whole. It now pages on `(updated_at, event_id)` with one PostgREST `or` cursor, the cursor's instant passed back as the server's raw string, and a progress guard; every row a pull misses sorts after its cursor, which is where the next pull starts.
- **Home hears every chain** (F1). Home sampled the chain registry once per read, so a chain claimed afterwards (a photo replaced on the record, Try again) left calm words over a photo nothing had read, and left them after the copy held the rose. Every claim is now announced (`onAnalysisChainClaimed`; the registry still imports nothing), and `lib/analysis.ts` turns the announcement into the `hydrationTick` Home already rereads on; the watch does the same when its save changed the copy.
- **The Signal tile reads its whole bout** (F3): the rose on any row of the bout is the tile's; nothing calmer crosses rows.
- **H1, H2:** a test for the stale check before the watermark write; the blind-spot sentence corrected (the owner's own session could delete an analysis row under the `FOR ALL` policy, though no shipped path does).
- **Merged `main`** after HV-2 (#910) and Bundle C (#908): two conflicts, a header comment and an import block, as the issue forecast.

**The second review round (a190229)**, after the adversarial pass came back FAIL on two narrow residuals and the privacy pass PASS with one required test:

- **A landing no chain will settle tells Home.** A trigger that held no claim (Re-run or Try again tapped while another read ran) saved its landing after the chain it waited on had settled, and nothing told Home. The triggers now land through `landChain`, which ticks when the copy moved, the trigger holds no claim and no chain is outstanding. The reviewer's simpler shape (tick on every unclaimed landing) would tick twice on every photographed log, whose trigger runs inside the log path's chain.
- **A pull that outran its budget holds its watermark.** Even a keyset misses a row whose transaction began just before the cursor passed its place and committed just after (`updated_at` is the transaction's start); the overlap brings it back only if the pull did not run longer than the overlap allows. A pull longer than `READ_COPY_PULL_BUDGET_MS` (half the overlap, wall clock, a backwards clock counting as over) writes what it has and holds the watermark.
- **The sign-out epoch is checked before every page**, so a stopped account's cursor never goes out under the next session.
- **The gate's order is pinned:** `refreshReadCopy` reads the app's session after auth-js answers; hoisting it reopened R1 with every other test green.
- **Merged `main` twice more:** HV-1 (#907) put a test on the new shared row that built analysis rows in the old server shape, a semantic conflict fixed in the merge (the fixtures now spell the copy's four columns), and the read guard now names HV-1's row files and the History v2 screen; HV-3 (#909) touched nothing here.

## Decisions

- **The PM's four rulings on the plan:** the chain and the watch write the landed read as well as the sync (one writer, three callers); Home's spine loses the read's sentence (the copy never holds words); `unread` draws as an empty grey read slot until HV-6 draws *Photo not read*; a read in flight outranks a calm verdict.
- **R1 took the reviewer's option (a)**, the app-session gate, over (b), capturing the epoch where the work starts: it is the one the reviewer proved against the probe, and it also covers a chain started inside the swap window. `lib/sync.ts` gained its first store import (the auth store imports nothing from `lib/`).
- **One ordered stream, not two passes.** A two-pass keyset (drain the tie, then the later instants) is simpler to read and wrong: a tie pass that stopped early hands the later pass a cursor past rows it never read, and those rows sort behind the watermark.
- **`hydrationTick` is the channel to Home** because `components/` was HV-1's. Every consumer of the tick rereads local rows it holds; a MedStrip confirm and a meal rating already bump it for the same reason.
- **Not in this PR:** an account-scoped watermark key for the copy. The §6.4 race it would soften is systemic across every hydrate step, so the fix is systemic (CUL-1202), not one table's.
- **The landing tick is scoped to "no chain left to settle"**, not to "no claim held": the narrower rule keeps the common log path at one tick, which matters because every tick drops Home's Signal lead card to its skeleton (CUL-1206).

## Verification

- Every fix proven by mutation, each reverted after: the R1 gate removed (2 red); the old offset pager run against the new pull tests (the delete-and-insert and the suspension cases red, among 8); a cursor on the instant alone (the tie case red, 4 of 8 rows); the stale check before the watermark removed (red); the progress guard removed (the test never ends); the claim announcement removed (2 red in `lib/analysis.test.ts`, and the Home screen's end-to-end case red); the watch's tell removed, or made unconditional (red either way); four mutations of the Signal tile's fold and the bout ids (each red).
- The Home screen test (`app/(tabs)/index.designV2.test.tsx`) now runs the real registry, the real announcement and the real sync store: a chain claimed after Home drew a calm row shows the read as pending, then the rose once the copy holds it, with the server stubbed to throw.
- Second round, each mutation reverted after: the budget removed (3 red), a negative span allowed (1), the boundary made strict (1), the stale check between pages removed (1), the gate's read hoisted above the await (1), the landing tick removed (red in `lib/analysis.test.ts` and on the Home screen's end-to-end case, the reviewer's reproduction with its last assertions turned around), made unconditional (1) or made the reviewer's shape (1).
- Jest green after merging HV-1 and HV-3: 480 suites, 10,507 passed; `tsc` clean; the touched suites green under Kiritimati, Chatham and Honolulu; CI green on `a8a958c`, `3b3d520` and `0e6a7bf`, and red on `bd8b46b`, which met HV-1's old-shape fixtures and was fixed in the next merge.
- Read-only against the live database: the policy, grants and triggers on `event_ai_analysis` (for CUL-1203). The adversarial reviewer also sent the exact keyset filter to the production REST endpoint anonymously (RLS returns no rows): 200 with `[]`, and 400 / Postgres 22007 for a malformed timestamp, so the `+00:00` microsecond cursor reaches Postgres as a timestamp.

## Reviews

- **`rls-privacy-reviewer`, first pass: FAIL** on R1 (fixed as above). Held: column minimisation (three mutants red), sign-out mid-pull and mid-save, an A→B switch with A's chain in flight (RLS hides A's row), cross-pet readers, no new server read. Pre-existing and filed: the §6.4 hydrate race (CUL-1202), planting a row in `event_ai_analysis` (CUL-1203, confirmed live: one `FOR ALL` policy, no `WITH CHECK`, `INSERT` granted), backups in the disclosure copy (comment on CUL-552).
- **`adversarial-reviewer`, first pass: FAIL.** The predicate held on an exhaustive status × verdict × in-flight × photo grid. Fixed: F1, F3, F5. Filed: F2 (CUL-1197), F4 and F6 (CUL-1198), F7 (CUL-1200, a PM ruling), F8 and F9 (CUL-1201), F10 (CUL-1204); `uncertain` and the *Photo not read* wording went to HV-6 (CUL-1163).
- **`code-reviewer`: BUG** on the pager (fixed as above), otherwise ship-ready; its stale-comment note on `TodayCard.tsx` went to HV-1 (CUL-1158).
- **Second pass, adversarial: FAIL on two narrow residuals, neither a regression** (fixed above). Held: ties wider than a page at microsecond precision with a spurious empty page mid-tie; uncounted rows satisfying the count before an early stop (the missed rows stay ahead of the watermark); a row changed twice in one pull; the cursor through React Native's URL encoding and live PostgREST; a claim Home never sampled; every bout shape on the Signal tile, and `boutMembers` against the collapse over 2,000 random sets; the §6.4 swap in both orders.
- **Second pass, privacy: PASS.** R1 closed against the real `refreshReadCopy` and recovery handler; the `or` cursor cannot carry `,()` and runs under the caller's JWT; the claim tick reaches only consumers that read local rows. Required and added: the ordering test. Nit fixed: the stale check between pages. Outside the diff and filed: **CUL-1205 (Urgent)**, the recovery exchange emits `PASSWORD_RECOVERY` in auth-js 2.105.4 while the app adopts only `SIGNED_IN`, so a same-phone reset likely never completes (verified in `node_modules`, not yet on a device), with its two neighbours O2 and O3.

## Residuals and follow-ups

- **CUL-1197** (High): Home's read gate follows the symptom tint, so a photographed `stool_normal` never shows its rose.
- **CUL-1198**: a failed local read, a landed read that failed to copy, and a Signal screen left open can each blink a rose out (never to calm).
- **CUL-1200** (Waiting on PM): should an escalation with no photo reach the month and the Signal gallery?
- **CUL-1201** (clinical): a read carries no photo identity, and a successful re-read can downgrade an escalation.
- **CUL-1202** (High, privacy): the §6.4 swap can re-hydrate the previous account into a wiped phone.
- **CUL-1203** (High, privacy): an analysis row can be planted on another account's event.
- **CUL-1204**: offline, the record screen's analysis sections still read only the server.
- **CUL-1188** (updated, now Medium): the shared hydration pager has the short-page, the suspension and the commit-skew shapes; the copy's keyset tests and its time budget transfer.
- **CUL-1205** (Urgent, App Store M2): password reset likely fails on the golden path; run one reset on a phone first (noted on CUL-66).
- **CUL-1206** (Low): the Signal lead card drops to its skeleton on every `hydrationTick`, which now includes each photo read starting.
- A lessons addendum under C-42 (`docs/engineering-lessons.md`) records the client-side keyset and the one row it still misses.
