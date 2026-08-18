# Today band — one door (CUL-529)

**Date:** 2026-08-17

Shipped via **#667** (draft at time of writing). Parallel track — **The Daily Recap** (B-762 / CUL-30), a DR-2 (CUL-25) follow-up polish. No core build-sequence step. From the PM's TestFlight review of the new Today section.

## What shipped

The Home **"Today" band** (TodayZone v2) had **two** affordances into the full-day recap, both routing to `/day-summary`: the band's **`Full day ›`** door (top-right) and the capped strip's **`N more events today →`** link (bottom, shown only when >3 events logged today). Both accent-coloured and arrow-suffixed, stacked in one card — two things that each read as "the door to the full day." The PM caught the redundancy on device: *"That feels a bit redundant."*

**The change:** keep `Full day ›` as the single door; **demote** the overflow line from an accent link-with-arrow to a **muted tertiary footnote** (`colorTextTertiary`, no arrow, regular weight). One thing now reads as the door.

**Files:**
- `components/home/TodayZone.tsx` — `moreLink` style → `moreCaption` (accent-ink + medium + arrow → tertiary + regular, arrow dropped); the JSX drops the `→`.
- `components/home/TodayZone.test.tsx` — two tests: the overflow renders as a caption **without** an arrow (CUL-529); no caption when the day fits within the 3-row cap.
- `docs/culprit-today-band-cta-mockups.html` — the side-by-side decision mock (now / demote / delete), published as an Artifact for the PM.

## The design decision — demote, not delete

The PM's first instinct was to **delete** the "view more" CTA outright and fly on `Full day ›`, and deferred the approach to the Product Designer. The Designer call was **demote, not delete**, because the two elements weren't identical in *job*:

- `Full day ›` is a persistent navigation door.
- `N more events today →` was doing double duty — a second door **and** the only place the band states **how many events sit below the 3-row cap**. The count line reports category *totals* ("3 meals · 1 dose logged"), not what's hidden, so a blunt delete forces the owner to do arithmetic to learn there's more. Sam (grazing cat, many small meals/day) hits the >3-event case often.

So: kill the *CTA* (the redundancy the PM named), keep the *count* as a quiet footnote. The strip itself stays tappable — the pre-DR-2 silent-door behaviour, tracked separately as **CUL-514 (B-787)**; this PR did not touch it.

Both options were rendered side by side in the mock so the PM can rule from the frames; **B is a one-line revert** (delete the caption) if they prefer the blunt cut.

## Reviews / falsification

Presentational, token-only; not clinically/statistically load-bearing (no detection/escalation/AI/thresholds — same call the DR-2 session made, no `adversarial-reviewer` warranted).

- **AA held** — the demoted caption is `colorTextTertiary` #737373 on the white card ≈ **4.7:1** at 13px, above the 4.5:1 normal-text bar (the old accent-ink was 5.17:1). No AA regression.
- **Principle 3** — the Signal still leads Home; the band is one zone (facts + **one** door); no new card/badge/verdict. The honest "there's more below the cap" disclosure is preserved, just re-registered.
- **Tests** — `tsc --noEmit` clean; full jest suite green via the pre-push hook (**237 suites / 5278 tests**); the two new TodayZone tests pin the caption + no-arrow behaviour and the ≤3-event absence.

Persona sign-off: **Designer ✓** (Principle 3; honesty kept) — **Engineer ✓** (token-only, no logic) — **Data N/A** — **Dr. Chen N/A**.

## Decisions surfaced

- **Demote vs delete (CUL-529 body / the mock).** Built demote (Option A); PM to confirm or flip to delete (one-line change). Not a Blocking Open Question — a micro-call with a trivial revert.

## Verification

`tsc --noEmit` clean; full suite 237 suites / 5278 tests green (pre-push). CI running on #667 at wrap (three checks in progress). No schema, no migration, no Edge Function, no secret, no backend deploy — nothing for the PM to run beyond the on-device look.
