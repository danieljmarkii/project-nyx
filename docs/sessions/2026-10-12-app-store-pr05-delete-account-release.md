# App Store 1.2.0 PR-05: delete-account's re-auth goes live, and the label folder is purged

**Date:** 2026-10-12
**One thing:** D3 L1 — A test proves the part it drives: the fake bucket proves the walk, not what real Storage returns · check: pending

Wave 1, row PR-05 of *App Store 1.2.0 · the first public release*. Shipped via #1205, finishing [CUL-1454](https://linear.app/projectnyx/issue/CUL-1454) and [CUL-1764](https://linear.app/projectnyx/issue/CUL-1764).

## What shipped

- **The `delete-account` hold is lifted** (`supabase/functions/deploy-manifest.json`). The function had been held at v8 since 2026-08-20 (CUL-215), so production deleted an account without re-checking the password, although every client since the 08-29 TestFlight build sends one. The merge deploys the server-side re-check, so App Review exercises the shipped 5.1.1(v) design.
- **Deletion purges the account's whole `{uid}/` folder in `nyx-medication-photos`** (CUL-1764 fix (b), PM ruled 2026-10-12). The medication capture uploads the label before any `medication_items` row exists, so a backed-out capture left a prescription label that deletion, which found label photos only through rows, never reached. A new pure `listPrefixRecursive` in `plan.ts` walks the folder (Storage `list()` is one level deep), paging by rows received until an empty page (C-42). `index.ts` feeds it a Storage lister inside `collectOwnedPaths`, and the listed keys merge with the row paths before the existing `{uid}/` guard. Ordering is unchanged: every purge before the auth delete.
- **Loud failure everywhere the walk could otherwise under-delete.** A list error, a blank or multi-segment root, an unsafe object name, or a tree deeper than 8 levels throws, so the run returns 500 with the account intact and retryable.

## Decided in the build

- **A list error is fatal** (team call, Trust & Safety + Dir. of Eng, logged on CUL-1454): the same posture as the `medication_items` read. A silent degrade would report a clean deletion over a surviving label. Checked first that it cannot block every deletion: the bucket exists in production (private, 3 objects, max depth 3).
- **Rows and the listing both feed the purge.** The rows still cover any legacy path; the listing covers what no row names; `cleanPaths` dedupes.
- **Option (a)** (upload only after confirm) stays out of scope; CUL-231's sweep remains the defense in depth.

## Review

`rls-privacy-reviewer`: PASS, no must-fix. Attacks that held: a user-B token with a body id; `user-1` against `user-12` (storage-api appends `/` to a list prefix, and the `{uid}/` guard drops the rest); a blank or `..` root; a depth-9 tree; a list error; a missing, empty or wrong password. Its should-fix **S-1** held only half: a hand-built `{uid}//x.jpg` lists as an empty name, and skipping it left the object behind under `ok: true`. Fixed in `c0c1567`: the walk throws instead. Production held zero such keys, so the throw blocks no real account. Its follow-up **F-1** (a sign-in rate limit reads as "wrong password", and the comment's per-account bound is likely per IP) is filed as CUL-1891.

One thing went sideways: the reviewer read the working tree while a deliberate mutation was in place (a short-page break before the entries were processed). It flagged that version correctly, and the committed file never held it. Lesson for the next session that mutates while a reviewer runs: the C-4 rule already says to tell the reviewer to `cp -r` first, and the mutating session should do the same.

## Checks

`deno test` on the function: 88 passed. `deno check`, `tsc --noEmit` clean. Full jest: 656 suites, 16,631 passed. Two mutants killed (the short-page break reds 5 tests, skip-instead-of-throw reds the unsafe-name test). CI green on `c0c1567`.

## Residuals

- The I/O merge in `index.ts` (the listed keys reaching `medicationPhotoPaths`) is untested by unit tests: the plan tests drive the pure walk and the plan, not the shell. The device check in CUL-556 (snap a label, back out, delete the account) is what proves it end to end.
- A label upload landing between the listing and the auth delete, or with the still-valid token after it, is an orphan for CUL-231's sweep.
- After merge: the Deploy Edge Functions run must show `delete-account` deployed (version bumped, ACTIVE, `verify_jwt` on, boot smoke clean).
