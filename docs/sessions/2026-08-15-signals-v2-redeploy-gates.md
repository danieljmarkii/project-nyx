# Signals v2 (B-755) — the four remaining `generate-signal` redeploy gates, settled

**Date:** 2026-08-15 · **branch** `claude/signals-v2-redeploy-gates-55hdnj` · **shipped via #<PR>** (draft)

Clears the last gates on the single gated `generate-signal` redeploy for Signals v2, after B-777 (the flag-off byte-identical fix) landed via #659. Four calls, all touching `phrasing.ts` / `detection.ts` / the trial-card client, settled together so the redeploy stays **one** bundle rebuild. Read `docs/sessions/2026-08-15-signals-v2-pr10-closeout.md` §3 + the B-766/B-775 backlog rows for the tee-up.

**All four are provisional — PM/Dr. Chen sign-off is owed before the deploy runs.** The deploy is held on that sign-off; nothing here ships to an owner until the PM runs `scripts/deploy-edge.sh generate-signal --deploy` from the Codespace. Every gate is presented below as a decision brief (the PM-directive format) so the PM/Dr. Chen can rule from the brief alone.

## What shipped (code)

- **`mid` band on `trial_response`** (`detection.ts`): the payload now carries `mid: {trial, baseline}` beside `rapid`/`long`, so the three bands PARTITION the timed-eligible episodes (`bandInWindow` widened to `'rapid'|'mid'|'long'`). Server-side, so it rides the single redeploy. Invariant `rapid+mid+long ≤ pooled` per window, property-locked in `detection.trialResponse.test.ts`.
- **`templateTrialResponse`** (`phrasing.ts`) — B-775: both windows in days (not "7 weeks") + a ", a longer stretch" clause when `baselineDays ≥ trialDays × 1.5`.
- **`templateTimingStory`** (`phrasing.ts`) — the "two kinds of time" lead: names the bimodal shape in words + the long-band clock cluster; band counts dropped (the receipt carries them — S10).
- **`trialResponseCompareRows` + new `trialResponseTimedReconciliationLine`** (`lib/signalCopy.ts`) — B-766: three band rows + the un-timeable reconciliation line so the face foots with the pooled lead; old caches (no `mid`) fall back to the pre-B-766 two-row face.
- **`trialResponseStandingLine`** (`lib/dietTrialCard.ts`) — B-775 mirror on the Home trial strip.
- **`TrialResponseBody`** (`components/home/InsightCard.tsx`) — renders the reconciliation line + folds it into the a11y label.
- **FEWER direction: no code change** (ruled ship-as-merged; see brief 2).

`lib/signal.ts` `TrialResponseFinding.mid` is **optional** (client, old-cache tolerant); `detection.ts` `TrialResponseFinding.mid` is **required** (the server always emits it).

## The four decision briefs (PM / Dr. Chen)

### 1 · B-766 — the trial card's numbers must foot (Designer/PM)
- **Deciding:** how the Signal trial card reconciles its pooled lead ("4 in the trial · 20 before") with the phenotype rows, which summed to less than the lead (mid + un-timeable dropped, no disclosure) — "the numbers don't add up" on the wedge's trust surface.
- **Options:** **(A, shipped — recommended)** full A2 parity: add a `mid` band → three rows partition the *timed* episodes + a "Timed to a meal: 4 of 4 in the trial · 18 of 20 before" line discloses the un-timeable remainder, so rows + remainder = the pooled lead. The sibling A2 card (the consistency target B-766 names) decomposes the same way. · (B) a single "other" row `pooled − rapid − long` — client-only, no `mid` field, but conflates the *timed* mid band with un-timeable episodes (less honest). · (C) change the lead to be over the *timed* set like A2 — loses the pooled "total vomiting" wedge headline.
- **Consequence:** (A) needs the `mid` payload field (rides this redeploy) + the client rows; rendered in mock §04 (before/after numbers). Deviates from the ratified 2-row mock → this is the Designer/PM ruling that authorizes it (mock-what-you-change).

