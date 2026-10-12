# CUL-1877: getculprit.app deploys only from main

**Date:** 2026-10-12
**One thing:** G2 L1 — A branch is a label, and a deploy follows whichever labels the host watches: Cloudflare watched every one, now only `main`'s · check: pending

Shipped via #1199 (the CLAUDE.md line). The real work was in two dashboards, done by the PM; this session checked it from screenshots.

## What happened

The PM made the CUL-1877 changes and asked for a sanity check from iPad screenshots.

- **GitHub:** `culprit-web`'s default branch was already `main`. Pass.
- **Cloudflare, first pass: not safe yet.** Production branch was `main`, but "Builds for non-production branches" was on and the Version command (what non-production branches run) was `npx wrangler deploy`, which publishes live. Any `claude/*` push would still have replaced getculprit.app. Recommended `npx wrangler versions upload` or turning those builds off.
- **Cloudflare, second pass: safe.** The PM set up Worker Previews instead. Production tab: `main`, `npx wrangler deploy`. Previews Base tab: "Builds for Preview branches" off, preview command `npx wrangler preview`. No branch but `main` builds.

## Decisions

- **The live test push (issue step 3) was skipped, PM ruling.** The session's Auto mode refused `add_repo` with push for `culprit-web`, and I did not route around it. The PM judged the toggle evidence enough. Backstop: PR-01 (CUL-1460)'s first branch push is the test; a comment on CUL-1460 says to confirm the live pages are unchanged.
- **Step 4 (delete old `claude/*` branches) waits for PR-01.** `claude/terms-privacy-policy-updates-9gz1gn` holds the only copy of the live July 19 privacy and terms text.
- **CLAUDE.md:** the Two repos hold ("push nothing" while CUL-1877 is open) became "Only its `main` deploys the site; other branches never build (CUL-1877)." Two bytes over the ratchet on the first wording; shortened, both ratchets pass.

## Slip

The first PR body named CUL-1460, which would have closed it on merge. Edited out within a minute; read back as `Todo`, nothing attached.
