# Signal/Home uplift SR-6 (B-721) — copy/safety pass, S10 audit, GA gate

**Date:** 2026-08-09 · **PR:** shipped via #620 (draft) · **Server:** none (docs/review only)

The terminal rung of the Signal/Home uplift. SR-6 runs the final `nyx-voice` + `clinical-guardrails` pass over every string the track ships, the S10 assignment audit, a re-run of `pm-feature-review` as Jordan/Sam, the flag-on on-device QA script, closes the two open doc items (B-728, B-733), and produces the **GA recommendation** to the PM.

Spec: `docs/nyx-signal-home-requirements.md` v1.2 (§2 spine, §3 Change Contract, §4 receipts, §9 verbatim copy, §7 FR-FLAG, §11 ACs). Design authority: `docs/culprit-signal-home-mockups.html` (round 2.1, design-locked).

**Headline: HOLD GA. The client surface (SR-1..SR-5) is coherent, tested, and byte-identical-off — ready for a small allowlist dogfood — but the track is not GA-ready: SR-4 is built-but-not-deployed (so SR-5's med/density/trial render nothing in prod yet), and the SR-6 reviews found two blocking E1 issues plus the standing FR-FLAG-4 shelf gate.** Full gate list in §"GA recommendation" below.

> **Mid-session reconciliation — SR-5 landed (#621).** This doc was drafted while SR-5 was still unbuilt; a sibling session shipped it to `main` mid-session. SR-5 is the full client consumption of the SR-4 payload (med-on-board line, density expand, trial adjacency) and **closes B-733** by implementing exactly the §5.5 rulings below (plural, `%`-screen fail-quiet, Dr. Chen-reworded withheld line). So the **client is now fully built (SR-1..SR-5)** and the "SR-5 unbuilt" gate is **cleared** — the activating gate is now the **SR-4 deploy** (SR-5's features are inert in prod until it lands). Two things SR-5 handed to SR-6, both folded in below: (1) **two §9 Tier-2 copy edits** (the reworded withheld line + the `Counted honestly` box header) — reviewed here (voice + guardrail PASS) and written into spec §9; (2) one **S10 item** — the comparable-reflection sample line double-states the sentence's pair (→ **B-738**). References to "SR-5 unbuilt" below are the as-drafted record; read them through this note.

---

## Track state at SR-6 (the scoping reality)

SR-6 was written to be "the final pass after everything ships." It is not that, because the track is mid-flight — SR-6 runs **parallel to SR-5**, not after it (STATUS/§8: "Next: SR-5 ∥ SR-6"). What is actually true on `main` today:

- **SR-0/1/2/3 shipped** (#610/#613/#612/#616) — flag seed, receipts, empty states, register. All dark behind `signal_design_v2` (default nobody), flag-off byte-identical (snapshot-pinned).
- **SR-4 shipped as code but is NOT deployed live** (#615) — the `generate-signal` additive payload (`densityComparable`, `medContext`) is built + verified but the Edge Function redeploy is Codespace/token-gated ("Inert until SR-5"). So in production the payload carries **neither** new field, and the reflection cards render exactly as pre-B-721.
- **SR-5** — was unbuilt when this doc was drafted; **it landed on `main` mid-session as #621** (see the reconciliation note above). It renders the med-on-board line (§5.4), the density expand (§3.3), and the trial adjacency (§3.4), all dark behind the flag and byte-identical-off. **But it is inert in prod until the SR-4 deploy** — the payload it consumes (`medContext`/`density`) is only produced by the deployed function, so on today's undeployed prod the SR-5 paths render nothing.

This shaped the SR-6 output: the copy pass covers **the shipped strings (SR-1..SR-5) AND the server SR-4 templates + spec §9**; the GA recommendation gates honestly on the deploy + the E1 issues.

---

## The copy/safety pass (`nyx-voice` + `clinical-guardrails`) — PASS

Every owner-facing string the track ships or spec's was read against both skills. Sources: `lib/signalCopy.ts` (the client copy module — sample lines, evidence text, E1/E2, ack, phone script, banner, receipt models, a11y labels), `components/home/InsightCard.tsx` + `SignalReceipts.tsx` + `SignalZone.tsx` (component literals + titles), `supabase/functions/generate-signal/phrasing.ts` (the server card sentences + the §3.5 guardrail screens) + `medContext.ts`, and spec §9 (the SR-5 strings).

**Result: the strings are voice-clean and guardrail-clean.** No exclamation marks, first-person-pet/second-person-owner throughout, plain-language over jargon, specific-over-generic, and — the load-bearing one — **nothing reads absence as wellness**. E2 says "That isn't an all-clear" verbatim; the E1 floor line ("If something needs attention sooner, it won't wait for the week") is the safety-doesn't-wait honesty device; the density gate withholds a reassuring fall rather than softening it; every safety template routes to the vet and never reassures. The server `validatePhrasing` screens are comprehensive — `hasBannedSignalVocabulary` (glyphs `↑↓→←/->/<-/slope`, percentages) fires on **every** finding type, plus per-type reassurance/dismissive/causal/mechanism/food-naming screens.

**Ruling on the SR-5 strings (§9) — B-733, shipped by #621.** SR-5 implemented exactly these rulings (now spec §5.5, the as-built contract); the copy pass reviewed the shipped strings and wrote the **two §9 verbatim edits SR-5 flagged for SR-6** — the Dr. Chen-reworded withheld line (*"…so we're not comparing it with last week — fewer logged days can look like fewer episodes on their own"*, which grounds the uncertainty in logged days and resolves B-733 item 3) and the `Counted honestly` box header — into spec §9 (both PASS voice + guardrail; PM-vetoable). The three ruled items:
1. **Plural** — `doseCount` can be 1, so the med line pluralizes (`count(n,'dose','doses')`), never "1 doses". §9's row now reads `{n} dose[s]`.
2. **Screen the composed line, then fail-quiet** — a drug label is owner free-text passed verbatim (a name is data, never mutate it). SR-5 runs the *composed* line through `hasBannedSignalVocabulary` (a `%` in a name like "Baytril 2.5%" trips the §3.5 percent screen) and **omits the med line on failure** — the same fail-safe-drop the cross-pet banner uses. The med line is pure context, so dropping it loses nothing safety-relevant.
3. **Scope the density-withheld line to the log-day measure the gate sees** — the gate fires on days-with-**any**-log density and cannot see a symptom-only logging lapse (meals keep any-log density up while symptom logging falls — B-733 item 3 / B-732). The line must not imply verified symptom-coverage; it ties uncertainty to log-days ("fewer log-days ⇒ a lower count may be fewer logs, not fewer episodes"), paired with the disclosure line's printed denominators. **Final wording is Dr. Chen's call at SR-5 build — do not ship the vaguer "less to log" phrasing without his sign-off.** This is copy-precision, not a safety inversion: even in the gate's blind spot the reflection renders a bare count + its "not a verdict on how {pet} is doing" disclaimer and is guardrail-screened against reassurance vocabulary, so it never asserts wellness.
4. **`{n}=1` note** — a single logged dose still renders "During an active {drug} course — 1 dose logged." Accepted (present tense + "logged" keeps it honest), but if "an active course" over-reads at n=1 that is a threshold call for the PM (adjacent to B-732), not a copy fix.

**One micro-observation (→ B-737):** the safety phone-script labels the symptom row **"Sign"** — a mild vet-register lean (Jordan knows "vomiting"; nyx-voice P5). Value is plain ("vomiting"); only the label leans clinical, and it is arguably defensible in a panel explicitly prepping the owner to talk to the vet. A PM/designer micro-call ("Sign" vs "Symptom" vs "What's happening"), not a blocker.

---

## The S10 assignment audit

S10: *a strip or meta-row element renders only when it carries something the sentence can't; duplicating the sentence is the anti-pattern.* Audited renderer-by-renderer against `INSIGHT_RENDERERS`, `CardFaceReceipt`, the meta row, and `ExpandedReceipts`:

| Type | Card-face strip | Meta chips | S10 verdict |
|---|---|---|---|
| `postprandial_timing` | DotLane (→ Shape C at >12) | sample line | ✓ the lane carries **distribution/spread** the sentence can't |
| `timeofday_clustering` | DotLane (24h) | sample line | ✓ same |
| `food_symptom_correlation` | none (sentence-only) | `Early pattern` (early only) + LinkedPair (joint only) | ✓ tag carries confidence/tier; LinkedPair carries the "always fed together" standing caveat, not the action |
| `intake_decline` (safety) | none (S1) | sample line | ✓ sentence-only |
| `reflection` | none (SR-1); density compare is SR-5-expanded | sample line (count pair) | ✓ |
| `symptom_worsening` (safety) | none (S1) | `New` (priorCount===0) + sample line | ✓ **structurally** — the sample line drops "0 last week" (`worseningNewSampleLine`) so the chip alone carries novelty. **One tracked live exception below.** |
| `symptom_chronicity` (safety) | none (S1) | sample line | ✓ |
| `incident_red_flag` (safety) | none (S1) | sample line | ✓ |

**Expanded states:** timing → "The other side of the picture" (Shape C control side + the un-timeable remainder the card face can't show, S2/S9); safety → "If you call your clinic, the facts to have ready" (the phone script — a call-prep tool, not a restatement). When the card-face lane has already degraded to Shape C, the expand shows only the disclosure (not a second compare) — a deliberate S10 dedup (`InsightCard.tsx:143`).

**Safety card faces carry no strip/graphic** — `CardFaceReceipt` returns null for every non-timing type, and all four safety types are non-timing. Snapshot-pinned (`InsightCard.test.tsx`).

**The one tracked live S10 exception (→ B-727, gates the deploy).** SR-4 *deliberately kept* the server card sentence's "…after none last week" clause for a worsening-after-zero finding (its retirement is deferred to B-727, which also composes `New` into the a11y label so a screen-reader user doesn't lose the novelty). So on the **live flag-on** surface, until B-727 lands with the SR-4 deploy, a worsening-after-zero card shows the novelty in **both** the sentence ("after none last week") **and** the `New` chip — the S10 anti-pattern, transiently. It is dark (flag off in prod) and self-documented (`signalCopy.ts:437`). Confirmed independently by the SR-6 `pm-feature-review`.

**One S10 refinement SR-5 punted to this audit (→ B-738).** For a *comparable* (not-withheld) falling reflection, the card sentence carries the full pair ("2 episodes this week, down from 5 last week") **and** the sample line restates it ("2 episodes this week, 5 last week") — the sample line carries nothing the sentence doesn't. SR-5 (#621, "Not in scope") named this and left it here: the round-2.1 mock's fix is a **density-quality** sample line ("Logging steady, 6 of 7 days") that carries the coverage the sentence lacks instead of re-printing the count — and SR-4 already computes the facts (`density.currentLoggingDays`/`priorLoggingDays` ride the payload). A bigger redesign than SR-5's scope, so deferred; not a safety issue (a descriptive count, guardrail-screened) — S10 polish. Filed B-738.

**S1 spec reconciliation — closes B-728.** The audit confirms the *code* is S1-clean (safety faces carry no evidence graphic; the `New` chip is a text novelty tag). But spec §2 S1 read "text, rail, sample line; no evidence graphic" without acknowledging the `New` chip §3.2 puts on the worsening *safety* card — so an auditor reading §2 alone would flag the shipped chip as an S1 violation. Written this session (PM-vetoable): §2 S1 + §11 AC now carve the `New` novelty tag as the one meta chip a safety face may add (a text flag, not a graphic), and correct the mock's stale "count-anchored chip" wording (the surviving chip is novelty-anchored — the pair-chips it described were cut in v1.1).

---

## `pm-feature-review` re-run (Jordan / Sam) — the product read

A fresh, un-anchored walk of the flag-on surface as the two target personas. It confirmed the copy pass (strings clean; it independently flagged "Sign") and — its highest-value catch — found a **load-sequence regression the string-level pass can't see**. Verdicts and findings:

**Per-flow verdicts:** Live safety lead → **SHIP-SHAPED**. Tap-to-expand (phone script + two-sided evidence) → **SHIP-SHAPED** (the strongest part for the wedge owner). E2 → **SHIP-SHAPED**. Ack line → **SHIP-SHAPED**. Live timing/dot-lane → **SHIP-SHAPED pending device legibility check**. **E1 building → NEEDS-WORK (blocking).** The register "plainness-signals-severity" bet → **INSUFFICIENT** (a static read can't confirm a plain safety lead out-competes a graphic-bearing benign secondary for a worried eye — needs the on-device attention check the spec always intended).

**Blocking findings (→ new backlog rows):**
- **B-734 — the heavy E1 flashes over a mature/live pet.** `SignalZone` forces `state='building'` while `isLoading && findings.length===0`, and `readSignalCache` is a **network** read; findings reset to `[]` on cold mount + pet switch while `localCtx` (day/event counts, from fast local SQLite) resolves first. So for a Supabase round-trip a day-34/212-event pet can render *"We're getting to know Nyx. Day 34 — 212 events so far. Patterns usually start appearing within the first week…"* + ghost receipts, **then** her live safety finding pops in. Flag-off flashes the same window but soft (one sentence, no day count) — **B-721 turned a soft pre-existing flash into a loud, self-contradicting one over a sick pet's owner.** Second seam: the pet-switch reset clears findings but not `localCtx`, so E1 can pair the new pet's name with the previous pet's counts for a render. Severity is round-trip-dwell-dependent → the device check.
- **B-735 — E1 "Day N" contradicts "within the first week" for sparse/grazing loggers (Sam).** The substantial-history gate is `≥8 events AND ≥7 days`, so a light logger crosses day 7 with <8 events and stays in E1 — "Day 24 — 6 events so far" directly above "Patterns usually start appearing within the first week." Sam reads the day count against the promise and concludes she's behind. New dissonance B-721 introduces (flag-off never exposed the day count). PM copy/threshold decision.

**Non-blocking (→ B-736, B-737):** no ack beat in the building state (the first-week first-log "Noted" moment is absent — B-736); the "Sign" label, the inaccurate "warm terracotta" `RAIL_COLOR.safety` comment (token is rose `#F43F5E`), the teal `New` chip on a rose safety card, and the footer grey-vs-mock-teal deviation (all B-737 — real-eyes-at-QA).

The pm-review **confirmed not-missing** (per the scope note): the med-on-board line, density copy, and trial adjacency are correctly SR-5, and the interim falling-reflection sentence already refuses to call a drop "improvement," so it doesn't reassure before the gate deploys.

---

## Flag-on on-device QA script

Run **on a `signal_design_v2`-eligible device** (allowlist the test uid), then re-run **flag-off** to confirm byte-identical. This is the SR-6 acceptance script; it folds in the two device checks the pm-review named.

```
### Manual QA — Signal/Home uplift (flag-on)
Precondition: add the test account uid to app_config.signal_design_v2.allowlist
(and enabled:true). Reload Home (r).

1. Live pet with a SAFETY lead (worsening/chronicity/intake/red-flag) → the lead
   renders as the big Newsreader sentence on the rose rail, NO card-face strip,
   sample line beneath (AC: S1 safety face plain; §5.1 lead canvas).
2. Tap the safety lead → "If you call your clinic, the facts to have ready" +
   the phone-script facts (Sign/This week/Most recent…). No reassurance, routes
   to the vet (AC: §4 phone script; clinical-guardrails).
3. Live pet with a TIMING insight (postprandial/time-of-day) → card-face dot lane;
   each dot a real episode, tinted window band with a dashed edge, pale out-of-window
   dots present. Axis reads e.g. "ate · 30m · 2h+" (AC: Shape A / S2 exceptions-visible).
   → verify the lane + 3-word axis are legible at phone width (pm-review device check).
4. Tap the timing card → "The other side of the picture" (within-window vs later
   counts) + "N episodes weren't near any logged meal" (AC: S2 control side, S10 remainder).
5. Timing finding with >12 timeable episodes → card face shows the stacked compare
   (within vs outside counts), NOT a dot lane, NOT bins (AC: A→C degradation at the cap).
6. Worsening-after-zero card → meta row shows a "New" chip + "N episodes this week"
   (NOT "0 last week"). NOTE the known B-727 redundancy: the SENTENCE still says
   "after none last week" until SR-4 deploys (AC: S10 structural; flag the live redundancy).
7. First-week pet (E1) → "We're getting to know {pet}. Day n — k events so far." +
   the three watching-for rows with GHOST receipts (hollow dots, dashes for counts —
   NO fabricated numbers) + "If something needs attention sooner, it won't wait for
   the week." (AC: §6 E1; no fake numbers; safety floor). Note the E1-vs-E1-c intensity
   pick here (SD-6, still open).
8. Mature pet, nothing established (E2) → "No established patterns yet…" + "That isn't
   an all-clear…" + the coverage diagnostic (AC: §6 E2; absence ≠ wellness).
9. Log a fresh event, return to Home → "Noted — updating {pet}'s picture…" above the
   still-readable findings; clears when regen settles or the 15s ceiling; findings never
   blank; no spinner (AC: §5.3 ack; fail-quiet).

Device regressions the pm-review named (do these deliberately):
10. COLD START the app on a day-30+ LIVE pet on a throttled connection → watch the
    Signal zone: does the heavy E1 ("Day 34… within the first week") flash before the
    real finding loads? (B-734)
11. SWITCH pets from a day-30+ pet to another → watch for one-render mispairing of the
    new pet's name with the prior pet's day/event counts (B-734).
12. Sparse logger: a pet at day ~20 with <8 logged events → E1 shows "Day 20 — 6
    events… within the first week." Confirm the dissonance (B-735).

Flag-off pass (byte-identical, FR-FLAG-2):
13. Remove the uid from the allowlist, reload → the SHIPPED Signal renders (soft
    building intro, no receipts, no New chip, no register compression). Snapshot-pinned.
```

---

## GA recommendation to the PM (decision brief)

**Deciding:** whether `signal_design_v2` is ready to flip on, and at what scope.

**Recommendation: HOLD GA; enable a small allowlist DOGFOOD now (the PM's own device) to run the on-device checks.** The client surface is now **fully built (SR-1..SR-5 — #613/#612/#616/#615/#621)**, all signal-surface tests + byte-identical-off snapshots pass, and it holds Pets > $ cleanly (free intelligence, safety leads, no upsell). But GA is gated on real work that isn't done:

**GA gates (must clear before flipping on for all users):**
1. **The SR-4 deploy — the activating gate.** SR-5 is built (#621), but its med/density/trial features render nothing in prod until `generate-signal` ships the `medContext`/`density` payload — the deploy is what turns SR-5 on. Deploy is Codespace/`SUPABASE_ACCESS_TOKEN`-gated (`scripts/deploy-edge.sh generate-signal --deploy`); generate-signal is **not** under the B-494 report hold. (So "SR-5 unbuilt" is no longer a gate — the deploy is.)
2. **B-727** — retire "after none" across the server sentence + client `evidenceText` + compose `New` into the a11y label, **landed with the SR-4 deploy** (the a11y gap opens the instant SR-4 ships). This also closes the one live S10 exception.
3. **B-734 (blocking)** — the E1 load-flash over mature/live pets (+ the pet-switch `localCtx` staleness). A real regression the uplift introduced; fix before GA.
4. **B-735** — the E1 "Day N vs first week" dissonance for sparse loggers (Sam). A PM copy/threshold decision.
5. **Register attention bet + dot-lane legibility** — the `pm-feature-review` marked these INSUFFICIENT on a static read; they need the on-device pass (which is exactly what the dogfood phase is for), plus the still-open E1-vs-E1-c intensity pick (SD-6).
6. **FR-FLAG-4 beta-shelf composition** — the feature may not GA before it is available through the B-712 beta shelf. Not done yet (see the plan below).
7. **B-732** — the two med-line targeting limitations (window-at-now vs finding-span; identity-agnostic drug pick) want a PM/Dr. Chen accept-or-refine before the med line is live.
8. **B-728** — this session's §2 S1 / §11 AC carve is written but PM-vetoable; ratify or veto.

_Cleared / done since drafting:_ **SR-5** shipped (#621); **B-733** is closed by it (the §5.5 rulings + the two §9 copy edits, folded in above). _Non-blocking:_ **B-738** (the comparable-reflection sample-line S10 refinement) is polish, deferred, not a GA gate.

**Options:**
- **A (recommended): HOLD GA, dogfood on now.** Allowlist the PM's device, run the QA script's device checks (B-734 severity, register attention, lane legibility, E1-vs-E1-c), decide B-735, and queue the SR-4 deploy + B-727 as the next build (SR-5 is already built, #621). Low risk — byte-identical-off for everyone else; the dogfood is where the open on-device questions get answered.
- **B: HOLD both GA and dogfood** until the SR-4 deploy lands (SR-5 is already built), then dogfood the complete, activated surface. Cleaner read of the finished feature, but forgoes early feedback on the SR-1..SR-5 client changes and leaves the on-device questions open longer.
- **C: GA now.** Not recommended — ships an incomplete spine, an undeployed payload, a live S10 redundancy, and the E1 flash to all users.

**Consequence:** A unblocks on-device evaluation and sequences the remaining build (SR-5 ∥ the SR-4 deploy + B-727, then the E1 fixes) without exposing an incomplete surface to GA. The FR-FLAG-4 shelf-join and FR-FLAG-5 retirement follow the PM's eventual GA call.

### FR-FLAG-4 — the beta-shelf composition (the B-712 shelf shipped via #611)

The shelf (`app/settings/beta.tsx`) and the two-gate primitive are live: eligibility (`useAllowlistFlag`, server) × opt-in (`useBetaOptIn`, local, default off, wiped on sign-out), never conflated (`lib/betaFeatures.ts`). Joining the Signal uplist is a small PR (§7: "one small PR there, or a rider on the Phase-2 PR"):
1. **Add a `BETA_REGISTRY` row** for `signal_design_v2` in `lib/betaFeatures.ts` — `title`/`blurb` (nyx-voice, concrete-not-selling), `owner`, `addedDate`, `reviewBy` (~1 quarter), **`serverCost: false`** (the uplift is client-render-only; SR-4's payload is computed uniformly for every account, not per-cohort, so the B-712 "server-cost betas gate server-side" rule is checked and does not bite).
2. **Swap the gate** in `SignalZone.tsx:55` from `useAllowlistFlag('signal_design_v2')` to `useAllowlistFlag('signal_design_v2') && useBetaOptIn('signal_design_v2')` — enablement then flows through the beta workflow (`eligible && optedIn`), not allowlist-alone.
3. Mock the shelf row's copy in the B-712 track's round (per §7).

Until this lands, enablement is **allowlist-only — the legitimate dark/dogfood phase** (Option A). The shelf-join is a hard pre-GA gate (FR-FLAG-4), not a dogfood blocker.

### FR-FLAG-5 — the flag-retirement removal-PR plan (on the PM's GA call)

The no-leak surface is tight — the removal is a well-scoped PR (client de-gate) + a schema-isolated cleanup migration:
- **`components/home/SignalZone.tsx`** — delete `useAllowlistFlag`/`useBetaOptIn` for this key; make `designV2` unconditional; delete `BuildingState` + `NoPatternState` (flag-off empty states) and the flag-off `PREVIEW_INSIGHTS` + "What the signal looks like:" copy; make `BuildingStateV2`/`NoPatternStateV2`, `labelReceded`, `showAck`, and secondary `compact` unconditional.
- **`components/home/InsightCard.tsx`** — remove the `designV2` prop + its `= false` default; make `CardFaceReceipt`, `ExpandedReceipts`, `cardFaceReceiptA11y`, and the `showNew`/`worseningNewSampleLine` path unconditional.
- **`lib/appConfig.ts`** — remove `signal_design_v2` from `ALLOWLIST_FLAG_KEYS` + `ALLOWLIST_FLAGS_UNSET`.
- **`lib/betaFeatures.ts`** — remove the `signal_design_v2` `BETA_REGISTRY` row (added in FR-FLAG-4).
- **`lib/signalCopy.ts`** — delete `buildingIntro` + `noPatternIntro` (flag-off only; **keep `staleIntro`** — `stale` is shared on both paths).
- **Tests** — drop the flag-off snapshot/branch coverage across `SignalZone.test.tsx`, `InsightCard.test.tsx`, `SignalReceipts.test.tsx`, `signalCopy.test.ts`, `betaFeatures.test.ts`; the V2 paths become the only path.
- **Migration (its own PR, schema-isolated)** — `DELETE FROM app_config WHERE key = 'signal_design_v2';` (migration 055's own rollback line). Optional/deferrable — the row is inert once the client stops reading the key.

Both paths stay test-covered until the removal PR merges.

---

## Definition of Done

- [x] Acceptance criteria (§11) reviewed against the shipped surface; the flag-on QA script above enforces them on-device. FR-FLAG-1/2/3 hold (no-leak surface = 2 client files + registry + migration; 7 byte-identical-off snapshots green).
- [x] `nyx-voice` + `clinical-guardrails` pass over every string (client SR-1..SR-5 incl. #621, server SR-4, spec §9) — **PASS**; SR-5 copy ruled into §5.5 + the two §9 edits (reworded withheld line, `Counted honestly` header) reviewed and written into §9.
- [x] S10 assignment audit — every element earns its place; safety faces carry no strip/graphic (snapshot-pinned); one tracked live exception (B-727).
- [x] `pm-feature-review` re-run (Jordan/Sam) — relayed; 2 blocking E1 findings (B-734/B-735) + non-blocking (B-736/B-737) filed.
- [x] Types/tests: 218 signal-surface jest tests + 7 snapshots green locally (`SignalZone`/`InsightCard`/`SignalReceipts`/`signalCopy`/`betaFeatures`). Deno unavailable locally; SR-4's 398 deno tests are CI-gated. **No app code changed this session** (docs/review only) — `tests: N/A, no code diff` (Engineer sign-off: SR-6 is the review rung, §8 "Server? no").
- [x] Doc items closed: B-728 (§2 S1 + §11 AC carve, PM-vetoable) · B-733 (§5.5 rulings) · doc bumped to v1.2.
- [x] Persona sign-off: Designer ✓ (S1 carve, S10 audit) — Dr. Chen ✓ (guardrail pass; density-withheld wording deferred to him at SR-5) — Jordan ✓ / Sam ✓ (via `pm-feature-review`) — Data N/A (no statistics changed) — Eng ✓ (FR-FLAG surface mapped) — QA ✓ (flag-on script).
- [x] PM Action Items consolidated (below).

## PM Action Items

- [ ] **Rule on the GA decision brief** — recommend Option A (HOLD GA, dogfood on now). If A: allowlist your uid in `app_config.signal_design_v2` and run the QA script's device checks (B-734, register attention, lane legibility, E1-vs-E1-c, B-735).
- [ ] **Ratify or veto B-728** (the §2 S1 / §11 AC `New`-chip carve — written this session, PM-vetoable).
- [ ] **Decide B-735** (E1 "Day N vs first week" — Day-N variant copy vs days-only substantial-history gate).
- [ ] **Accept-or-refine B-732** (med-line window-at-now + drug-pick limitations) before the med line goes live.
- [ ] **When ready to build:** the SR-4 deploy (`scripts/deploy-edge.sh generate-signal --deploy` from the Codespace) + B-727 land together — this **activates the already-built SR-5** (#621); then B-734/B-735.
- [ ] **Before GA:** the FR-FLAG-4 shelf-join PR (registry row + gate swap).

## Next Session Kickoff

**Recommended first prompt:**
> Deploy the SR-4 `generate-signal` payload (B-721) and land B-727 together — the pair that activates the already-built SR-5 client (#621). Run `scripts/deploy-edge.sh generate-signal --deploy` from the Codespace (verify per the edge-deploy runbook; generate-signal is not under the B-494 hold), and in the same effort retire "after none" across the server card sentence (`generate-signal/phrasing.ts`) + client `evidenceText` (`lib/signalCopy.ts`) + compose `New` into the worsening card's a11y label, with a pinning test — the a11y gap opens the instant SR-4 ships. Read `docs/nyx-signal-home-requirements.md` §5.5/§9 and the B-727 backlog row first.

**Alternate prompts:**
- Fix the E1 load-flash (B-734) — don't force the heavy building state during the network cache read; clear `localCtx` on pet switch. `code-reviewer` on the cache-is-a-network-read depth.
- Resolve B-735 (PM decision needed first): the E1 "Day N vs first week" copy/threshold call.
- FR-FLAG-4 shelf-join (small): add the `signal_design_v2` `BETA_REGISTRY` row + swap the SignalZone gate to `&& useBetaOptIn`.

**Parallel / efficiencies:** the SR-4 deploy + B-727 (server sentence + `signalCopy` a11y) and the B-734 E1 fix (`useSignal`/`SignalZone` load-sequence) touch mostly disjoint code and can run as separate branches — the one collision is STATUS.md at wrap. B-735 gates on a PM decision (not ready-to-run). The FR-FLAG-4 shelf-join (`lib/betaFeatures.ts` + the `SignalZone` gate) is independent and can ride any of them.
