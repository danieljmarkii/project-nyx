# DR-7 (CUL-27) — Finish pass: copy sweep, device checklist, AC, DoD

**Date:** 2026-08-15

The finish pass over the whole Daily Recap chunk (B-762 / spec §7 DR-7 + §8): `nyx-voice` + `clinical-guardrails` over **every** string shipped by DR-0…DR-6; `pm-feature-review` on both flows; the Part-1 on-device checklist re-traced over v2; the §8 acceptance criteria verified one-by-one; and the full DoD, incl. the adversarial pass on the two load-bearing pieces (the C0 precedence rule and the anchor clamp). Branch `claude/cul-27-dr7-finish-pass-yzuswk`, cut from `main` after DR-0…DR-6 landed.

**Verdict:** the chunk is substantially ship-shape. The copy is clean and matches the design lock verbatim; the night-med AA passes (measured, not asserted); §8 AC 1–7 all verify. Three isolated reviews ran; between them they surfaced **one real bug** (a multi-pet anchor false-empty → B-788, needs a Designer+PM ruling), **one latent-but-ungated safety gap** (a C0 symptom-set divergence → B-789, now guarded by a build tripwire), and a small set of copy/design decisions for the PM. This session landed the fixes it could make safely and surfaced the rest as decision briefs rather than resolving them silently.

## What this session changed (the code)

