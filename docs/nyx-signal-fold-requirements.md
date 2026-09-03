# Culprit — The Signal Fold (Home v1) Requirements

**Version:** 1.0 (**BUILD-READY** for PR 1; PR 2 gated on the PM ratifying DF-2) · **Date:** 2026-09-03 · **Owner:** Sr. Product Designer (design authority), Dr. Chen (clinical conditions), ratified through the fold mock round 1 · **Track:** CUL-695 (The Living Signal), direction **F3 "Seen & fold"**, re-scoped by the PM on 2026-09-03 as **Home v1** — the minimize/expand, rolled out to all accounts, built now; **Home v2** (the re-imagination) is the *Home Redesign — Conference Spike* project and is not this document.
**Provenance:** the 2026-09-03 session record (`docs/sessions/2026-09-03-home-signal-fold-v1-and-home-v2-alignment.md`: the PM's dogfood feedback verbatim, four isolated persona interviews, the Designer's build-ready anatomy, Dr. Chen's conditioned ruling) · the research brief `docs/research/2026-09-home-insight-fold-and-freshness-patterns.md` · the earlier discovery `docs/sessions/2026-08-29-signal-freshness-discovery.md` (PR #736) · the design authority for the fold frames `docs/culprit-home-signal-fold-mockups.html` (round 1, same-URL republish from here).
**This doc composes with — never modifies — `docs/nyx-signal-home-requirements.md`** (the shipped Signal surface: spine S1–S10, the Change Contract, receipts A/C). Every rule there still binds; this document adds one thing to that surface — a reader's memory of what they have seen — and nothing else. **No detection, threshold, ranking, or safety-composition change anywhere in this track.**

---

## 0. Decision record

| # | Decision | Ruling | Status |
|---|---|---|---|
| DF-1 | Scope + rollout | **v1 = the fold, all accounts, no beta flag** — a direct iteration on the GA'd surface (PM, 2026-09-03: "roll it out to all accounts"). The flag question Eng registered at the rung-1 kickoff is answered by the PM's phasing. The default state (nothing folded) renders the shipped surface unchanged. | PM-ruled |
| DF-2 | **D1 — may a safety card fold?** | **Yes, for the STANDING safety class only, and only to a sticky strip that keeps the ask.** `symptom_chronicity` + `symptom_worsening` fold; the ACUTE class — `intake_decline`, `incident_red_flag` — never folds (an acute card asks for an action today and is retired by the record, not the reader). Dr. Chen moved from (b) to this conditioned (c) after the interviews (§2 conditions, all binding); the Designer's (b′) is the same ruling stated from the other side. The recorded Designer↔Dr. Chen conflict is **closed by the personas themselves**; the PM ratifies or vetoes. | **Recommended — PM ratification pending (gates PR 2 only)** |
| DF-3 | The fold control | **An explicit text button, `Keep it compact`, in the EXPANDED state only** (a sibling of the row `Pressable`, never nested in it). Never a swipe (reads as delete — Jordan, Sam), never the face tap (already means "show the evidence"). "You fold what you have opened": every fold is a stated acknowledgment by construction, which is what makes DF-2 safe. The face-meta-row placement was drawn as the alternative (mock §03) and is **PM-vetoable**. | Designer, owners ✓ · PM-vetoable |
| DF-4 | What re-opens a folded card | **A material change in the finding, judged CLIENT-SIDE in v1 from the cached payload** (the per-type table in §5.3, property-tested), never a clock. A `changeToken` emitted by `generate-signal` is the v2 migration: when present it wins, the client table becomes the fallback. Designer↔Data Scientist conflict recorded (§10) — recommendation: ship v1 on the client table so the PM's fix does not queue behind an engine deploy. | **Recommended — PM decision (does not block PR 1)** |
| DF-5 | No time-based re-open | **None.** The detector is already the timer, calibrated to the disease: an ongoing course produces its next episode within `ongoingRecencyDays` (14; 28 for cough) or the engine stops calling it ongoing — so every ongoing course re-opens on its own next episode. A calendar trigger is nagging without information (Dr. Chen; Jordan: "a fold that comes back because a timer ran out" is on the hate list). | Dr. Chen ✓ |
| DF-6 | Persistence | **Device-local, per pet, per finding, one AsyncStorage key, wiped by name on sign-out, not synced.** A fold is a fact about a reader, not the record; the spouse's phone folds independently; a reinstall may un-fold (accepted, harmless direction). | T&S ✓ · Eng ✓ |
| DF-7 | Order and canvas | **A fold changes height, never position.** Render order stays the server rank; a folded safety strip stays atop the safety band, above every benign card. **The lead canvas is not inherited**: `isLead` stays bound to rank 0; if rank 0 is folded, no card wears the Newsreader canvas (promoting a benign card because the safety card folded is reassurance by layout). | Designer ✓ · Dr. Chen ✓ |
| DF-8 | The "Back because" cue | **Yes** — one `textXS` line above a re-opened card naming why it came back, folded into the card's a11y label, cleared on the owner's next touch of that card or the next fingerprint change. Never a verdict word. | Designer ✓ |
| DF-9 | Out of v1 (registered, not dropped) | (a) the **labeled stand-down** when the detector goes quiet (today the card vanishes wordlessly — "reassurance-by-absence wearing an honesty costume"): a `generate-signal` change, own issue; (b) the **counted 4-week compare INSIDE the standing safety card** (expand + phone script), not a separate calm card — `detectReflections` is correctly muted while a symptom is chronic, so F2's "second slot" must not reopen that valve; engine + client + adversarial pass, own issue; (c) F4 care thread, F5 weekly review, F7 companion surface — CUL-695 D3–D5 as posed. | Filed (§8) |

---

## 1. What this fixes, in one paragraph

The Signal is built to say *what is true* and is opened daily by someone asking *what changed*. Rank is static by construction, so every mature account converges on the PM's screen: the same safety card at Newsreader size for six weeks while the record fell 4·6·8·4·4·4·4 → 2·0·1·1 underneath it. Three things stack — habituation (a hero that never changes trains the eye off the zone, and the next new safety finding inherits the blindness; second-exposure attenuation is measured, the avoidance transfers by position), the wrong half of Principle 3's question, and **no acknowledgment register**: the card cannot be told "I've read this", so the surface reads as not listening. "Boring" is the non-builder's word for that. **v1 gives the surface a memory of what this reader has seen.** v2 gives it a carrier for change. Neither touches detection, thresholds, ranking, or S1.

**The reframe the research forces.** A fold is a **collapse**, not a dismiss: the strip is the finding's *named home while compressed*, in place, at rank (every reversible hide in the 16 products checked has one; a hide with no listed home is a delete). And the safety half follows the shape shared by IEC 60601-1-8, Dexcom, Apple Watch and Oura Rest Mode: **acknowledge silences the modality; the condition governs the state; the policy is not the user's to set.** The fold silences the *size*; the record decides when the full card returns; the owner cannot make a safety card go away.

---

## 2. The fold spine — FS-1…FS-10 (binding on every PR here)

1. **Seen, never resolved.** A fold removes nothing, re-orders nothing, and is never read as an all-clear — not in copy, not in the a11y label, not in what the engine is told (the engine is told nothing).
2. **Standing folds; acute never.** Foldable = every benign type + `symptom_chronicity` + `symptom_worsening`. Never foldable = `intake_decline`, `incident_red_flag`. The distinction is class, not rank.
3. **The strip keeps the rail, the clause, the count — and on a safety strip, the ask and the last-episode date.** Rail at full opacity, never greyed. A safety strip that drops its ask fails the build (guarded like the med line).
4. **You fold what you have opened.** The control lives in the expanded state only; there is no fold gesture on the face and no swipe anywhere.
5. **Position is rank; a fold changes height only.** A folded safety strip never sinks under a benign card; the canvas is never inherited.
6. **The record re-opens the card; the calendar never does.** Re-open on a material change in the finding (§5.3). Not on a count that fell because the window slid, not on the 24h regen, not on pull-to-refresh, not on a timer.
7. **A different finding is its own card.** A fold on one finding never suppresses, delays, or compresses another; a new safety finding lands as a full card above the strips. Suppression (B-789) beats fold.
8. **Plainness survives the fold.** No chip, tint, check mark, "Seen" label, badge, or count of folded cards — on the strip, on the zone, on the tab.
9. **Nothing here animates by itself.** Owner-caused transitions use the shipped `LayoutAnimation` idiom (skipped under reduced motion); an automatic re-open lands before first paint, un-animated; the strip's count changing (a window aging) never animates.
10. **The reader's state stays on the reader's device.** Not synced, not exported, never on the vet report, wiped on sign-out. An "acknowledged" that reaches anything clinical is F4's own schema (owner-entered, dated), never inferred from a fold.

---

## 3. Anatomy, states, transitions

### 3.1 The folded strip
A row inside the Signal card's `LiveStack`, at the finding's rank, between the same hairline `Divider`s the faces use.

| Element | Spec |
|---|---|
| Rail | Unchanged: 3pt, `RAIL_COLOR[priorityClass]`, opacity 0.85, full row height. Read before a word; never dims on fold. |
| Clause (line 1) | `ThemedText`, `textSM` · `weightMedium` · `colorTextPrimary` · `lineHeightSM`. **No `numberOfLines`** — wraps, never truncates (C-8: an ask is never cut). Target ≤ 42 chars; worst-case fixture `skin irritation` + a 3-digit count. |
| Count line (line 2) | `sampleLine(finding)` verbatim (already guardrail-screened; the reflection keeps the face's density-withheld swap) · `textXS` · `colorTextTertiary` · `spaceMicro` below the clause. **Safety strips append the last-episode date**: ` · last logged {Mon D}` (§3.4). One source per fact, nothing stated twice (S10). |
| Chevron | The `TrialStrip`/`MedStrip` `›`: a raw `<Text>` (`geist-ok`), `textLG` · `colorTextSecondary`, right-aligned, its own node — never concatenated into the clause. |
| Dropped | The sentence, every receipt, every meta chip (`New` cannot appear on a strip — novelty re-opens the card), the med line, the linked-pair row, "Why we're showing this". |
| Geometry | `minHeight 44` · `paddingVertical: space1` (the `rowCompact` rhythm) → ~52pt typical, ~70pt worst-case wrap, against ~180pt for a lead canvas. Type drops two tiers: Newsreader 26 → Geist 15 → Geist 13/11. |
| Idiom | Borrows the compact register and chevron of `TrialStrip`/`MedStrip`, **not** their `Card` — it stays a row of the Signal. MedStrip §7 is the precedent with one divergence: MedStrip collapses by *record state* and may order expanded-before-collapsed (D8); the fold is by *owner action* and therefore never re-orders (FS-5). |

### 3.2 The three states
`face` (shipped) ⇄ `expanded` (shipped toggle, whole-row `Pressable`) → **`folded`** (new) → `face`.

- **face → expanded:** the shipped tap; unchanged.
- **expanded → folded:** the `Keep it compact` control (§3.3).
- **folded → face:** tap the strip (the strip is its own whole-row `Pressable`, `hitSlop 8`), or an automatic re-open (§5.3). Re-opening lands on the **face**, not the expanded state.
- **No face → folded shortcut** (FS-4).

Owner-caused transitions call the shipped `LayoutAnimation.configureNext(LayoutAnimation.create(theme.durationMedium, 'easeInEaseOut', 'opacity'))`; under `useReducedMotion()` the call is skipped and the swap is instant. An automatic re-open never animates (FS-9).

### 3.3 The control
A text button rendered **only in the expanded state**, as a **sibling** of the row `Pressable` (the MedStrip host-split — a button nested inside the row button is swallowed by VoiceOver and by the row's own `onPress`). `textSM` · `weightMedium` · `colorAccentInk` · `minHeight 44` · `hitSlop 8` · `alignSelf: 'flex-start'`. It sits in a control row beside `Hide details` (which moves out of the `Pressable` into the same sibling row) with `gap ≥ 16` (C-5: adjacent controls never share hit area; both carry `hitSlop 8`, so the facing slops sum to 16). Beneath the control, one `textXS` · `colorTextTertiary` caption (§4): *It comes back on its own when the picture changes.* — always, in the expanded state only, so sighted owners learn the contract without a zone-level line.

When F4 (the care thread) lands, its chip row replaces this control on safety cards: `Not yet` inherits this behaviour verbatim; `Booked` / `We've been` fold with state; **`Not yet` is never removed** — it is what keeps `Booked` honest (Jordan: owners will state a false action to get their screen back if it is the only exit).

### 3.4 The last-episode date (safety strips only)
The date of the most recent episode the finding counts, at **day precision in the device zone** (B-514: build the day from local components, never a UTC literal), rendered year-less — safe because the 56-day lookback bounds it (C-19). **Source of truth is the local record**: one SQLite read per safety strip, `MAX(occurred_at)` over the pet's non-deleted events of the finding's `symptomType` (the same query shape `getLocalSignalContext` uses), memoized on the hydration tick; the finding-derived approximation (`expiresAt − 24h − daysSinceLastEpisode` days) is the fallback when the local read fails. **A date, never a counter** — a ticking "N days since" on an always-visible strip is a countdown to relief; `recencyPhrase` stays in the expand and the phone script where it lives today.

---

## 4. Copy (verbatim; nyx-voice-governed — no `!`, no glyph, no `%`, no pet name on a strip; `{symptom}` = the shipped `symptomWord`)

Every clause and every composed line passes `hasBannedSignalVocabulary` at build (test-pinned per type), the way the med line does; a clause that trips the screen is a build failure, never a rendered fallback.

| Type | Clause (line 1) | Count line (line 2) |
|---|---|---|
| `symptom_chronicity` (firm) | `Recurring {symptom} — worth a vet visit` | `sampleLine` + ` · last logged {Mon D}` |
| `symptom_chronicity` (standard) | `Recurring {symptom} — tell your vet` | same |
| `symptom_worsening` | `{Symptom} up from last week — tell your vet` | `sampleLine` + ` · last logged {Mon D}` |
| `postprandial_timing` | `Timing — {symptom} within {rapidWindowMinutes} min of eating` | `sampleLine` |
| `empty_stomach_timing` | `Timing — {symptom} {longGapHours}h or more after eating` | `sampleLine` |
| `timing_story` | `Timing — within {rapidWindowMinutes} min of eating, and {longGapHours}h or more after` | `sampleLine` |
| `timeofday_clustering` | `Timing — {symptom} {localHourBand}` | `sampleLine` |
| `food_symptom_correlation` | `{Protein} — {symptom} tends to follow it` (a joint candidate names every member: `{Chicken and duck} — …`) | `sampleLine` |
| `reflection` | `Week over week — {symptom}` | `sampleLine` (density-withheld swap preserved) |
| `trial_response` | `Trial diet — day {trialDayNumber}` / `… of {targetDurationDays}` when set | `{pooledTrialCount} episodes during the trial, {pooledBaselineCount} in the {baselineWindowDays/7} weeks before` (time-ordered, direction-neutral) |
| `intake_decline` · `incident_red_flag` | **never fold** — no strip copy exists, by construction | — |

| Surface | String |
|---|---|
| Fold control | `Keep it compact` |
| Fold control caption (expanded state) | `It comes back on its own when the picture changes.` |
| Back-because — a newer episode / a count rose | `Back because a new episode was logged.` |
| Back-because — a new week's pair (reflection / worsening) | `Back because a new week's counts are in.` |
| Back-because — correlation tier early → established | `Back because this pattern is now established.` |
| Back-because — chronicity/worsening tier, or the cough↔vomit adjacency turning on | `Back because the vet ask changed.` |
| Back-because — trial counts moved | `Back because the trial counts moved.` |
| Strip a11y hint | `Opens this insight.` (the face keeps `Shows the evidence behind this insight`, so the two are told apart) |
| Control a11y hint | `Folds this insight to one line. It reopens on its own when the picture changes.` |

**Vetoed on any fold surface (Dr. Chen, standing):** Resolved · Cleared · All clear · Settled · Better · Improving · Quieter · Down · ↓ · % · "N days clear/free" · streak language · Dismissed · Hidden · Snoozed · Reminder · Seen (as a label) · Nothing new (as a zone line — absence copy on a Signal reads as an all-clear).

---

## 5. The fold store + the material-change contract

### 5.1 Storage (`lib/signalFold.ts`)
One AsyncStorage key, `nyx.signalFold`, holding one JSON object — **the `lib/signalArrival` shape**, for the same reason: a per-pet key prefix makes the wipe a `getAllKeys()` scan-and-filter, and a wipe that scans is a wipe that can miss. One key is one `removeItem`, asserted by name in `lib/session.test.ts`.

```ts
type FoldEntry =
  | { state: 'folded';   fingerprint: FoldFingerprint; foldedAtIso: string }
  | { state: 'reopened'; reason: BackBecauseReason;  atIso: string };
type FoldStore = Record<PetId, Record<FindingKey, FoldEntry>>;
```

Pure core + AsyncStorage shell (the `dailyRecapOffer` precedent): `foldIdentity`, `foldFingerprint`, `materialChange(prev, next)` and `reconcileFolds(store, findings)` are pure and unit-tested with no I/O; the shell reads once per pet on the cache read, writes on fold / touch / release, and carries the **clear-epoch guard** `signalArrival` ships (a read-modify-write on a blob can resurrect the previous account's map after `wipeLocalSession` — capture the epoch on entry, re-check before writing, abandon on a wipe). `clearSignalFold()` is wired into `wipeLocalSession` **by name** (the B-402 / FR-9 rule: account-adjacent device state must not carry to the next person on a shared device). Entries whose pet is no longer in the store are pruned on read.

### 5.2 Identity — the finding key (never `rank`)
`type` + the noun the sentence is about: `+symptomType` for every symptom-scoped type; `+proteins.sort().join('+')` for a correlation (`proteinCluster`, so a pre-slice-6 row keys on `[protein]`); `+incidentType` for a red flag (never foldable, keyed only so the table is total); `trial_response` keys on type alone (one per pet). A lone `postprandial_timing` that becomes a `timing_story` (L1 starts firing) is a **new identity** and renders open — correct: the card's shape changed.

### 5.3 Material change — what re-opens a fold (the per-type table; the engineer pins it with a property test)

The rule: *a field the sentence or the ask is built from, moving the way the pet moved* — a count that rose, a newer episode, a tier that changed, a member that joined, a new week's pair. **A window sliding an old episode out is not the pet changing and must not re-open the card.** Hence the asymmetry: counts are **increase-only**; tiers, booleans and directions re-open on **any** change.

| Type | Re-opens on | Explicitly NOT on |
|---|---|---|
| `symptom_chronicity` | `episodeCount` ↑ · **`daysSinceLastEpisode` ↓** (a newer episode — catches the net-zero day when a new episode lands as an old one ages out) · `activeWeeks` ↑ · `tier` change · `coughVomitAdjacent` turning on | `episodeCount` ↓ · `spanDays` · `symptomDays` · `daysSinceLastEpisode` ↑ · `windowDays` |
| `symptom_worsening` | `currentCount` ↑ · `currentDays` ↑ · `tier` change · `trigger` change | a week rollover that lowers the pair · `windowDays` |
| `food_symptom_correlation` | `tier` change (`Early pattern` → established) · `matchedPairs` ↑ · `symptomEventCount` ↑ · `jointCandidate` / `jointGuidance` change · a member joining the cluster (a new key ⇒ a new identity) | `correlationWindowHours` · `medContext` |
| `postprandial_timing` | `rapidCount` ↑ · `eligibleCount` ↑ · `lastTwoEligibleRapid` change | `medianMinutesSinceFeeding` · `eligibleMinutes` · `feedingFormsInEvidence` · `medContext` · `timingReliable` |
| `timeofday_clustering` | `clusterCount` ↑ · `eligibleCount` ↑ · `clusterStartLocalHour` / `clusterWindowHours` change | `timezone` · `medContext` |
| `empty_stomach_timing` / `timing_story` | any `bandCounts.*` ↑ · `eligibleCount` ↑ · `lastTwoEligible*` change · `clockCount` ↑ | medians · `photoComposition` (expand-only evidence) · `medContext` |
| `reflection` | `currentCount` / `priorCount` / `direction` / `density.comparable` — **any** change (the pair IS the finding; a new week's pair is a new fact) | `windowDays` |
| `trial_response` | `pooledTrialCount` / `pooledBaselineCount` / `comparisonDirection` / `rapid.trial` / `mid.trial` / `long.trial` — any change (the server already emits only on "changed materially") | `trialDayNumber` · `trialLoggedDays` · `treatShare` · `mealsPerDay` · `densityComparable` |

**Release rules.** (1) A folded finding whose key is **absent** from the new set has its entry **deleted** — so when it re-fires after standing down, it renders as a full card (Dr. Chen's trigger 4; without it the improving-then-relapsing course fails). (2) A release writes `{ state: 'reopened', reason }` so the face renders the Back-because line; the entry is deleted on the owner's next touch of that card or the next fingerprint change. (3) A `changeToken` on the payload, when `generate-signal` ships one (v2), is compared first; the table becomes the fallback for rows without one.

**The property test** (`lib/signalFold.test.ts`), per type: incrementing any listed count re-opens; decrementing every count with nothing else changed stays folded; flipping any listed tier/boolean/direction re-opens; for chronicity, a net-zero count with `daysSinceLastEpisode` decreased re-opens; an absent key deletes the entry; `materialChange` is a pure function of `(prev, next)` and never reads the clock. Run it red against a table with the asymmetry inverted before trusting it (C-18: a guard is proven by mutation).

---

## 6. Composition (`SignalZone` / `LiveStack`) and edge states

- **Order = `visibleFindings` (server rank after B-789 suppression), unchanged.** Each row renders `FoldedStrip` (entry `folded`), the face with the Back-because line (entry `reopened`), or the face (no entry). `isLead` stays `i === 0` on the *rank*, not the first unfolded card (DF-7). Dividers unchanged.
- **All cards folded:** the receded `Signal` label, the strips, the patterns doorway — nothing else. The zone may be that short; that is the fold working (Jordan: "it stops the shouting"). **No zone-level line** ("Nothing new" reads as an all-clear; S6 governs presence-gated quiet, and every finding here is present — the contract is taught by the control's caption instead).
- **Lead folded, a secondary open:** the secondary keeps its compact face; no canvas.
- **A new finding into an all-folded zone:** renders open at its rank (canvas if rank 0). No `New` chip is derived from the fold store in v1 (a reinstall would false-flag everything; the `New` chip's contract is CUL-629 / the engine's finding-set memory).
- **Suppression beats fold; the ack line (§5.3 of the Signal spec) renders above the strips; the arrival moment is unaffected** (a first-ever finding has nothing stored). A pet switch reads the new pet's entries — never the previous pet's (the `useSignal` render-time reset pairs `findings` with `petId`; the fold read keys on the same `petId`).
- **Cross-pet banner:** unaffected — it reads the other pet's *findings*, not this device's fold state; a folded chronicity on pet A still raises A's banner on pet B's Home.
- **Offline / cache unreadable:** the last rendered state holds; fold entries are not touched on a failed read (never release on a read that did not answer — C-12).

---

## 7. Accessibility

- **Strip:** `accessibilityRole="button"`, label `"{clause}. {count line}."` (the safety strip's label therefore says the ask and the date: *"Recurring vomiting — worth a vet visit. 14 episodes across 5 of the last 8 weeks, last logged August 26."*), `accessibilityState={{ expanded: false }}`, hint `Opens this insight.` Never "dismissed", "acknowledged", "read", "seen".
- **Control:** label `Keep it compact`, hint per §4. The control unmounts on fold, so focus moves to the strip (the row `Pressable` that replaced it); assert with the owning-touchable check (C-6), not `fireEvent.press`.
- **Back-because:** prefixed to the re-opened card's label (`"Back because a new episode was logged. {the shipped label}"`) so VoiceOver hears why the card is large again.
- **Dynamic Type:** the clause wraps; the strip grows; the chevron stays its own node (C-8); the 44pt floor holds by `minHeight`, never by the row's content.

---

## 8. PR plan (one PR per session; DoD + persona sign-off per CLAUDE.md; every PR carries its on-device QA script)

| PR | Scope | Gate |
|---|---|---|
| **PR 1 — the fold primitive + the benign fold** | `lib/signalFold.ts` (store, identity, fingerprint table, `materialChange`, `reconcileFolds`, clear-epoch, `clearSignalFold` wired into `wipeLocalSession` + the `session.test.ts` by-name assertion) · `InsightCard`: the three states, the control row host-split (`Hide details` + `Keep it compact` + caption), `FoldedStrip`, the Back-because line, a11y · `SignalZone`/`LiveStack` composition (§6) · copy table for every **benign** type, guardrail-screened per type · the property test · snapshot: nothing folded ⇒ byte-identical to the shipped surface. **Safety types are not foldable in PR 1** (the control does not render on a safety card). | none — ready now |
| **PR 2 — the standing safety strip** | Enable the fold on `symptom_chronicity` + `symptom_worsening`: the ask-bearing clauses, the last-episode date (§3.4, the local read + fallback), the FS-3 build guard (a safety strip without its ask fails), the a11y sentence, the chronicity net-zero trigger fixture, the improving-then-relapsing fixture (release-on-absence). `pm-feature-review` + the on-device pass with the PM's own record. | **DF-2 PM ratification** |
| v1.1-a — the labeled stand-down | `generate-signal` emits a `stood_down` marker for a chronicity finding that stopped firing on recency (not on coverage); the client renders Dr. Chen's line once, no rail, until the weekly review says it as a count or seven days pass; never on the report. Adversarial-gated. | own issue |
| v1.1-b — the 4-week compare inside the safety card | The counted halves of the chronicity span (`Recent 4 weeks: 2 · The 4 before: 12`, density line) in the **expand + phone script**, with the why-it-stands clause when falling; never a separate benign card while chronicity fires. Engine payload + client + Change-Contract row + adversarial pass. | own issue |

PR 1 and PR 2 are sequential (PR 2 flips the class gate PR 1 ships closed). Neither touches `supabase/functions/`. The two v1.1 items are engine work and ride the normal `generate-signal` deploy path (currently unblocked — not under CUL-19 / CUL-557).

---

## 9. Acceptance criteria (QA-enforced per PR)

- Nothing folded ⇒ the shipped surface, byte-identical (snapshot-pinned).
- A fold is reachable **only** from the expanded state via `Keep it compact`; no swipe handler exists on any Signal row; the face tap still only toggles the evidence.
- A folded strip renders the rail (full opacity), the clause, the count line, the chevron — and on a safety strip the ask and the last-episode date; the FS-3 guard fails the build on a safety clause without its ask.
- Render order equals server rank in every mix of folded/open; `isLead` never moves off rank 0; a folded safety strip is never below a benign card (fixture: safety folded + benign open).
- Persistence: fold → background → relaunch → still folded; sign out → sign in → nothing folded (`session.test.ts` asserts `clearSignalFold` by name); pet switch renders the other pet's own entries.
- Re-open: every row of §5.3's table has a passing increase/flip fixture and a passing decrease-only stays-folded fixture; chronicity's net-zero-with-newer-episode re-opens; an absent key deletes the entry; the regen alone (same payload) never re-opens; no code path reads the clock to decide a re-open.
- Back-because: renders once above the re-opened face with the right reason; clears on touch; is part of the a11y label; carries no banned vocabulary.
- `intake_decline` and `incident_red_flag` never render the control and never accept an entry (a hand-written entry for them is ignored on read).
- Every clause + composed line passes `hasBannedSignalVocabulary` (test-pinned per type); no string carries `!`, `%`, a glyph, or a vetoed word.
- Reduced motion: no `LayoutAnimation` call; automatic re-opens never animate in either mode.
- No changes under `supabase/functions/`; no detection / ranking / threshold delta (diff-scoped assertion).

**QA state matrix (on-device, the PM's own record + the seed):** nothing folded · one benign folded · all benign folded (safety open) · safety folded (PR 2) · all folded · re-open on a newly logged episode (same symptom) · re-open denied on a window aging (wait a regen; count drops; strip stays) · new safety finding over an all-folded zone · pet switch A→B→A · sign-out wipe · VoiceOver pass on strip, control, Back-because · Dynamic Type at the largest accessibility size.

---

## 10. Persona conflicts (Conflict Protocol; one closed by the lenses, one for the PM)

> **Designer:** A standing safety card at canvas size for six weeks trains the eye off the zone, and the next new safety finding inherits the blindness. A fold reachable only from the expanded state is a stated acknowledgment; the strip keeps rail, ask, and rank.
> **Dr. Chen:** An unacted-on escalation must never quietly shrink — but a strip that keeps the ask *is* the same escalation at a size an owner can live beside, and the detector is the timer. What moved me: when a stated action is the only exit, owners state a false one and the record lies.
> **Resolution (DF-2):** both lenses land on the conditioned strip for the standing class, acute never. **PM ratifies or vetoes** — this is the one ruling that gates PR 2.

> **Designer:** The fold must re-open on material change or it is a mute button; the fields are in the cached payload today, and holding v1 for an engine field parks the PM's fix behind a redeploy.
> **Data Scientist:** "Material" is a second predicate over data the engine already judged (the §5.3 one-predicate lesson): a client diff on sliding-window counts re-opens on drift or misses a tier flip, and `trial_response` already carries a server notion of "changed materially". The engine should emit a `changeToken` per finding.
> **PM decision needed (DF-4):** ship v1 on the client table (per-type, increase-only counts, property-tested; a server token wins when present — recommended, so v1 ships now) — or hold PR 1 for the `generate-signal` payload addition?

---

## 11. Flagged Tier-2 edits (proposed wording — PM approval required before writing)

1. **`docs/nyx-design-principles-v1_0.md` — Principle 3, one addition:** *"A standing finding may be folded by the reader to a one-line strip that keeps its rail, its count, and — for a safety finding — its ask; a fold is seen, never resolved, and the record, not the calendar, re-opens it."*
2. **`docs/nyx-signal-home-requirements.md` §0 SD-5 (acknowledgment state):** add a pointer — the reader's fold state (this spec) is a second, distinct acknowledgment register: the §5.3 line acknowledges a *log*, the fold acknowledges a *reading*.

---

**Persona sign-off (spec):** Designer ✓ (anatomy, control, states, copy table, edge states — §3/§4/§6) — Dr. Chen ✓ (DF-2 conditions §2/§3.4/§4 vetoes, DF-5, the falsification set: the refusing cat, the owner who never books, improving-then-relapsing — all held once release-on-absence is in; the count-drifts-down-silently residual accepted provided it never animates) — Jordan ✓ / Sam ✓ (explicit control, persistence, re-open only on what they did, the ask + date in the strip, `Not yet` reserved for F4) — Data Scientist ⚠ (DF-4 dissent recorded §10; the property test and the server-token migration path are the mitigation) — Dir. of Eng ✓ (client-only, one AsyncStorage key, no new deps, no engine change in v1, the arrival-marker and recap-offer precedents reused) — T&S ✓ (device-local reader state, never exported, wiped by name) — QA ✓ (§9) — PO ✓ (issues filed under CUL-695; CUL-629 stays parked on the engine memory; CUL-375 unaffected).
