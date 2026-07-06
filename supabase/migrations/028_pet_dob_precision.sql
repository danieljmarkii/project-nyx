-- ============================================================
-- Pet DOB precision marker — Schema Migration (B-251 Onboarding, PR 2 of 11)
-- See: docs/nyx-onboarding-requirements.md §4 (Migration B), §9 (PR 2),
--      sub-decision S2, and D6 (the dual integer-or-birthday age input).
-- ============================================================
-- The onboarding age step (PR 9) lets an owner give an age two ways:
--   • a real BIRTHDAY (date picker)        -> a witnessed, exact date_of_birth
--   • an approximate AGE ("~2 years")      -> a DOB *computed* as today − duration
--
-- Both resolve to the same `pets.date_of_birth` DATE column, which erases the
-- distinction: a computed anchor date is indistinguishable from a real birthday
-- once stored. That is a clinical-honesty hazard. This marker records which of
-- the two a stored DOB is, so no downstream surface (Profile, vet report,
-- Signal) ever renders a computed anchor as a witnessed birthday — an owner who
-- said "about two" must never see "born Jul 5 2024", and Dr. Chen must never
-- read a fabricated date as fact. (S2; the reason the column exists.)
--
-- HONESTY CONTRACT for every consumer:
--   • Precision is only meaningful when date_of_birth IS NOT NULL. A NULL DOB
--     carries the inert default and renders as "no age", never as a birthday.
--   • 'approximate' MUST render as an estimate ("~2 years old"), never as an
--     exact calendar date. 'exact' may render the date.
--   • Any future write path that stores a *computed* DOB MUST set this column to
--     'approximate' explicitly — the 'exact' default is only correct for a DOB a
--     human actually selected on a calendar.
--
-- DEFAULT rationale (why 'exact' is the truthful backfill, not a false-precision
-- assertion): the ONLY code path that writes date_of_birth today is
-- EditPetModal's date picker — every existing DOB in the DB is a calendar date
-- the owner selected, i.e. genuinely exact. Backfilling those as 'exact' states
-- what is already true. There is no legacy computed-DOB writer to mislabel.
--
-- Migration Safety Pre-flight:
--   Destructive: n  (purely additive — new type + new column)
--   Default: 'exact' (truthful for all existing rows; see rationale above)
--   Backfill: N/A    (the default backfills existing rows correctly)
--   Rollback: ALTER TABLE pets DROP COLUMN date_of_birth_precision;
--             DROP TYPE dob_precision;
--   Schema-isolated per the CLAUDE.md migration-isolation rule — no UI in this PR.
--   (Migration number 027 is reserved for the parallel owner-profile schema PR.)
-- ============================================================

CREATE TYPE dob_precision AS ENUM ('exact', 'approximate');

ALTER TABLE pets
  ADD COLUMN date_of_birth_precision dob_precision NOT NULL DEFAULT 'exact';
