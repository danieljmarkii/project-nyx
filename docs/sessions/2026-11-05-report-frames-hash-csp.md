# Report frames: the merged lock's privacy pass, then only our own scripts run

**Date:** 2026-11-05
**One thing:** D3 L1 — A test proves only what it can fail on: the hash-before-rename mutant survived until a case gave it something to break · check: pending

Session `claude/vet-report-v2-adhoc-11051727c`. It was launched by `/dispatch` as a review-only row ([CUL-2534](https://linear.app/projectnyx/issue/CUL-2534)), then the PM turned it into a build in session. Shipped via #1451.

## The review (CUL-2534)

One `rls-privacy-reviewer` pass over main at `579ef2a` covered `lib/reportPreviewV2.ts`, `lib/examRoom.ts` (`withFrameLock`, the lock script), every frame spreading `REPORT_FRAME_PROPS`, plus v1 and the vet PDF viewer as a class check. Verdict: **HOLDS WITH RESIDUALS**. The declarative-shadow-root fix from #1438 (290f692) held against every variant, `Document.parseHTMLUnsafe` included. So did script-inserted preconnect, the `data:` refresh, popups, WebRTC, the CSP and the Android flags.

Two paths could not be settled statically: a `javascript:` page swap and an empty script re-typed into speculation rules. Both were filed as [CUL-2561](https://linear.app/projectnyx/issue/CUL-2561) (Live harm, Gate: privacy, dark). The one live finding, v1's `data:` path, was fixed on main by #1442 while the pass ran. The reviewer's first report reached this session truncated; its corrected resend replaced an early summary that had wrongly flagged the PDF viewer. The PM deferred device checks 4 to 7.

## The build (CUL-2531, closing CUL-2561)

The PM asked to close CUL-2561 in code with CUL-2531. Every v2 frame's CSP now lists SHA-256 hashes of the scripts the document legitimately carries instead of `script-src 'unsafe-inline'`:

- the frame lock;
- the room's script, matched byte for byte;
- the renderer's layout script, read backwards from the document's literal `</body></html>` end, from its own open tag.

The app computes the hashes at render with a small SHA-256 kept inside the import-free `lib/examRoom.ts`. So there is no server change, and the PR stays clear of #1446's renderer edits. A document whose scripts can't be accounted for keeps the inline policy (the louder side), because a blocked layout script would drop the pinned warning.

**Chromium (Playwright):**
- On main, an injected script and an `onerror` handler ran, `location = "javascript:…"` replaced the document, and an outbound request was attempted.
- On the branch, all of that is blocked and our three scripts run.

**Two privacy passes, the cap:**
- **Pass 1 (HOLDS WITH RESIDUALS)** found the tail pattern took the *first* `<script>` spelling (F1: attacker text hashed; F2: a spelling in a title or textarea blocked the layout script, dropping the warning) and raw CR/NUL hashing (F3). All three were fixed.
- **Pass 2 (HOLDS WITH RESIDUALS)** found R1: an injected copy of the room's open tag forced the inline fallback. That is main-equivalent and loses no warning, and it was fixed by reading the tail backwards.

Every guard was proven by mutation. One mutant (hashing before the rename) survived the first test set until a script holding a refused tag's spelling was added.

**Residual:** unclosed injected markup swallows the layout script under any policy, main's included. It is noted on [CUL-2562](https://linear.app/projectnyx/issue/CUL-2562), which this PR largely answers but deliberately does not name. WebKit is unverified and joins CUL-2534's device list.
