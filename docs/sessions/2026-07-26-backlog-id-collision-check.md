# B-435 — make duplicate backlog IDs fail loudly, and clear the live collisions

**Date:** 2026-07-26 — shipped via #473

## What shipped

Option **(a)** from B-435: a duplicate-ID check in `/wrap` Step 4 (the backlog-reconciliation step), plus the resolution procedure that has to come with it. Mirrored into the `backlog-groomer` skill's de-duplicate step — the other path that edits IDs.

```bash
grep -ohE '^\| B-[0-9]+ ' docs/backlog.md | sort | uniq -d
```

Any output is a stop-and-fix before commit, explicitly *not* downgradable to "noted for a grooming pass" — that is the exact note four collisions sat under on `main` for a day before a fifth landed on top of them.

The check alone would have been half the job. The instruction also carries:

- **A resolution rule**, so no future session re-derives it under pressure: *the row that landed on `main` first keeps the ID; the later arrival renumbers.*
- **Attribution, not blind replace.** A bare `B-NNN` may belong to either row, so every hit gets read and only the ones meaning the moved row change. `sed -i` across the repo would have been wrong in most of the hits this session touched.
- **Inline provenance** on the moved row, so a `grep` from an older session record still lands somewhere true.
- **Run it after merging `main`, not before** — added at the end of the session, for the reason in "What broke" below.

## What was actually wrong

The kickoff named one collision (B-432). The check found **five**: B-432, B-441, B-442, B-443 — the four `STATUS.md` had already recorded as "noted not fixed, worth a grooming pass" — plus **B-477**, which landed the next day on top of them. That note is the whole argument for the check: the collisions were *known*, written down, and still growing, because nothing forced the fix at a moment when someone was already in the file.

Renumbered, later-arrival-yields, order established per row with `git log -S` rather than assumed:

| Filed as | Final | Row that moved |
|---|---|---|
| B-432 | **B-487** | Re-home the 4 orphaned CLAUDE.md rulings |
| B-441 | **B-488** | Stale `ai_extraction_confidence` completeness claim |
| B-442 | **B-489** | Vet report negative-correlation denominator |
| B-443 | **B-490** | Vet report 90-rated-meals em-dash |
| B-477 | **B-491** | Simple/symptom + weight double-submit hole |

**First-lands-keeps turned out to be empirically right, not merely tidy.** In all five pairs the earlier row is the one shipped code already points at — `app/(tabs)/profile.tsx`, `lib/analytics.ts`, `lib/dietTrialDayMath.guard.test.ts`, and four cases in `supabase/functions/ask/tools.test.ts`. So the whole cleanup touched **no code file**, and no test or comment reference was invalidated. Had the rule gone the other way, every one of those would have needed editing.

## What broke, and how

**The rule bit its own author, inside the same session.** After renumbering into B-481–B-485 and pushing, the wrap merged `main` — and a sibling build-35 QA session had taken B-481–B-485, the exact block this session had just moved into. Five collisions became ten. All five rows moved again, to B-487–B-491, with first-lands-keeps applied against ourselves (their rows were on `main`; ours were not).

Two things are worth keeping from that:

1. **Git will not surface this.** The sibling's rows and ours were appended at different offsets, so the merge was clean — zero conflicts — and the duplicates existed only in the merged result. A check that runs before the merge is worthless. `/wrap` now says so explicitly.
2. **An earlier check of mine was blind to it.** Before merging I compared the ID sets with `comm -13 <(HEAD) <(main)` to see "what IDs did `main` add" — which by construction cannot show an ID present in *both*, i.e. exactly a collision. The `uniq -d` check on the merged file is the one that caught it. Set-difference answers a different question than duplicate-detection, and only the latter is the invariant.

The sibling's own session record shows they hit the same race today (B-451–B-480 was full, so they renumbered into B-481–B-485). That is **three independent occurrences on 2026-07-26**, on top of the three B-435 recorded for 2026-07-25.

## Decisions

- **Option (b) — per-session ID blocks — deliberately not taken.** The failure was that the race was *silent*, not that it happened. The check makes it loud; a reservation scheme adds standing coordination cost for something that now costs one renumber. If the cadence keeps rising, (b) is still on the table in B-435's row.
- **`docs/sessions/` was not rewritten.** It is append-only (`/wrap` 3a), so older records still say "filed B-441". The inline provenance note on each moved row is what carries the old ID forward instead — a `grep` for the old ID finds the note.

## Residuals

- **B-486** (filed, `Later`) — **134 rows carrying `Open` status sit inside the `## Done` table**, because new rows have long been appended to the end of the file. Section membership therefore carries no information and `Status` is the only truth. This is a *contributing cause* of the ID race: two sessions appending to two different regions of one file never conflict, so nothing forces a re-read. Not fixed here — it is a wide diff on the file every parallel session touches, and the companion assertion (no `Open` row below `## Done`) would fail on all 134 rows on its first run. Folded one adjacent defect into the same row rather than minting a second ID: **10 rows carry a raw unescaped pipe** inside a cell, which drops their trailing columns — `Status` included — in a strict renderer. That count is unchanged from `main`; the new rows here are all well-formed.
- The `/wrap` check is a documented instruction, not an enforced gate. It runs when a session runs `/wrap`. Making it a CI assertion is the obvious hardening step and is cheap — but it belongs with B-486's cleanup, since the natural companion assertion cannot go green until that is done.

## Verification

- `uniq -d` check: 5 duplicates before → 0 after; again after merging `main`: 5 → 0. Row count equals unique-ID count (486 / 486).
- Each of the five keeper IDs still resolves to exactly one row, and it is the row code references.
- `git diff --stat origin/main...HEAD -- '*.ts' '*.tsx'` is empty — no code reference disturbed.
- Every remaining mention of an old ID re-read and confirmed to mean the keeper, a provenance note, or an untouched `docs/sessions/` entry. Four `STATUS.md` hits (`:62`, `:225`, `:227`, `:242`) were the sibling's rows and were deliberately left alone — the precise ambiguity the attribute-don't-replace instruction exists for.
- Table integrity: all new/edited rows carry exactly 8 unescaped delimiters; file-wide malformed-row count unchanged from `main` (10, all pre-existing).
- CI green on the pre-merge commit (`App (typecheck + jest)`, `Edge Functions (deno test)`).
