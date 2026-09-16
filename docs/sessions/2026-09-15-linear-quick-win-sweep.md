# Quick Win sweep — the feedback redirect, the photo-failure stage, the vet-doc date fallback, four vet-visit gaps

**Date:** 2026-09-15 · **Issues:** CUL-250, CUL-193, CUL-959, CUL-953 · shipped via #855
**Also touched (no code):** CUL-434, CUL-766 — read, cut for cause, commented

---

## What this was

A `Quick Win` label sweep. Fourteen candidates read in full — description bodies, not
titles, because on this label the decision is regularly past the first paragraph —
four built, one commit each on one branch.

The exclusions applied before reading: anything on `Waiting on PM` (CUL-425, CUL-586);
anything whose fix lives inside an Edge Function, which on 2026-09-15 is *every* function
(the whole `deploy-manifest.json` is `pending` or `hold`, so CUL-239, CUL-246, CUL-295,
CUL-538 and the `analyze-*` items are all gated); anything RLS / Storage / deletion
(CUL-597, CUL-244, CUL-283, CUL-826); anything device-only.

Two candidates had already been cut by the 2026-09-13 sweep with released-claim comments
(CUL-400, CUL-510) and were skipped on that record rather than re-derived — which is the
comment convention working.

## What shipped

**CUL-250 — the feedback composer names the channel that does reply.** The
support-vs-feedback split was legible on the Settings rows and nowhere inside the
composer. One line in the intro block, beside the existing reply expectation and before
the note is written. It *names* the route rather than opening a second mailto:
`app/settings.tsx` owns the support builder, and a copy of it in the composer is the
two-implementations shape.

**CUL-193 — a failed pet-photo save says which stage failed, and with what code.** The
catch spans compress / upload / link and logged `photo upload failed` for all three,
including the case where the upload succeeded and only the `pets` row update did not.
Now names the stage, with `failureCode()` (new `lib/uploadDiagnostics.ts`) putting a short
provider code beside the raw error.

**CUL-959 — the vet-document date fallback reads the owner's day.** Three labels took
`document_date ?? created_at` without adapting the instant. `localDayStemOf` lifted beside
the formatter it adapts for, exported, and applied to the fallback arm on all three.

