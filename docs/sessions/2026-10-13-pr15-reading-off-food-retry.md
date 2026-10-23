# App Store 1.2.0 PR-15: History says "photo reading is off" once; a declined owner's food retry never strands

**Date:** 2026-10-13
**One thing:** G1 L1 — A commit is a saved snapshot, and pushing is a separate copy (today's first commit existed only in this container until the hook let a push through) · check: pending

Row PR-15 of *App Store 1.2.0 · the first public release* (Wave 2, AI consent), CUL-1174 and CUL-769's retry half. Shipped via #1211. Dispatched, plan-gated (a deletion path); the PM typed the go in the session.

## What shipped

- **The food retry** (`app/food/[id].tsx`, `lib/foodRetry.ts`): the retry no longer writes `'pending'` to the server. It reads the gate's typed answer, re-reads the row after every call, and tells the owner what happened (cap, AI reading off, unavailable, try again). A confirmed food can no longer be stranded at `'pending'`, where it lost its Ingredients field and its retry, and sat one guard away from the reaper.
- **Photo reading off on the rows** (`hooks/usePhotoReadingOff.ts`, through `lib/dayNodes.ts` → `lib/spineNode.ts` → `lib/readState.ts`): a recorded no unmarks unread photo rows on Home and History. The type sheet says *photo reading is off* once, and the rose and the tick stand.

## How review moved it

- **The Home write guard went red** on the first build. Home's rows read the consent cache, and the module holding the cache also holds the consent writer, which the guard counts through every import. Registering the writer as "not a record write" would have quietly cleared Home to write consent one day. So the state and the row type moved into writer-free modules, and the one consent read moved to the tabs layout.
- **The adversarial pass broke it twice, both QUIET.** First, a read that failed or came back unclear before the owner's no lost its grey mark, while its record still said so. `off` now applies only where no read ran, and the PM's ruling on that is filed in Backlog. Second, a no cached on this phone hid marks after a yes on another phone. The consent is now re-read whenever the app returns to the front.
- **The privacy pass held.** Its one open point, food detail's retry sending photos with no consent check on the phone, predates this PR. It is already filed, and it must close before PR-17 lifts the server holds (noted on that issue).

## Teach

### One thing — A commit is a saved snapshot; pushing is a separate copy (G1, L1)
When the code changes, git saves a snapshot of every file with a short note: that is a commit. It lives first on the computer that made it. Sending it to GitHub is a separate step, the push, and until the push lands, GitHub, CI and your phone know nothing about it.

**Like:** saving a document to your laptop versus uploading it to a shared drive. The save is real, but nobody else can open it until the upload finishes.

**In today's work:** the first commit, `53fc486`
```
git commit …            → saved: the snapshot now exists in this cloud container
git push …              → "Push blocked: test failures above"  (a check that runs before every push)
```
For about an hour the fix existed as a real, saved commit, but only inside this session's container. The pre-push check had refused to copy it to GitHub, because Home's write guard was red.

**Why it matters to you as PM:** "it's committed" is not "it's shipped": a session can say it saved its work while GitHub, the PR and CI still show nothing, and the push is the moment it becomes visible to anyone else.

**Check:** If this cloud session had been shut down right after that blocked push, what would have happened to commit `53fc486`, and why?
