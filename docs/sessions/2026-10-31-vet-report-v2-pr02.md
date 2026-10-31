# Vet report v2 PR-02: the record's silence measured to the report date

**Date:** 2026-10-31
**One thing:** T6 L1 — The report reads more than it shows: the window decides what is drawn, not what is read · check: pending

Shipped via #1366. Finishes CUL-2283 and CUL-2125.

## What shipped

A hand-picked report window that ends before the report date used to hide the days after it: Mira's Jun 1 to 19 window, made Jul 2, read 19 of 19 days logged and the 13 silent days of a cat refusing food were nowhere on the page. Every report now prints its last entry of any kind and how many days before the report it was, and a window that ends early says what came after it in one of three sentences (nothing; entries but no symptom entries, which are not read; symptom entries, counted). A one-day unlogged tail is named on such a window too (CUL-2125). The PR body is the full record.

## Teach

### One thing — The report reads more than it shows (T6, L1)
When the server builds a vet report it reads a stretch of the record wider than the dates printed at the top: months before the window, and everything after it up to today. The window only decides which of those rows get counted and drawn. The bug fixed today was a question asked of the wrong set: "how long since anything was logged?" was answered from the drawn rows, which stop at the window's last day, instead of the read rows, which run to the report date.

**Like:** a photographer crops a picture of a street. The crop decides what is in the print, but the photographer still saw the car parked just outside the frame, and should mention it if it matters.

**In today's work:** `supabase/functions/generate-report/report.ts:6331`
`recordEdge: recordEdgeOf(dedupedAll, endDayNum, input.now, tz),`
`dedupedAll` is every row the server read, not `windowEvents`, the cropped set one screen up. Passing the cropped set here is exactly the mutation the tests were run against, and three of them went red.

**Why it matters to you as PM:** when a report sentence says "the last N days" or "nothing after X", the first question to ask is whether it was measured over the window or over the record, because the two disagree exactly when an owner picks dates.

**Check:** An owner makes a report for May 1 to May 31 on June 20, and logged two vomits on June 10. Before today's change, would the "N of 31 days logged" line have shown anything about June 10, and what on the page now does?