### 2 · The FEWER direction — ship as merged, or escalate-only? (Dr. Chen)
- **Deciding:** whether the event-driven trial card fires on a *reduction* in vomiting (density-gated, as merged), or only on a *rise* (escalate-only v1). The merged code carries a named ~14–35% false-`fewer` residual from symptom-logging attrition, which no detector can remove at this data.
- **Options:** **(A, ruled — recommended) ship as merged**, no code change. The one fact that decided it: under escalate-only the reduction is **not** removed from the product — it still renders on the standing strip line + the Patterns panel (per the mock §04 interlock) — so escalate-only leaves the attrition residual on those surfaces while deleting the *one* trial surface that carries the RTM/confound honesty expand ("a calmer stretch can't yet say which one mattered… calm stretches also happen on their own"). The card is a multi-sample cross-incident read (which the never-reassure rule permits to reassure *only if careful*), it never verdicts, and it routes to the vet — so escalate-only's marginal safety gain is small, its wedge cost (the #1 asked-for feature) large. · (B) **escalate-only** (`changedMaterially = gate && moreDuringTrial`) — one line, removes the residual from the *card* only.
- **Consequence:** (A) is the shipped default and needs no code; (B) stays a documented one-line switch if Dr. Chen weights the event-driven card's prominence above the wedge value. This is genuinely Dr. Chen's weighting call — neither option "holds" against attrition (it's the app-wide didn't-log ≠ didn't-happen limit); the question is only whether the *most prominent* surface may show a `fewer`.

### 3 · The "two kinds of time" lead (Designer/PM, screenshot)
- **Deciding:** whether the A2 timing card's lead names the bimodal shape in words (restoring the round-1 framing) or keeps the as-built two-count list.
- **Options:** **(recommended, shipped) restore the shape lead**, S10-clean: "keeps two kinds of time — some soon after eating, and some a long time after, N of them between 4am and 8am." The band counts move OUT of the sentence (the three-band receipt on the face already prints them — restating them violated S10), and the sentence instead carries the one fact the receipt can't show: the early-morning clock cluster. · (alt) keep the as-built count list.
- **Consequence:** a server-template copy change (`templateTimingStory`, rides this redeploy); resolves the S10 near-dup the closeout flagged. Rendered in mock §03 R2-3 (as-built vs restored, side by side). PM/Designer sign-off on the exact wording; §4.1 spec edit flagged (lead is now shape-anchored, not "count-anchored").

### 4 · B-775 — the "N vs M" magnitude over unequal windows (Dr. Chen)
- **Deciding:** the honest form for a trial-vs-baseline count comparison over unequal windows — "4 vs 20" over a 20-day trial vs a 49-day baseline reads as a ~5× fall when the underlying rate roughly halved, and the error is always in the reassuring direction when the count falls (clinical-guardrails / intake-is-not-preference).
- **Options:** **(recommended, shipped) annotate the windows inline** — both counts in the SAME unit (days, not "7 weeks") + a ", a longer stretch" cue when the baseline covers materially more time; kept because it stays COHERENT with the C-test gate (which fires on the full 49d baseline with its window-length offset — the display must tell the same story the card fired on). · (alt-1) normalize to a common window (compare the trial against an equal-length recent baseline slice) — removes the over-read structurally but risks the display contradicting the fire-window, and uses a thinner/noisier baseline. · (alt-2) render a comparable rate — introduces a per-day rate the whole surface deliberately avoids (dishonest under uneven logging).
- **Consequence:** copy-only (`templateTrialResponse` + `trialResponseStandingLine`, rides this redeploy), direction-neutral, no new payload field. Dr. Chen ratifies the exact wording. Rendered in mock §04.

## Deploy — the single gated redeploy (rebuilt, handed off)

- **New bundle:** `scripts/deploy-edge.sh generate-signal` → `.edge-build/generate-signal/index.ts`, **164,506 bytes**, sha256 **`8ea9763293fa9991fdbbd8077455a5b4d7a472dced015eb46bcf94109fb5d616`**. `node --check` valid. Supersedes both the PR-10 `a64c38d2…` bundle and the B-777-era bundle.
- **Server suite:** 505 `generate-signal` deno tests pass; full deno suite (all functions) green; full jest 5258 pass; `tsc --noEmit` clean.
- **Execution is the Codespace/PM action** (164 KB > the MCP-inline `deploy_edge_function` safe ceiling, and this cloud session has no `SUPABASE_ACCESS_TOKEN`): `scripts/deploy-edge.sh generate-signal --deploy`, then verify per `docs/edge-deploy-runbook.md` (version bump + ACTIVE, `verify_jwt` still true, read-back sha matches `8ea97632…`, JWT'd bogus-pet-id boot smoke → clean 4xx). **Hold the deploy on the PM/Dr. Chen sign-off above.** `generate-signal` is NOT under the B-494 report hold.

## Reviews

- **`adversarial-reviewer` (DoD-mandatory for the clinical/statistical logic):** _<PENDING — folded in when the background review returns; it was asked to break the mid-partition invariant, the FEWER ship-as-merged ruling, the B-775 cue coverage, and the two-kinds clock clause>._
- **Skills consulted:** `clinical-guardrails` (the trial card is multi-sample, so it may reassure *only if careful* — the FEWER ruling turns on that; every new template string is regex-tested, Pattern 8) + `nyx-voice` (no exclamation, plain language, no mechanism word, specific-over-generic).

## DoD

- [x] **Types** — `tsc --noEmit` clean; server `mid` required, client `mid?` optional (old-cache tolerant).
- [x] **Tests** — full jest 5258 pass; 505 generate-signal deno + full deno suite green. New coverage: the 3-band rows + old-cache fallback + the reconciliation line (`signalCopy.test.ts`), the B-775 matched-unit + no-cue-when-longer-trial cases (`dietTrialCard.test.ts`, `TrialStrip.test.tsx`), the two template rewrites incl. the clock clause + S10-no-count assertions (`phrasing.test.ts`), the `mid` emission + partition invariant (`detection.trialResponse.test.ts`).
- [x] **Anti-patterns** — theme tokens only (no mock CSS changes); no `%` on a Signal card (B-733 holds); no mechanism word in any rendered string (G3); direction-neutral (no "more"/"fewer"/"down").
- [x] **Bundle** — rebuilt + verified (sha `8ea97632…`); execution held (Codespace/token + PM sign-off).
- [x] **Mock** — `docs/culprit-signals-v2-mockups.html` updated + re-published to the same artifact URL (§03 R2-3, §04 trial frames, the FEWER ruling callout, mast banner).
- [ ] **Adversarial review** — running; result to be folded in.
- **Persona sign-off:** Data/Adversarial — pending the background pass · Dr. Chen — pending (briefs 2 + 4 are his calls) · Designer/PM — pending (briefs 1 + 3, mock rendered) · Engineer ✓ (bundle verified, one-predicate held) · QA ✓ (suites green, ACs above).

## Documentation updates

- **`docs/backlog.md`** — B-775 + B-766 marked **Ruled (provisional)** with the resolution; **B-765 marked Done** (the §04 mock labels were fixed in the same mock pass).
- **STATUS.md** — the two Signals-v2 deploy-gate clauses updated inline (gates settled, bundle rebuilt to `8ea97632…`, remaining = PM/Dr. Chen sign-off + the deploy run).
- **Spec (`docs/nyx-signals-v2-requirements.md`)** — proposed edits **flagged, not written** (Tier-2 protocol, and the rulings are provisional): §4.1 the A2 lead is now *shape-anchored* (+ clock fact), not "count-anchored" (S10); §4.2 the trial card face is the *three-band* partition + reconciliation, and its lead carries the B-775 matched-unit form; §2 L2 records the FEWER = ship-as-merged ruling (escalate-only the documented alternative). Await PM approval to write.
