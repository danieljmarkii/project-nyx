# Signals v2 PR 10 (CUL-15) — copy/safety pass, flag-on QA, the single gated redeploy, beta-shelf row, GA rec

**Date:** 2026-08-15

The track close-out (spec §7 PR 10). Blocked-by CUL-10/11/12/13/14 (PRs 5–9) — **all shipped** (#646–#652). This is the last PR of the Signals v2 track (B-755): the consolidated `nyx-voice` + `clinical-guardrails` copy/safety pass over every string the track added, the S10 receipt-assignment audit, the `pm-feature-review` re-run, the `signals_v2` beta-shelf row, the full flag-on on-device QA script, the **single gated `generate-signal` redeploy** (prepared + handed off — see §Deploy), and the GA recommendation to the PM.

## What shipped in this PR (code)

- **`signals_v2` beta-shelf row** (`lib/betaFeatures.ts` + `app/settings/beta.tsx`): a fourth `BETA_REGISTRY` entry — **"Deeper signals"**, `serverCost: false`, its own `Activity` glyph (distinct from `signal_design_v2`'s sparkles — the two Signal betas the shelf deliberately carries, spec §0 D6). `serverCost: false` is load-bearing and documented at the row: the new engine lanes are computed **uniformly for every account** inside `generate-signal` (not per-cohort), so no server resource is spent per opt-in and the client render gate is sound under the widget precedent. `betaFeatures.test.ts` updated (length 3 → 4; the serverCost⇒server-gate rule stays vacuous by design).
- **No other code changes.** The copy/safety pass and S10 audit found nothing to fix (below) — the strings shipped guardrail-clean at their own PRs, and PR 10 confirms it holds across the track.

## The copy/safety pass (`nyx-voice` + `clinical-guardrails`) — clean

Every owner-facing string the track added was re-screened against both skills. Method: read the concentrated copy modules (`lib/signalCopy.ts`, `lib/signalWatching.ts`, `lib/patternsTiming.ts`, `lib/patternsTrial.ts`, `lib/trialResponseCounts.ts`, `supabase/functions/generate-signal/phrasing.ts` + `medContext.ts` + `photoComposition.ts`), then a mechanical scan of the rendered template strings for the three failure classes.

- **No exclamation marks** in any rendered template (`nyx-voice` Pattern 4). Scan clean.
- **No reassurance vocabulary** in any rendered owner copy (`clinical-guardrails` Pattern 6 / the never-reassure invariant). Scan clean — and the watching gap row, the timing bands, the trial count rows are all **two-sided** (a zero renders "0 · was 7", never an inverted "no empty-stomach vomiting" absence claim — G2).
- **No mechanism / syndrome words** in owner copy (G3). "empty stomach" / "bilious" / "reflux" / "BVS" appear **only** inside the guardrail-screen definitions and the code comments that explain why they're barred — never in a rendered string. The lane names the **timing band** ("6h+ after eating"), never the syndrome the vet infers from it.
- **Every new finding type is screened.** `validatePhrasing` (server) has an explicit branch for `empty_stomach_timing`, `timing_story`, `trial_response`, and `gap_shortening`, each applying the right screen set (`MECHANISM_RE` bars "empty stomach"/"bilious"; `TRIAL_VERDICT_RE` bars "working"/"helping"/"improvement"/"ruled out"/"clean" + kin on both the trial and gap lanes; `REASSURANCE_RE`/`CAUSAL_RE`/`FOOD_NAMING_RE` as appropriate). The universal glyph/percent screen (`hasBannedSignalVocabulary`) runs on every type. `phrasing.test.ts` pins the syndrome-name rejection, the trial-verdict rejection, and the gap-verdict/cause/reassurance rejection.
- **The `serverCost:false` beta blurb** ("Deeper signals" — "A closer read of your logs — how symptoms line up with the timing of meals, how a diet trial's counts compare with before, and what each pattern still needs before it surfaces.") is count-anchored, warm, no exclamation, "compare" not "working"/"improving" (no verdict), no attribution — same contract the lanes ship under.

**Verdict: no copy changes needed.** The track's strings are guardrail-clean and test-pinned.

## S10 receipt-assignment audit — clean

Against B-721's S10 ("a receipt must earn its place — carries something the sentence can't") and S1 ("safety card faces carry no evidence graphic"):

- **All four new finding types are `priorityClass: 'insight'`** (verified in `detection.ts`), never safety. So S1 is not implicated — safety card faces stay plain, unchanged by this track. The new insight receipts render only inside the flag-gated `TimingStoryBody` / `TrialResponseBody`, which safety findings never reach.
- **Each new receipt earns its place:** the A2 three-band Shape-C compare decomposes the timing into bands the sentence can't carry; the trial card's two per-phenotype count rows decompose the pooled sentence into rapid/long (the compared pair); the expand lanes carry per-episode distribution + clustering the face doesn't. The for-your-vet relay was explicitly written to **lead with the fact the face hasn't shown (the early-morning clustering) rather than reprint the band counts a fourth time** — S10 was actively applied during the build (comment at `signalCopy.ts` `timingStoryVetLine`).
- **`CardFaceReceipt` keeps the shipped types sentence-only where S10 requires** (correlation/intake/reflection) and the comment pins "S1 safety faces stay plain."

**Verdict: no S10 violations.** No strip duplicates its sentence.

## FR-FLAG / G10 verification (deploy safety)

- **FR-FLAG-2 (byte-identical off):** flag-off renders the shipped surface — snapshot-pinned across the track's PRs; `InsightCard` / `SignalZone` suites green (1001 client tests pass on the current tree).
- **FR-FLAG-3 (seed first):** migration `057_signals_v2_config` is **applied live** (confirmed via `list_migrations`), flag seeded dark (default nobody).
- **G10 unknown-type contract:** `InsightCard.test.tsx` pins that a finding type with no registered renderer renders **null** (both flag branches) with a positive control — so the shipped/flag-off client **safely drops** any new finding type the server emits. This is the precondition that makes the redeploy safe for every non-eligible account.

## Deploy — the single gated `generate-signal` redeploy (prepared, handed off)

**Status: prepared and verified; execution is a Codespace/PM action (see below), deliberately not run from this cloud session.**

- **Verified bundle:** `scripts/deploy-edge.sh generate-signal` → `.edge-build/generate-signal/index.ts`, **162,788 bytes**, sha256 `a64c38d2f77cfb5103836ea0231a3a9fda8f74aa4f91997ef8e20739b517457c`. Bundle step ran the server suite: **498 deno tests pass**; `node --check` valid.
- **Currently deployed:** `generate-signal` **v27**, sha `c71aa9af…`, `verify_jwt: true` — the pre-track version. The four lanes (L1–L4) + `timing_story` composition + the episode-set-aware suppression fix are merged in the repo but **not yet live** — this is their first and only deploy (G10).
- **Why not executed here:** the bundle is **159 KB**, well over the MCP-inline `deploy_edge_function` safe ceiling ("a few tens of KB" — CLAUDE.md/edge-deploy-runbook), and this cloud session has **no `SUPABASE_ACCESS_TOKEN`**. Per the repo's own documented workflow, **large-function deploys run from the Codespace** with the token (`scripts/deploy-edge.sh generate-signal --deploy`). This is the standing procedure for a function this size, not a punt.

**Deploy procedure (Codespace, with `SUPABASE_ACCESS_TOKEN` set):**
```bash
scripts/deploy-edge.sh generate-signal --deploy
```
Then verify per the runbook:
1. `list_edge_functions` → `generate-signal` shows a version bump (28) + `ACTIVE`, `verify_jwt` still `true`.
2. Read the deployed source back; its sha256 matches the bundled artifact.
3. Boot smoke-test: an authenticated call with a bogus pet id returns a clean 4xx, not `WORKER_ERROR`.

**Two server-affecting decisions the PM/Dr. Chen should rule BEFORE the deploy, so it stays a single redeploy** (both are decision briefs — see §GA & open decisions). If the PM accepts the merged behaviour as the v1 default (both passed their gates), the bundle above is final and can deploy as-is.

## Flag-on on-device QA script

**Prerequisites (PM, one-time):**
- **0a.** Deploy `generate-signal` (above) — the server must emit the new finding types before the Signal *cards* can appear. (The Patterns panels, watching rows and trial-strip line render from **local** data and need no deploy.)
- **0b.** Allowlist your account for `signals_v2`: add your user id to the flag's allowlist in `app_config` (same mechanism as `widget_enabled` / `signal_design_v2` — an `app_config` UPDATE).
- **0c.** In the app: **Settings → Beta features → "Deeper signals" → on** (the opt-in, Gate 2). Being allowlisted alone turns nothing on.
- **0d.** Reload (`r` in Metro).

```
### Manual QA — Signals v2 (flag-on)
1. Beta shelf: Settings → Beta features → "Deeper signals" card is present, with a pulse glyph and a "Beta" pill → toggle on → it persists across a reload. (AC: beta-shelf row; two-gate opt-in)
2. Flag-OFF control FIRST (toggle "Deeper signals" OFF): Home + Insights look exactly as they did before the track — no timing card, no trial card, no watching rows, no Patterns "Timing"/"The trial so far" panels. (AC: FR-FLAG-2 byte-identical off)
3. Toggle back ON. Insights (Patterns) → open "Timing": every timed vomit episode is a dot on the ate·30m·1h·2h·4h·8h+ axis, the three band counts beneath, untimed episodes shown as a count (never imputed). (AC: §4.5 Patterns; no deploy needed)
4. Insights → "The trial so far" (with an active diet trial): per-phenotype rows + diet-structure rows + a "shows what, not why" line; a zero-vomiting trial does NOT render "0 · 0 · 0" (section drops / discloses burden). (AC: §4.5; the trial zero-wall fix)
5. Home, young/sparse account (below the lane floors): the watching rows read "Timing — N of the 6 timed episodes a pattern needs", "Change, week to week — needs 2 full weeks…", and the escalate-only gap row only if gaps are shortening — plus the safety-floor line "If something needs attention sooner, it won't wait for the week." No "log more", no streak language. (AC: §4.4 / G8)
6. Home, with a triggering timing record (≥6 timeable vomit episodes, several ≥6h after eating) + the deploy done: the A2 timing card — one card, three-band compare (every count printed), "N timed of M episodes · 60 days" sample line. Tap → per-phenotype dot lanes + the early-morning clock lane + the un-timeable-remainder line + the for-your-vet relay. No syndrome name, no "empty stomach" in the copy. (AC: §4.1 / G1/G3)
7. Home, with an active diet trial + the deploy done: the Signal trial card — pooled lead sentence + two per-phenotype count rows (two-sided "4 · was 8" / "0 · was 7"), "Day N of M" badge, "counted from days you logged". Tap → "Reading this stretch honestly" (fewer direction only) + "What else changed" (diet-structure in words, density disclosure). Nothing reads as a verdict on whether the trial is "working". (AC: §4.2 / G1)
8. Edge — an active medication course in a finding window: the "During an active {drug} course — {n} dose[s] logged" context line appears (a name with a "%" drops the line fail-quiet, never renders a bare/%-bearing name). (AC: §5.4 / B-733)
9. Sign out → sign back in (or new account): "Deeper signals" is OFF again (opt-in wiped). (AC: wipe parity)
```

Data note: cards 6–7 need real triggering records; where staging that is impractical on-device, the Patterns panels (3–4) and watching rows (5) verify the same underlying computations from local data. The full end-to-end **G4 photo-composition adversarial pass** (hair/bile/retained-food never reassures) is covered by the adversarial review below and the `photoComposition` deno suite; on-device it surfaces in the timing card expand (card 6) when photographed episodes exist.

## Reviews

### Adversarial G1–G10 falsification (track-level AC, spec §9) — G1–G9 HELD, G10 + deploy FAIL

The DoD falsification standard: every guardrail demonstrated with a concrete counterexample attempt. **G1–G9 each survived a stated counterexample** (the track-level AC on the guardrail spine is met). **G10 and the two deploy-safety properties FAIL** — the engine is flag-independent while `signals_v2` gates only the client, so the redeploy is not byte-identical for flag-off accounts.

| G | Counterexample tried | Result |
|---|---|---|
| G1 no attribution | Trial pet whose vomiting drops during the trial (the case most likely to leak causation) | **HELD** — direction-neutral lead + "worth reviewing with your vet"; expand carries `TRIAL_RTM_CONFOUND` ("can't yet say which one mattered"); timing lanes name only the band; every new finding `associationalOnly: true`. |
| G2 absence only D2-gated | Empty-stomach 0 during trial vs 7 before | **HELD** — renders two-sided "0 · was 7"; the absence *sentence* is not shipped (D2 open); no bare "no episodes"-as-wellness reachable. |
| G3 no syndrome/mgmt/probability | Grep the lanes + templates + client copy | **HELD** — `MECHANISM_RE` bans bilious/empty-stomach/regurgitat/reflux; templates are template-only + tested to never emit them; no bedtime-snack/feed-more suggestion anywhere. |
| G4 photo never reassures | A hair-present record that could read "just hairballs, fine" | **HELD** — present-only at emit (`count≥1`) AND re-guarded at the cache read; "Hair: 0 of N" structurally unrenderable. |
| G5 gap lane escalate-only | Lengthening `[2d,3d,4d,6d]` + flat `[3d,3d,3d,3d]` + shortening `[6d,4d,2d,1d]` | **HELD** — first two silent, only the shortening fires; no "widening/settling" finding exists. |
| G6 n=1 anchoring | Every new constant | **HELD** — `longGapHours=6` (feline gastric-emptying lit), `runLength=4`/`baseRateAlpha`/`minLongGapFraction` (property-sweep-locked, CI-gated), `trialBaselineDays=49` (product), `suppressionOverlapFraction`/`gapShorteningRatio` (owned+adversarial-gated); each disclaims Nyx-tuning. |
| G7 demo pets out | Look for production-data calibration | **HELD** by construction — sweeps are seeded synthetic nulls, fixtures authored, zero production ingestion, per-pet client-side Patterns (stronger than pet-id exclusion; a future cross-pet analytics query must add it). |
| G8 watching register | Read every `WATCHING_*` string | **HELD** — have-vs-need, no imperative/streak/reward/"a card is coming"; safety floor unconditional. |
| G9 one predicate | Look for a second meal-timing derivation | **HELD** — ⑤'s inline logic deleted, ⑤+L1+client all read `classifyEpisodeSet`/`lib/mealTiming`. (Minor note: the gap lane's collapse uses server `toEpisodeOnsets` vs client `collapseEpisodes` — documented identical, a latent drift point, not a break.) |
| G10 flag-off drops new types | Feed a new-engine output to a flag-off renderer | **FAIL — see below.** The registry null-guard prevents a *crash*, but "safely drop" is necessary-not-sufficient: the composition **mutates existing findings**, so flag-off output is not byte-identical. |

**The deploy-blocking finding (filed B-774, Now):** the composition layer changes what flag-off accounts see, because `signals_v2` gates only the client while the engine runs uniformly:
1. **⑤ `postprandial_timing` vanishes on ⑤+L1 co-fire** — `composeTimingStory` (`detection.ts:6071`) removes both sources, emits `timing_story`, which the flag-off client drops (`SignalZone.tsx:303`). The co-fire is the *designed* A2 case, so it hits the target users.
2. **⑥ newly suppressed for the empty-stomach cat** — `suppressTimeOfDayWhenPostprandial` (`detection.ts:5994`) now unions L1's long onsets, so L1-fires-⑤-silent suppresses ⑥ with no L1 replacement flag-off → the clock card vanishes, toward silence (the *wrong* direction).
3. **Reflection card + summary clause displaced** by the 4-insight `VISIBLE_CARD_CAP` when `trial_response` (band 1) is added.
4. Client edges from the same root: the blank `live` stack when only-v2 findings (`SignalZone.tsx:299`, an acknowledged "accepted edge until PR 10"); `gap_shortening` unhandled by `isSignalsV2Finding` + no renderer (stray divider, flag-on too).

Root cause: the composition assumes the v2 cards render in the displaced cards' place, but the gate is client-only; a ⑥ removed server-side can't be reconstructed client-side. **The redeploy would regress the live Signal for the entire base at deploy time (flag default nobody).** Not patchable within a copy-pass PR — needs a dedicated server-side fix + its own adversarial re-pass (options in B-774). No CI test currently feeds new-engine output to a flag-off renderer; that cross-deploy byte-identical test is part of the fix.

### pm-feature-review re-run — SHIP-SHAPED except the trial card (NEEDS-WORK)

- **A2 timing card · watching system · both Patterns panels · trial strip line — SHIP-SHAPED.** Pets > $ fully held (gated by the beta flag, no paywall, no upsell); voice/absence-≠-wellness clean; the watching register has no nag/streak/promise and the safety floor survives every render; the Patterns panels are genuinely clinical-grade (untimed disclosed as a count, never imputed; no zero-wall all-clear).
- **Trial Signal card — NEEDS-WORK (blocking, B-766, Now, still open).** The pooled lead ("4 in the trial · 20 before") doesn't foot with the two count rows ("0 · was 7" + "4 · was 8" = 15, not 20) — the mid-band + untimeable episodes are dropped with no on-face denominator, unlike the sibling A2 card. On the wedge's trust surface, "the numbers don't add up" is how a reactive owner stops trusting the numbers. Needs a PM ruling (deviates from the ratified 2-row mock — mock-what-you-change), not a silent edit.
- Live at the gate, now filed: the "4 vs 20" magnitude over-read over unequal windows (**B-775**), the watching-gap-row legibility nuance (folded into **B-769**), band-label consistency (**B-776**). Already-open and confirmed: B-760, B-761, B-766, B-767, B-768, B-769.

## GA recommendation & open decisions

**Recommendation to the PM: HOLD. Do not deploy `generate-signal`, and do not GA `signals_v2`, yet.** FR-FLAG-5 makes GA an explicit PM ruling; this is the recommendation against calling it now, with the ordered path to get there.

What *is* ready: the copy/safety pass and S10 audit are clean; the beta-shelf row shipped; G1–G9 held under falsification; and four of the five flows (A2 timing card, watching system, both Patterns panels, trial strip) are SHIP-SHAPED. The track is close — but two hard blockers sit on the two things that matter most (the deploy itself, and the wedge's trust surface).

**Blockers, ordered (each a decision brief):**

1. **The redeploy would regress the live Signal for everyone (B-774) — deploy blocker.**
   - *Deciding:* how to make the engine's composition byte-identical for flag-off accounts before the single deploy.
   - *Options:* **(A, recommended)** gate the v2 composition (`composeTimingStory` + the L1-aware suppression + the v2 lane emission) server-side on the `signals_v2` **eligibility** allowlist — non-eligible accounts get byte-identical output; cost: the engine becomes per-cohort, so `serverCost` is effectively true and the beta-row rationale is revisited. **(B)** keep composition additive server-side (don't remove ⑤/⑥) and de-dup client-side flag-on — preserves `serverCost:false` but moves the merge to the client. **(C)** deploy simultaneously with GA (no flag-off accounts exist) — abandons the dark/beta rollout FR-FLAG mandates.
   - *Consequence:* whichever wins is a dedicated server PR with its own `adversarial-reviewer` re-pass + a new cross-deploy flag-off byte-identical test. The deploy waits on it. (A) is the smallest change that preserves the ratified rollout; it needs the PM to accept the serverCost re-characterisation.

2. **The trial card's numbers don't foot (B-766) — GA blocker for the wedge flow.**
   - *Deciding:* how the trial Signal card reconciles its pooled lead with the phenotype rows.
   - *Options:* a self-reconciling third "other" row (`pooled − rapid − long`); an A2-style expand remainder line; or an on-face "N timed of M" denominator. Deviates from the ratified 2-row mock → PM ruling + mock-what-you-change.
   - *Consequence:* client-only (the payload already carries the fields); unblocks the wedge's trust surface. Should be re-rendered in the mock round.

3. **Three server-template calls to settle before the single redeploy** (so it stays single — each touches `phrasing.ts`/`detection.ts`, which the deploy bundles):
   - **The FEWER direction (from PR 3/CUL-8):** ship the reduction finding density-gated as merged, or restrict to escalate-only v1? The merged code passed adversarial review but carries a named ~14–35% false-`fewer` residual from symptom-logging attrition — a Dr. Chen call.
   - **The "two kinds of time" lead (from PR 5/CUL-12):** restore the mock's lead phrasing — a server-template copy change (also resolves the A2 S10 near-dup, where the sentence reprints two of three band counts). Needs a screenshot/Designer+PM call; not applied here (mock-what-you-change).
   - **The magnitude over-read (B-775):** normalise/annotate the "N vs M" over unequal windows — Dr. Chen.

4. **Watching-copy GA-gaters already filed Now:** B-768 (improving-pet Timing-row frame + "timed episodes" jargon), B-769 (gap row under the "still needs" umbrella + the shrinking-is-accelerating legibility nuance). Both "resolve before PR 10 flips the flag."

**The path to GA:** fix B-774 (server PR + adversarial re-pass) → rule B-766 + the three §3 server-template calls → **one** `generate-signal` deploy from the Codespace (`scripts/deploy-edge.sh generate-signal --deploy`, verified per runbook — bundle `a64c38d2…`, rebuilt after the above land) → allowlist a dogfood cohort via the beta shelf ("Deeper signals") → run the flag-on QA script on-device → clear B-768/769 → **then** the explicit GA ruling retires the flag (FR-FLAG-5).

**Non-blocking / deliberately deferred:** D2 absence-shaped trial *sentence* (count-rows ship; sentence is a future additive upgrade — CUL-17); `runLength` 4-vs-5 (4 is the shipped recommended default; ≤1 constant); B-760/761 (A2 base-rate counterbalance + dense lane); B-772/773 (watching-lane coverage). None block GA.

## DoD

- [x] **Copy/safety pass** (`nyx-voice` + `clinical-guardrails`) — clean across the track; no changes needed; `validatePhrasing` screens every new lane type; mechanical scan for `!`/reassurance/mechanism in rendered copy came back empty.
- [x] **S10 receipt-assignment audit** — clean; all four new finding types are `insight`-class (safety faces stay plain, S1 untouched); each receipt carries distribution/compared-pairs the sentence can't. One A2 near-dup flagged to the "two kinds of time" lead call (non-blocking).
- [x] **Beta-shelf row** — `signals_v2` "Deeper signals" added, `serverCost: false` with rationale; `betaFeatures.test.ts` updated (15/15); a distinct glyph; tsc clean; 1016 client tests green (1001 track + 15 beta).
- [x] **Flag-on QA script** — written (above); honest about the deploy + data prerequisites.
- [x] **Adversarial G1–G10 falsification** (track-level AC) — run; G1–G9 held with stated counterexamples; **G10 + deploy FAIL → B-774 (deploy blocker).**
- [x] **`pm-feature-review` re-run** — run; four flows SHIP-SHAPED, trial card NEEDS-WORK (**B-766**).
- [x] **Deploy bundle** — built + verified (498 deno tests pass; sha `a64c38d2…`); **execution held** (B-774 blocker + Codespace-token requirement for a 159 KB function).
- [x] **GA recommendation** — HOLD, with the ordered path (above).
- **Persona sign-off:** Data/Adversarial ✓ (G1–G9 held; G10 FAIL surfaced) — Designer/PM-review ✓ (4 flows ship-shaped; trial card held) — Dr. Chen — pending on the three §3 server-template calls — Eng ✓ (bundle verified; B-774 architecture call surfaced) — QA ✓ (flag-on script + the ACs). 
- **Adversarial review (mandatory):** stated counterexamples per guardrail above; the falsification *caught the deploy-safety regression the build conversation was too close to see* — exactly the DoD's purpose.
- **Tests:** N/A for the beta-row copy beyond `betaFeatures.test.ts` (updated); no other code changed. tsc clean; server suite green (498 deno via the bundle step).

## Documentation updates

- **`docs/backlog.md`** — filed **B-774** (deploy-blocking flag-off byte-identical violation, Now), **B-775** (trial pooled magnitude over-read, Next), **B-776** (band-label consistency, Later); augmented **B-769** with the gap-row legibility nuance.
- **STATUS.md** — updated inline (PR 10 shipped; the GA/deploy HOLD + B-774 recorded).
- **Spec (`docs/nyx-signals-v2-requirements.md`)** — a proposed §5 amendment is flagged for PM approval: the "server additions computed uniformly / client gate sound / `serverCost:false`" premise is **falsified by the composition layer** (B-774); the resolution (option A/B/C) rewrites §5's rollout model. Not written unilaterally — awaits the B-774 ruling.
