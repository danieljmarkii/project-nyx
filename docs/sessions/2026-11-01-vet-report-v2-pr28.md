# Vet report v2 PR-28: the "New report layout" switch

**Date:** 2026-11-01
**One thing:** S3 L1 — Two gates on one switch: the server decides who may, the owner decides who wants, and the server asks again · check: pending

Shipped via #1391. Finishes CUL-2347.

## What shipped

The Early access page gains a second report card, "New report layout", off until the owner turns it on. When an account is on the `report_document_v2` allowlist and the owner has turned the card on, the app's report request carries `reportVersion: 'v2'`; every other request is today's body exactly, with no new key. The server already re-checks the flag against the signed-in account before it draws v2 (PR-10). The allowlist stays empty: the v2 document reaches no owner until its go-live gates pass. The PR body is the full record.

## Teach

### One thing — Two gates on one switch (S3, L1)
A config flag is a row on the server that changes what the app does without a new release. Today's switch has two locks. The first is the server's list of accounts allowed to see the new report layout. The second is the owner's own choice on the Early access page, stored only on their phone. The phone asks for the new layout only when both are open, and the server, which never trusts the phone's word, checks its list again before it draws anything.

**Like:** a members-only gym class. The front desk keeps the member list (the allowlist), you still have to sign up for the class yourself (the switch), and the instructor checks the list at the door anyway, so a forged sign-up sheet gets nobody in.

**In today's work:** `lib/pdf.ts:171`
`return eligible && optedIn ? 'v2' : null;`
`eligible` is the server's list, read on the phone; `optedIn` is the owner's switch. Both must be true, or the request asks for nothing new. Changing `&&` (and) to `||` (or) turned four tests red, which is how we know the tests watch this line.

**Why it matters to you as PM:** going live with v2 is one row edit (adding accounts to the allowlist), not a release, so the gates that guard v2's content (CUL-2370's blockers) are the only thing standing between a merged PR and an owner's vet.

**Check:** You add your own account to the `report_document_v2` allowlist but never touch the switch on your phone. You open a vet report. Which layout do you get, and what would you have to do to see the other one?
