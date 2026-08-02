# Diet-trial timezone: one Day N formula, zoned Ask window, request-zone fallback (B-449, B-539, B-443)

**Date:** 2026-08-02
**Shipped via #571** (draft; branch `claude/diet-trial-timezone-fixes-se8rfw`).

Three diet-trial timezone backlog items, closed together — the B-421 "one day counter" discipline extended across the **server boundary** (the fifth and sixth day-math paths), and the client/server zone-fallback asymmetry made impossible rather than documented. No schema, no migration.

## What shipped

**B-449 — the vet report's "Day N" was a fifth, unguarded implementation.** `generate-report/trial.ts:965` computed it as a hand-rolled `Math.max(1, evidence.endDayIndex - ctx.startDayIndex + 1)` — oracle day *indices*, but its own subtraction, outside B-421's source-scan guard (whose consumer list was client-only). The day-1-inclusive formula now lives once in **`lib/utils.trialDayCounter`**, called by both `getDietTrialProgress` (the canonical client counter) and the report. The report keeps its own **end** index (`evidence.endDayIndex`, not today) deliberately — that's where a scoped/overrun report *must* differ; only the arithmetic is shared. B-442/#467 had already deleted the report's separate `daysElapsed` *field*, so this closed the residual the row demanded ("do not leave it unguarded and unmentioned"). Behavior-identical (pure extraction).