- **`components/home/TodayZone.tsx`** — the recap band's `Full day ›` door and the `N more events` link moved from `colorAccent` → **`colorAccentInk`**. Bright teal `#00C2A8` as ~13px text on the white Home card is **2.26:1** (fails AA); `colorAccentInk` `#0B7B6C` is **5.17:1**. This is the design lock's own choice (the mock's `.hz-label .door` uses `--f-accent-ink`) and the app convention (~20 components use accent-ink for accent text on light). Light-ground only — the recap's night links (zero-log CTA, retry, offer "Turn on") correctly keep `colorAccent`, which passes on the dark ground (8.09:1 / 6.57:1). Surfaced by `pm-feature-review`.
- **`lib/daySummary.test.ts`** — two safety-test additions surfaced by the adversarial review:
  - a **C0 symptom-set build-tripwire** (`describe('C0 symptom-set coverage')`): asserts every clinical symptom that is loggable today is classified as a recap symptom, and pins the currently-un-loggable pair (`scratch`/`skin_reaction`) so the tripwire's premise can't rot. It fails the build the day either is exposed in the picker without being added to `SYMPTOM_TYPES` (→ B-789).
  - the **G2 banned-word test strengthened** from one all-eaten fixture (which also skipped `model.medStrips[]`) to the space: the trial day, a full-refusal + partial-refusal lead (`mealRefusalClause`), a multi-symptom lead, and the med-strip builder incl. a withholding/concern fact.

No production copy or logic was changed beyond the AA token swap — the finish pass deliberately did not resolve the design-laden findings unilaterally (see Decision briefs).

## Copy sweep — `nyx-voice` + `clinical-guardrails` over every DR-0…DR-6 string

Read every owner-facing string at its source (the `lib/notifications.ts` registry, `lib/daySummary.ts`, `lib/dailyRecapOffer.ts`, `app/settings/notifications.tsx`, the recap components) and cross-checked against the design-lock mock. **Clean.** Highlights:

- **Verbatim-matches the design lock:** the offer body (*"Culprit can let you know each evening when the day's record is ready."*), the primer headline (*"The day, read back to you."*) + one body paragraph (*"One calm notification each evening, when the day's record is ready to read. Your phone will ask once — change it any time."*), the named body (*"{name}'s day is ready to read."*), the hero lead, and the zero-log copy.
- **`nyx-voice`:** first-person-pet/second-person-owner + the pet's name (Pattern 1); specific, calm, **zero exclamation marks** (a mechanical grep over all DR surfaces confirms none — the only `!` hits are `!isEmpty` in code); designed empty states (Pattern 3 — the zero-log is a record fact + a door, never blank); plain language (Pattern 5); no manufactured enthusiasm.
- **`clinical-guardrails`:** the zero-log copy is G2-framed (a record fact, never a wellness verdict — no "all clear/quiet"); the notification body is G1-safe (speaks to the ritual, never asserts record contents — right, since iOS runs no JS at fire time); the primer is strictly retrospective (G4 — a look back, never a med-reminder implication); and the lead line's `mealRefusalClause` correctly surfaces intake decline (*intake is not preference* — errs toward surfacing, never softens to "picky"). One provisional string flagged (below).

## Brand amendment verified

- **Night med token minted + AA passed (measured):** `colorEventMedicationOnNight = #93ADCB` is present. Recomputed WCAG contrast: **7.91:1** on `colorBrandNight #13112E` and **6.43:1** on `colorBrandNightElevated #251F57` — both clear text-AA (4.5:1), well above the 3:1 an icon glyph needs. Every other asserted night-token contrast (moonlight 15.8, on-night 15.4, muted 7.6, symptom-on-night 6.8, moonlit-teal 10.4) also checks out. "Verified, not asserted."
- **Relocated privacy-promise copy reads correctly in notification settings:** `app/settings/notifications.tsx` shows *"On your lock screen, the notification only says the day's ready to read — never what's in the record."* in the same tertiary register as the intro line, on the live states (a/b), not over the denied banner — exactly the DR-4/R-7 relocation (out of the primer pitch, stated where an owner examines the feature).

## §8 acceptance criteria — verified one by one

1. **Anchor + clamp + header** ✓ — `resolveDaySummaryAnchorMs` honours the fired-for day only at age 0/1, else `nowMs`; tested at 12:40am (age 1 → yesterday), age 2 (→ today), future (→ today); the header names `state.anchorMs`. Adversarial-confirmed off-by-one-free and DST/zone-safe (the payload carries the delivery instant, not a baked index).
2. **Recap renders from predicates, no verdicts, four states, always-night, night AA** ✓ — spine/lead/chips/strips/forward all read shipped predicates; the banned-word test (now strengthened) holds; the four states (normal/zero-log/error/multi-pet) all render on the night ground; no time-of-day branching; night AA measured above. (One multi-pet edge → B-788.)
3. **TodayZone band shares one language; `Full day ›` → recap; Signal still leads Home** ✓ — the band's lane + count line come from the same `nodeTints`/`buildCountChips` as the spine; `openFullDay` → `/day-summary`; Home renders `SignalZone` (114) above `TodayZone` (131).
4. **Offer in-app-only, quiets 30d, re-surfaces once per value moment, primer-gated** ✓ — `shouldOfferDailyRecap` gates (in-app + off + not-denied + not-quieted); `OFFER_QUIET_MS = 30d`; `surfaceOfferForValueMoment` once-ever per kind; `onTurnOn` → primer, never `ensurePermission(true)` directly.
5. **Primer is the mock; declining spends nothing; privacy promise in settings** ✓ — hero + c2 + one body paragraph + CTAs; `onDismiss` never reaches `ensurePermission(true)`; privacy promise verified in settings.
6. **`use_pet_name` on → named body single-pet; off/multi-pet → neutral; wiped on sign-out** ✓ — `resolveDailySummaryContent` names only when `usePetName && single petName`; multi-pet passes `null` at both the UI (`primerPetName`) and reconcile (`resolveSinglePetName`); `notification_preferences` (carrying `use_pet_name`) is in `LOCAL_WIPE_TABLES` (hydration.ts:301).
7. **tsc + jest + non-UTC CI green; Part-1 on-device checklist re-verified over v2** ✓ (automated) — `tsc --noEmit` clean; jest **5254 / 5254** green under UTC + Kiritimati (+14) + Chatham (+12:45) + Honolulu (−10). The device checklist is code-traced below; the on-device execution is the PM handoff.

## Part-1 on-device checklist — re-traced over v2

All three Part-1 paths hold over the v2 recap, each with its v2 wrinkle handled. (Code-traced; the on-device run is the PM QA script below.)

- **Tap-routing** — `useNotificationScheduling` routes both warm taps (`addNotificationResponseReceivedListener`) and cold-start taps (`getLastNotificationResponseAsync`, once a session exists → behind the auth gate). Every tap goes through `notificationRouteDecision` (auth-gated + registry-validated route, G5 fail-safe) → `routeDedup` (exactly once per delivery; re-routes next day; leaves a pre-auth tap unmarked). **v2 wrinkle:** the tap now threads the anchor (`normalizeFireInstant`, handling the iOS-seconds/Android-ms unit split at the `1e12` threshold) and the DR-3 arrival marker (`source: 'notification'`, always) via the pure/tested `notificationRouteParams`.
- **OS-revocation reconcile** — on foreground (`useNotificationScheduling`) and settings-focus, `reconcileFromPreferences` → `computeReconcileActions` cancels EVERY live schedule when permission is not granted. **v2 wrinkle:** reconcile also refreshes content drift (the pet-name body) via `contentSignature` — the revocation path (permission gone → cancel all) is unchanged.
- **Sign-out cancellation** — `wipeLocalSession` calls `cancelAllScheduledNotifications()` (a scheduled local notification lives in the OS, outside the SQLite wipe) + `clearNotificationInteractions()`; the `use_pet_name` pref is wiped with its `notification_preferences` row; the DR-3 offer markers are cleared via `clearDailyRecapOffer()`.

## Persona flags / findings raised

### Fixed this session
- **[AA] `Full day ›` / `N more` used `colorAccent` on white (2.26:1)** — fixed to `colorAccentInk` (5.17:1). (`pm-feature-review`.)
- **[safety-test gap] the C0 symptom-set divergence was ungated; the G2 banned-word test was single-fixture + skipped med strips** — added a build tripwire + strengthened the banned-word test. (`adversarial-reviewer`.)

### Decision briefs (PM / Designer — not resolved silently)

1. **Multi-pet fire-day anchor false-empty (→ B-788, `Now`).** *Deciding:* how the recap picks a day for a multi-pet household on an after-midnight tap. *The defect:* `buildAnchoredDaySummary`'s empty-fallback is whole-account, so a pet with a fresh **today** entry renders "Nothing in {pet}'s record today" behind a yesterday-anchored screen — reproduced (Waffles's 12:05am vomit hidden), and reassurance-on-absence hiding a just-logged symptom. *Options:* **(A)** per-pet anchoring — a pet empty on the anchored day re-renders against today (needs a per-pet date treatment — Designer); **(B)** keep one header, change which day wins (loses the other pet's completed day); **(C)** accept + fix only the copy so it never says "today" over yesterday. *Recommendation:* (A) — it's the only option that never hides a fresh record, but it carries the one-header-vs-per-pet-dates design call, so it's a Designer+PM ruling, not a finish-pass edit. *Consequence:* unblocks a correct multi-pet recap + a `buildAnchoredDaySummary` multi-pet regression test.
2. **The lead-line refusal clause is still provisional (folds into B-779).** *Deciding:* ratify the exact copy/precedence of `mealRefusalClause` (self-flagged PROVISIONAL, pending Dr. Chen + PM). *This pass's read:* the `clinical-guardrails` gate is **cleared** — the clause surfaces a decline as a record fact and errs toward surfacing (the safe direction), and the adversarial pass confirmed it holds for literal refusals. *Two open sub-points for Dr. Chen:* (a) it counts `detail === 'refused'` only, so partial declines (`picked`/`some`) — a cat that picked at all three bowls — don't reach the headline (arguably they should for the feline anorexia window); (b) the mock has no refusal-day frame (mock-what-you-change). *Recommendation:* gate-and-keep — ratify the copy + add a refusal-day frame + decide the `picked`/`some` extension; it's the wedge's worst-morning line.
3. **Primer privacy legibility for the privacy-sensitive owner (Sam).** *Deciding:* whether the primer needs a privacy cue at the decision point. *The tension:* the DR-4/R-7 ruling relocated the privacy promise to Settings, but the primer hero is content-forward ("Breakfast · all eaten", "Apoquel · given"), so a privacy-sensitive owner may read it as "my lock screen will show this" with the reassurance one screen away. *Options:* **(A)** leave as-is (trust Settings); **(B)** restore one plain promise line to the primer body; **(C)** reword the body so "ready to read" unambiguously means in-app. *Note:* (B)/(C) **re-open a ratified ruling (R-7)** — a PM call, not a finish-pass edit. *Recommendation:* PM to decide; the finish pass left the ratified copy in place.
4. **Symptom register split (Home neutral vs recap rose — CUL-25 D1).** A symptom count is rose on the recap chip but neutral in Home's count line (the code self-flags this for ratification; the lane dot already carries rose, and a rose 13px text token fails AA on white). *Recommendation:* ratify the split (keep) unless the Designer wants a darker rose-ink for the count text.

## Known issues / tech debt

- **B-788** (multi-pet anchor false-empty) — `Now`, needs the Designer+PM ruling above before a correct fix.
- **B-789** (C0 symptom-set reconciliation) — `Later`, guarded by the new build tripwire; the reconciliation rides the picker-exposure of scratch/skin_reaction.
- Pre-existing DR backlog unchanged: B-778 (Photo-attached sub-line), B-779 (refusal-aware chips + the clause ratification), B-780 (rich multi-pet recap), B-781 (strip deep-links), B-782 (wet/dry tag on spine), B-774 (multi-pet primer hero).
- Two low-value nits from `code-reviewer`, intentionally **not** actioned (match existing codebase patterns): `borderRadius: 14` magic number on RecapStrip/DailyRecapOffer; three copies of the "finite positive ms" parse (`parseFiredAt` / `normalizeFireInstant` / `isNotificationArrival`), all tested and in agreement.
- Hook-level tests still absent (`useDaySummary`/`useDailyRecapOffer`/`useNotificationScheduling`); `app/day-summary.test.tsx` mocks `useDaySummary`, which is why the multi-pet+anchor interaction went uncaught — the B-788 fix should add a `buildAnchoredDaySummary` multi-pet test.

## DoD

- [x] §8 AC 1–7 listed + verified (above) — QA ✓
- [x] Diff scanned against the anti-pattern lists — none introduced (`code-reviewer` confirmed: theme tokens only, no `any`, hitSlop present, no `ActivityIndicator`, B-424 wipe satisfied, B-514 timezone-honest, migration additive/reversible, sync/LWW correct)
- [x] Types pass (`tsc --noEmit` clean); lint clean
- [x] Automated tests: `daySummary.test.ts` extended (tripwire + strengthened banned-word); full suite **5254/5254** under UTC + 3 non-UTC zones
- [x] No new secret used
- [x] Persona sign-off: **Designer ✓** (AA fix, register split surfaced) — **Data/Biostat ✓** (adversarial: C0 precedence held for reachable inputs; one latent symptom-set gap guarded; clamp clean) — **Dr. Chen** partial (refusal clause `clinical-guardrails`-cleared; exact copy + `picked`/`some` → decision brief #2) — **PM** decisions surfaced as briefs — **T&S ✓** (sign-out cancellation + `use_pet_name` wipe + privacy-promise relocation)
- [x] Adversarial review (mandatory — C0 precedence + anchor clamp): ran; counterexamples stated and confirmed. Biostat/Data: *tried vomit/diarrhea/lethargy/itch across all tiers → symptom always leads, no floor ✓; a full-refusal trial day → "all refused" surfaces in the headline ✓; a `skin_reaction` day → washes to a neutral "one event" lead (SYMPTOM_TYPES omits it) → latent, un-loggable today, now guarded by a build tripwire; clamp — 12:40am (age 1 → yesterday), ≥2-day (→ today), future (→ today), spring-forward instant pair (calendar-diff stays 1) → no off-by-one, DST/zone-safe; malformed `firedAt` → today, no throw ✓.*
- [x] Future-self review: the AA fix + the tripwire are additive and self-documenting; no new pattern introduced.
- [x] Dev handoff + Manual QA script emitted (below)
- [x] PM Action Items consolidated (below)

## PM Action Items

- [ ] **Rule the multi-pet anchor decision brief (#1 / B-788)** — the only `Now` item; a correct fix is blocked on the one-header-vs-per-pet-dates call.
- [ ] **Ratify the lead-line refusal clause (#2 / B-779)** — Dr. Chen on the exact copy + the `picked`/`some` extension; add a refusal-day mock frame.
- [ ] **Decide the primer privacy-for-Sam call (#3)** — leave as-is, or re-open R-7 to add a privacy cue to the primer.
- [ ] **Ratify the symptom register split (#4 / CUL-25 D1)** — keep neutral Home count, or a darker rose-ink.
- [ ] **Run the on-device Part-1 checklist over v2** (the QA script below) — the code paths are verified; the device execution is the human pass.
- [ ] Nothing to deploy: this chunk is client + a shipped additive migration; the `generate-report`/`generate-signal` redeploys are **not** part of it.