**CUL-953 — four vet-visit finish-pass gaps** (item 3 is CUL-966's). The edit screen's
false report-window claim, gated on the now-shared `visitAnchorsAnything`; the booking
sheet's withheld Home line, returned; the silent "Also for" success, named; the intake
row's implementation-language label, made plain.

## The three things worth keeping

**1. A fix can reintroduce its own bug one layer down.** CUL-959 is about a formatter
reading an instant lexically and getting the UTC day. Routing the fallback through
`localDayIndexOf` fixes that — and walks into `Date.parse`, which reads a zone-less
space-separated stamp as **local**. `lib/localSchema.ts:255` defaults the local
`vet_documents.created_at` to exactly that shape (`datetime('now')`, UTC, unmarked), so
the fix as specified would have been wrong in a *new* direction for precisely the rows the
fallback exists to serve. C-40 is the neighbouring rule and did not quite cover it: that
one is about *comparing* two spellings, this is about *parsing* one of them.

The generalisable form: **when you move a value from one reader to another, the new
reader's parse is part of the change.** Ask what the new path does with every shape the
old path tolerated.

**2. Two existing tests were green because the code was wrong in the same direction.**
`buildVetLibraryRow`'s and `buildVetDocumentDetail`'s "falls back to the capture date"
cases used UTC-literal `created_at` fixtures. They passed for as long as the code read
the UTC day and went red at UTC+14 the moment it read the local one. This is B-514 / C-29
on a column nobody had applied it to, and the tell is worth naming: **a test that starts
failing when you fix a bug may have been asserting the bug.** Check the fixture before
assuming the fix is wrong.

**3. A rule and its wiring are two claims, and mutation is what separates them.** Every
new test here was proven by mutation, and three mutants survived the first pass:

- **CUL-953** — un-gating the edit screen's false note left *everything* green. The
  predicate had six exhaustive cases; nothing rendered the component. Item 1 is the one
  that was telling owners something untrue, so this was the gap that mattered. New
  `VisitEditBody` suite closes it.
- **CUL-193** — two of three survived, both fixture gaps. A precedence fixture carrying
  only `code` cannot tell precedence from coincidence; a blank-code fixture holding both
  blanks on one object never reaches the second, because the first short-circuits the
  field scan. The C-35 shape: **a fixture that cannot reach the branch it names is green
  over nothing.**
- **CUL-959** — one survived and is a genuine no-op: `localDayStemOf` is the identity on
  a well-formed `YYYY-MM-DD`, so wrapping both `??` arms behaves the same. The issue
  asserted otherwise, the source comment asserted otherwise, and both now say what is
  actually proven. **A survived mutant is a question, not a verdict** — this one's answer
  was "your comment is overclaiming", which is still a finding.

## The review found the one real bug, and I had found it a minute earlier

Worth recording because the convergence is the interesting part. Re-reading the new
`readVisitConsequence` effect adversarially before the review came back, I noticed
the `.catch` retained the previous answer — and the previous answer is about a
**different date**, so a failed read after the owner moves the picker leaves the note
claiming a window move for a date it is wrong about. Item 1's defect, re-entering
through the error path.

The `code-reviewer` returned the same finding independently, **with a better fix**:
reset `anchors` to `null` *before* the read rather than in the catch. That closes the
transient window too (the note showing the previous date's answer while the new read
is in flight), and it means the error path needs no rule of its own — so there is no
second place for the two to disagree. Took the reviewer's version; my catch-only
clear is gone.

Everything else came back clean, including the two things most likely to be wrong:
`asUtcInstant`'s regex traced against both shapes the database actually emits, and
the confirmation that `deleted_at` is always written client-side as `toISOString()`
so `daysLeftToRestore`'s unnormalised call is correctly exempt rather than a missed
fourth site.

**And the screen test I wrote for it was green over nothing three times.** The first
version failed the read on FIRST load, where there is no previous answer to retain,
so deleting the clear-on-error left it green; asserted the read's date argument
without moving the picker, where the candidate and stored dates are equal and both
implementations agree; and checked for the note on the first frame, which is the
spinner. Three mutants, three survivors, all the same root cause — **the fixtures
could not reach the states their names claimed.** Rewritten to drive the real picker
and to defer the read; all three now red. This is C-35 arriving twice in one session,
which is why it is written down twice.

## Calls taken

- **CUL-193's "too large" copy branch was NOT built.** 047 caps the bucket at 10 MiB with
  a MIME allowlist, but every byte reaching it has been through `compressForUpload` —
  re-encoded to JPEG at a 1600px longest edge — and `uploadPhoto` declares `image/jpeg`
  itself. 413 and 415 are states the pipeline cannot produce. The reasoning sits next to
  the alert for whoever relaxes the compression.
- **CUL-953 item 1 reads the CANDIDATE date, not the stored one.** The issue's "the screen
  already has the visit" glosses that the component had no `isLatest` and could not derive
  one. Gating on the row as stored would go silent for the one edit that genuinely moves
  the window — a March visit dragged past April's.
- **`visitAnchorsAnything` was extracted rather than copied.** The editor makes the same
  claim one step before the write; two copies of a consequence rule, one beside an editor,
  is how they drift.

## Cut for cause

- **CUL-434** — mislabelled. The fix starts with a new column on a local SQLite table,
  which drags `COLUMN_UPGRADES` discipline, the food-cache write path, and a render
  decision behind it. Commented with the sizing and a possible split.
- **CUL-766** — sound issue, device-gated verification. The defect cannot be *confirmed*
  without VoiceOver on a phone, and option 1 is a motion change on the Signal's shared
  arrival choreography. Commented; worth pairing with the next device pass.

Both stayed unclaimed — nothing touched, nothing pushed.

**The PM then dropped the `Quick Win` label off both** (2026-09-16), which is the
half a comment alone does not do: an issue that keeps the label keeps getting read
and re-cut by the next sweep, at the cost of the read each time. Relabelling was
left to the PM deliberately — it is a backlog-grooming call, not a build one — and
the ruling is recorded on each issue so the suggestion above reads as settled.

## Verification

`tsc --noEmit` clean. Full suite green: 8378 tests / 387 suites, and again under
`TZ=Pacific/Kiritimati` (UTC+14), `Pacific/Chatham` (+12:45) and `Pacific/Honolulu` (−10).
All three CI checks green on #855's first head, including `App (jest, non-UTC timezones)`
— the one that actually holds CUL-959, since a UTC runner cannot fail those tests by
construction. The review fix and its screen suite went up as a fifth commit.

No schema changes. No Edge Function changes, so no deploy is owed.