**B-539 — `ask`'s `since_trial_start` window used raw UTC `Math.floor` (the fifth path B-421's guard missed).** Extracted `resolveWindow`'s trial branch to **`resolveTrialWindow`**, bucketed by the owner's midnight:
- `windowDays` uses the same zoned indices `dietTrialStatus` does, so Ask's stated Day N can't disagree with the card by ±1 (proved invariant: both are `max(1, zonedDayIndex(now) − zonedDayIndexOf(startDate) + 1)` off the *same* indices — `started_at` is a DATE, so `trialStartMs` round-trips to the exact start day).
- the retrieval `[startMs, endMs)` bounds are the owner's **local** midnights via a new DST-correct **`zonedDayStartMs`**, so a trial-day-1 event east of UTC is no longer dropped and a pre-trial event west of it is no longer included.
- the fixed 7d/14d/30d windows deliberately **stay** UTC-aligned (calendarWindow / Patterns parity — G5).
- `dietTrialStatus` now gates on `status !== 'active'` (the real contract; `trial_status` is a `NOT NULL` enum `active|completed|abandoned`), and the dead `deletedAt` check — a column `diet_trials` has never had — is removed (from the param, the `AskDataContext.trial` type, and `index.ts`'s hard-coded `deletedAt: null`).

**B-443 — the fallback asymmetry, made impossible by construction.** The client card buckets by the DEVICE zone; the server bucketed by the stored `user_profiles.timezone`, which a never-stamped profile carries as migration 001's `NOT NULL DEFAULT 'America/New_York'` — so a non-NY owner's Ask/report Day N silently disagreed with their card, and a `NOT NULL DEFAULT` can't express "unknown." Fix: the client (`lib/ask.ts`, `lib/pdf.ts`) sends its device zone on the request; the server resolves the day-math zone as **`resolveIanaZone(requestZone, storedZone)`** — so Ask, the report, and the card all bucket by the **same** device zone, with the stored zone as fallback and null (→ UTC) the last resort. A garbage/spoofed request zone is validated away (Intl try/catch), affects only the caller's own JWT/RLS-scoped data, and never throws. **No schema change** — the stale default is sidestepped, not altered.

**Guard test** (`lib/dietTrialDayMath.guard.test.ts`) extended across the server boundary: the report + client both call `trialDayCounter`, the formula lives once in `lib/utils`, and `resolveTrialWindow` derives its day math from the zoned helpers (never a raw ms divide).

## Adversarial review — PASS, with one finding fixed

The mandatory `adversarial-reviewer` pass (clinically load-bearing: feeds the vet report + Ask) ran every attack in the brief plus a 24-zone × 11-year empirical sweep. Verdict **PASS**; 980/980 zone×start×now parity on `windowDays == dietTrialStatus.dayCounter`; status guard, garbage-timezone, future-dated-start, fixed-window-untouched all held.

**One real defect, found and fixed in-session:** `zonedDayStartMs` violated its own roundtrip invariant in the three zones that spring forward **at midnight** — America/Havana, America/Santiago, America/Asuncion. On that ~1 day/year local 00:00 doesn't exist, and the double-probe landed an hour early, on the previous local day — dropping a today-in-trial symptom from the window for ≤1h (the unsafe direction). The counter (index-based) was unaffected. Fixed by taking the **earliest candidate that actually lands on day i** — which is the transition instant when midnight is skipped — so the invariant `zonedDayIndex(zonedDayStartMs(i,tz),tz) === i` now holds universally. Pinned by a Havana test (start bound = the 05:00Z transition; a 23:30-local today event stays in-window). This is a large net improvement over the shipped raw-UTC bug it replaced (off by hours *every* day).

The reviewer also left a forward note for the report's future public-token path (PR 6): the immutable snapshot must freeze the rendered HTML or carry the original request zone, or a server-side re-render will fall back to the stored zone and disagree with the owner's device-zone Day N.

## Tests

`tsc --noEmit` clean · jest **188 suites / 4146** green, including all three **non-UTC CI zones** (Kiritimati +14, Chatham +12:45, Honolulu −10) · `deno test` **1119** green · guard test **22** (incl. the new B-449 delegation + B-539 fifth-path assertions). New zoned coverage in Auckland / Kolkata / LA + an in-trial DST transition + the midnight-skip zone. Reverted an unrelated `deno.lock` churn (`expo-notifications`, surfaced by local `deno cache`) to keep the diff minimal.

## Decisions

- **B-449 re-based, not exempted.** The row offered "delegate to `getDietTrialProgress`" *or* "guard with an exemption comment." Neither fit: the report deliberately counts to its *evidence end*, not today (a scoped/overrun report must), so it can't call `getDietTrialProgress(now)`; and leaving it exempt keeps a fifth `max(1,…)` that drifts. The third path — share the *formula*, keep each caller's own end index — is the actual "one implementation."
- **Fixed windows stay UTC-aligned.** Only `since_trial_start` is zoned; 7d/14d/30d keep raw-UTC bucketing on purpose, because Ask's counts must equal Patterns' (`calendarWindow`, B-084). Zoning them would have broken that parity.
- **B-443 fixed at the read path, no migration.** Making the column NULLable would express "unknown" but only helps *new* accounts and still leaves a device-vs-UTC gap; passing the device zone on the request makes card==Ask==report agree *by construction* for any updated client, code-only, respecting schema-isolation.
- **The midnight-skip bug was fixed, not documented.** A new primitive shipping with a docstring asserting a false invariant, in a clinical retrieval path that drops a symptom, is not the bar — even at ≤1h/3-zones/yr.

## Deploy dependency (no PM action beyond the redeploy already queued)

Both Edge Functions this PR touches are **already** listed pending-redeploy in STATUS.md (§ Deploy — generate-report gate clear since 2026-07-30, PM-run from Codespace; `ask` "behind too — #449 timezone fix"). These changes ride those same pending redeploys once #571 merges; nothing is live until then. `generate-report` is 240 KB → the Codespace `scripts/deploy-edge.sh` path, not the MCP inline fallback. Preserve `verify_jwt=true` on both.

## Follow-up filed

**B-665** — the stale-`America/New_York` default still misleads the **background** `generate-signal` engine (detector ⑥ time-of-day clustering), which can't be handed a request zone. Thin in practice (`syncUserTimezone` stamps the device zone on every foreground, and ⑥ already goes silent on a *missing* zone), but the root cause — a `NOT NULL DEFAULT` can't express "unknown" — is unfixed there; the real fix is the schema change (default NULL / a "confirmed" flag) in its own PR.

## Persona sign-off

Data Scientist / Biostatistician ✓ (`adversarial-reviewer` PASS — 980/980 counter parity, one ≤1h retrieval-bound bug found & fixed, mutation-checked) — Engineer ✓ (pure extraction + one guarded new primitive, tsc/jest/deno green, deno.lock churn reverted) — Dr. Chen N/A (no clinical-copy change; the numbers a vet reads are now *more* consistent across surfaces) — Trust & Safety ✓ (request timezone is own-data-only, validated, no cross-tenant reach).
