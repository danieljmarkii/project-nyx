# Dose attribution reads the owner's calendar day, not the UTC day (CUL-991)

**Date:** 2026-10-04
**Branch:** `claude/eloquent-cray-n8r5my`

Shipped via #1052 (draft; CUL-991).

## What shipped

- **`attributeDoses` takes a zone** (`lib/medications.ts`). An unlinked dose (`medication_id` NULL, the one-tap shape) is matched to a regimen by drug and DATE window. The dose's day is now the day it falls on in the owner's zone (`localDayIndexOf`), and each bound is the calendar day it names; both inclusive, precomputed once per regimen. The old comparison sliced the instant's first ten characters, its UTC day, so a 21:00 New York dose on a course's last day left the course and printed on the vet report as a 13-of-14 course plus a phantom "no regimen configured" line; ahead of UTC a first-day morning dose read as the day before. Back-to-back courses of one drug were also misattributed (the last evening of course A went to course B).
- **One frame per surface.** The app omits the zone (device zone, the `localDayIndex` convention; History's day keys are device-local too). `deriveMedicationCourses` passes its own `timeZone`. The vet report passes `tz || 'UTC'` to both `attributeDoses` and `deriveMedicationCourses`, the frame `localDayKey` prints in.
- **Ask's private port is deleted** (PM call this session). `supabase/functions/ask/tools.ts` now adapts its rows onto `attributeDoses` with the request zone. The port had also kept the CUL-976 final-day drop (a raw `occurredAt > endedAt`), so Ask is fixed for both.
- **Tests:** zone fixtures whose UTC day differs from the local day (New York evening, Auckland morning, a course seam, US spring-forward, unparseable instants, explicit link), a course-grain test, two Ask tests, and two report tests over the issue's bedtime-course record (rendered: no phantom line; UTC fallback stays UTC). The B-135 boundary tests now state `'UTC'` instead of inheriting the process zone, which is why five of them went red under the non-UTC job once the zone became live.

## Measured

Production, before the fix (read-only aggregate): 69 live unlinked doses, all on accounts with a profile zone; 21 have a UTC day unlike their local day; **0** change course under the fix (none sits on a course boundary). Latent, not live.

## Falsification attempts (DoD)

- **Biostatistician (`adversarial-reviewer`, HOLDS):** a 21:00 New York final-day dose (attributed) vs 00:30 the next day (orphan); Honolulu 23:30 / 00:30; Kiritimati first-day 02:00 vs 23:00 the day before; Chatham +13:45; both New York DST days; back-to-back courses (old frame sent the dose to the next course); empty / garbage instants and impossible bounds (unattributed, never dropped); a traveller and an invalid zone (both Edge entry points run `resolveIanaZone`, the Edge runtime is UTC, so attribution and printed days stay in one frame); Ask adapter vs the deleted port (null start, link to an absent regimen, deleted rows) all equivalent.
- **Mutation:** forcing the frame to UTC reds 7 app tests and the report + Ask tests; dropping the zone in `deriveMedicationCourses`, in either report call, or in Ask each reds its own test.

## Residuals (filed, not in this PR)

- **CUL-1579** — the Signal engine turns a regimen's DATE bounds into UTC-midnight instants (`generate-signal/pipeline.ts` `mapMedicationWindows` / `regimenEndIso`), so for a US owner a drug stops counting as on board ~20:00 on its final day. Same frame mistake, different rule (confounder spans); found by the adversarial pass.

## Persona sign-off

Engineer ✓ (one predicate, Ask port retired, C-26 closure sound) — Data ✓ (frame agreement across report, History, Ask) — Biostatistician ✓ (adversarial HOLDS) — Dr. Chen ✓ (the report's bedtime course reads one line, 14 of 14) — Designer N/A (no copy or UI change) — T&S N/A.
