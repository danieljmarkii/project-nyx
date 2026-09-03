# Culprit — The Signal Fold (Home v1) Requirements

**Version:** 1.2 (**BUILD-READY** for PR 1–3 — the PM ruled DF-2 / DF-3 / DF-4 / DF-10 / DF-11 on 2026-09-03; v1.2 restructures the strip so no line wraps mid-phrase (§3.1, FS-11), makes the motion bolder with the rail leading (§12), and punts the card refresh) · **Date:** 2026-09-03 (v1.2) · **Owner:** Sr. Product Designer (design authority), Dr. Chen (clinical conditions), ratified through the fold mock round 1 · **Track:** CUL-695 (The Living Signal), direction **F3 "Seen & fold"**, re-scoped by the PM on 2026-09-03 as **Home v1** — the minimize/expand, rolled out to all accounts, built now; **Home v2** (the re-imagination) is the *Home Redesign — Conference Spike* project and is not this document.
**Provenance:** the 2026-09-03 session record (`docs/sessions/2026-09-03-home-signal-fold-v1-and-home-v2-alignment.md`: the PM's dogfood feedback verbatim, four isolated persona interviews, the Designer's build-ready anatomy, Dr. Chen's conditioned ruling) · the research brief `docs/research/2026-09-home-insight-fold-and-freshness-patterns.md` · the earlier discovery `docs/sessions/2026-08-29-signal-freshness-discovery.md` (PR #736) · the design authority for the fold frames `docs/culprit-home-signal-fold-mockups.html` (round 1, same-URL republish from here).
**This doc composes with — never modifies — `docs/nyx-signal-home-requirements.md`** (the shipped Signal surface: spine S1–S10, the Change Contract, receipts A/C). Every rule there still binds; this document adds one thing to that surface — a reader's memory of what they have seen — and nothing else. **No detection, threshold, ranking, or safety-composition change anywhere in this track.**

---

## 0. Decision record

| # | Decision | Ruling | Status |
|---|---|---|---|
| DF-1 | Scope + rollout | **v1 = the fold, all accounts, no beta flag** — a direct iteration on the GA'd surface (PM, 2026-09-03: "roll it out to all accounts"). The flag question Eng registered at the rung-1 kickoff is answered by the PM's phasing. The default state (nothing folded) renders the shipped surface unchanged. | PM-ruled |
| DF-2 | **D1 — may a safety card fold?** | **Yes — every safety card folds, the acute class included (PM ruling, 2026-09-03, overriding the lenses' class line).** Standing (`symptom_chronicity`, `symptom_worsening`) and acute (`intake_decline`, `incident_red_flag`) all fold to a sticky strip that keeps the rail at full opacity, the ask verb verbatim, the count, and — on the standing class — the last-episode date. **The acute fold is bounded by the record, not the reader:** an acute finding's material fields move daily (`daysBelowBaseline` climbs; a new flagged photo lands), so its fold lasts until the next regen that moves them — typically one day. Dr. Chen's conditions on the strip (rail, ask verb, count, no time-based re-open) bind on every class; his dissent on the acute class is recorded in §10 and answered by the daily re-open, and he signs the acute strip strings at PR 2. | **PM-ruled 2026-09-03** |
| DF-3 | The fold control | **An explicit text button, `Keep it compact`, ON THE FACE — in the hint row beside `Why we're showing this` (mock F5) — and repeated in the expanded state's control row. PM-ruled 2026-09-03** ("keeping the controls at the top level"). Never a swipe (reads as delete — Jordan, Sam), never the card tap (already means "show the evidence"). The Designer's expanded-only placement (F2, "you fold what you have opened") was the recommendation; the PM chose one tap from the face, as the owner interviews asked. Consequence accepted: a card can be folded without its evidence opened, so the strip's retained ask + count carry the acknowledgment, not the gesture. | **PM-ruled 2026-09-03** |
| DF-4 | What re-opens a folded card | **A material change in the finding, judged CLIENT-SIDE in v1 from the cached payload** (the per-type table in §5.3, property-tested), never a clock. A `changeToken` emitted by `generate-signal` is the v2 migration: when present it wins, the client table becomes the fallback. Designer↔Data Scientist conflict recorded (§10); the PM took the recommendation. | **PM-ruled (a), 2026-09-03** |
| DF-5 | No time-based re-open | **None.** The detector is already the timer, calibrated to the disease: an ongoing course produces its next episode within `ongoingRecencyDays` (14; 28 for cough) or the engine stops calling it ongoing — so every ongoing course re-opens on its own next episode. A calendar trigger is nagging without information (Dr. Chen; Jordan: "a fold that comes back because a timer ran out" is on the hate list). | Dr. Chen ✓ |
| DF-6 | Persistence | **Device-local, per pet, per finding, one AsyncStorage key, wiped by name on sign-out, not synced.** A fold is a fact about a reader, not the record; the spouse's phone folds independently; a reinstall may un-fold (accepted, harmless direction). | T&S ✓ · Eng ✓ |
| DF-7 | Order and canvas | **A fold changes height, never position.** Render order stays the server rank; a folded safety strip stays atop the safety band, above every benign card. **The lead canvas is not inherited**: `isLead` stays bound to rank 0; if rank 0 is folded, no card wears the Newsreader canvas (promoting a benign card because the safety card folded is reassurance by layout). | Designer ✓ · Dr. Chen ✓ |
| DF-8 | The "Back because" cue | **Yes** — one `textXS` line above a re-opened card naming why it came back, folded into the card's a11y label, cleared on the owner's next touch of that card or the next fingerprint change. Never a verdict word. | Designer ✓ |
| DF-9 | Out of v1 (registered, not dropped) | (a) the **labeled stand-down** when the detector goes quiet (today the card vanishes wordlessly — "reassurance-by-absence wearing an honesty costume"): a `generate-signal` change, own issue; (b) the **counted 4-week compare INSIDE the standing safety card** (expand + phone script), not a separate calm card — `detectReflections` is correctly muted while a symptom is chronic, so F2's "second slot" must not reopen that valve; engine + client + adversarial pass, own issue; (c) F4 care thread (the PM: "I like this to an extent, but let's not make this v1" — 2026-09-03), F5 weekly review, F7 companion surface — CUL-695 D3–D5 as posed. | Filed (§8) |
| DF-10 | The fold motion ("design delight") | PM ask, 2026-09-03: *"as these cards are expanding and contracting, let's add some design delight."* Spec'd in **§12** from the Designer's round-2 pass: **the rail is the continuous thread** — words leave first, the box closes around the line, the strip arrives with the box; unfold is the reverse with a soft settle; identical physics on every class (S1 lives in what the strip says, not in how it moves); owner-caused only (FS-9); no haptic, no wash, no bounce on close, no loop; reduced-motion = crossfade only. Drawn as a tappable frame in mock round 2. **PM, 2026-09-03: "I'll defer to you on that experience… I like the direction here a lot… feel free to even go a bit more aggressive."** Built bolder (§12 v1.2): the drift doubles to 8pt, the settle is felt (damping 0.7, ~4pt), and **the rail leads** — it grows first on unfold and shortens last on fold, so the line is visibly the thing that stays. The close-bounce veto holds. Ships as **PR 3** (CUL-788). | **PM-ruled 2026-09-03 — Designer's call on the details** |
| DF-11 | The card design refresh | PM ask, 2026-09-03: *"if there's anything we can do to improve the design of the cards, let's explore those options."* Three directions in **§13**, drawn side by side in mock round 2: **A "Quiet foot"** (the meta row de-pilled, one control row), **B "Margin rule"** (the rails become one ruled margin; row hairlines go), **C "Picture first"** (the receipt leads on benign cards — **vetoed**, it re-opens S4/S10 and breaks the fold's compression logic). Recommendation was B carrying A's foot. **PM, 2026-09-03: "Let's punt on card direction. Don't want to blow up scope."** PR 4 is out of the plan (CUL-790 canceled); §13 stays as the record for a later track. A's host-split control row ships anyway because F5 needs it (PR 1). | **Punted — PM, 2026-09-03** |

---

## 1. What this fixes, in one paragraph

The Signal is built to say *what is true* and is opened daily by someone asking *what changed*. Rank is static by construction, so every mature account converges on the PM's screen: the same safety card at Newsreader size for six weeks while the record fell 4·6·8·4·4·4·4 → 2·0·1·1 underneath it. Three things stack — habituation (a hero that never changes trains the eye off the zone, and the next new safety finding inherits the blindness; second-exposure attenuation is measured, the avoidance transfers by position), the wrong half of Principle 3's question, and **no acknowledgment register**: the card cannot be told "I've read this", so the surface reads as not listening. "Boring" is the non-builder's word for that. **v1 gives the surface a memory of what this reader has seen.** v2 gives it a carrier for change. Neither touches detection, thresholds, ranking, or S1.

**The reframe the research forces.** A fold is a **collapse**, not a dismiss: the strip is the finding's *named home while compressed*, in place, at rank (every reversible hide in the 16 products checked has one; a hide with no listed home is a delete). And the safety half follows the shape shared by IEC 60601-1-8, Dexcom, Apple Watch and Oura Rest Mode: **acknowledge silences the modality; the condition governs the state; the policy is not the user's to set.** The fold silences the *size*; the record decides when the full card returns; the owner cannot make a safety card go away.

---

## 2. The fold spine — FS-1…FS-10 (binding on every PR here)

1. **Seen, never resolved.** A fold removes nothing, re-orders nothing, and is never read as an all-clear — not in copy, not in the a11y label, not in what the engine is told (the engine is told nothing).
2. **Every card folds; the acute class folds on the record's leash.** Benign and standing safety cards fold like any card. `intake_decline` and `incident_red_flag` fold too (PM ruling, DF-2), but their material fields move daily, so an acute fold lasts until the next regen that moves them. No class is exempt from the strip's retained ask verb.
3. **The strip keeps the rail, the clause, the count — and on a safety strip, the ask and the last-episode date.** Rail at full opacity, never greyed. A safety strip that drops its ask fails the build (guarded like the med line).
4. **The control is explicit, on the face, never a gesture.** `Keep it compact` sits in the face's hint row beside `Why we're showing this` and repeats in the expanded control row; no swipe anywhere; the card tap keeps its one meaning (show the evidence).
5. **Position is rank; a fold changes height only.** A folded safety strip never sinks under a benign card; the canvas is never inherited.
6. **The record re-opens the card; the calendar never does.** Re-open on a material change in the finding (§5.3). Not on a count that fell because the window slid, not on the 24h regen, not on pull-to-refresh, not on a timer.
7. **A different finding is its own card.** A fold on one finding never suppresses, delays, or compresses another; a new safety finding lands as a full card above the strips. Suppression (B-789) beats fold.
8. **Plainness survives the fold.** No chip, tint, check mark, "Seen" label, badge, or count of folded cards — on the strip, on the zone, on the tab.
9. **Nothing here animates by itself.** Owner-caused transitions use the shipped `LayoutAnimation` idiom (skipped under reduced motion); an automatic re-open lands before first paint, un-animated; the strip's count changing (a window aging) never animates.
10. **The reader's state stays on the reader's device.** Not synced, not exported, never on the vet report, wiped on sign-out. An "acknowledged" that reaches anything clinical is F4's own schema (owner-entered, dated), never inferred from a fold.
11. **No strip line wraps at default type; nothing on a strip is ever truncated.** The strip is built from short lines, each its own `Text` node, so an ask can never break mid-phrase (the PM's F3 reaction): the name line ≤ 30 characters, the ask line ≤ 20, the count line ≤ 40 — single-line on a 375pt device at default Dynamic Type, pinned by worst-case fixtures (`Recurring skin irritation` · `Check with your vet` · the longest count form). At accessibility sizes a line may wrap; it never truncates (C-8). The one sanctioned exception: a joint-candidate correlation names every member and may wrap its name line — dropping a member would be the false exoneration the cluster exists to prevent.

---

## 3. Anatomy, states, transitions

### 3.1 The folded strip
A row inside the Signal card's `LiveStack`, at the finding's rank, between the same hairline `Divider`s the faces use.

| Element | Spec |
|---|---|
| Rail | Unchanged: 3pt, `RAIL_COLOR[priorityClass]`, opacity 0.85, full row height. Read before a word; never dims on fold. |
| Name line (line 1) | `ThemedText`, `textSM` · `weightMedium` · `colorTextPrimary` · `lineHeightSM`. The finding's name only — `Recurring vomiting`, `Vomiting soon after eating`, `Chicken — vomiting tends to follow` — ≤ 30 characters (FS-11), its own node. **No `numberOfLines`** — at accessibility sizes it wraps, never truncates. |
| Ask line (line 2, safety strips only) | `ThemedText`, `textSM` · `weightRegular` · `colorTextPrimary` · `lineHeightSM`, its own node beneath the name — `Worth a vet visit` / `Tell your vet` / `Call your vet today` / `Check with your vet` / `Call your vet` — ≤ 20 characters, so the ask verb is never split across a line break. Plain primary ink, no rose text: the rail is the only warm mark (S1). |
| Count line (last line) | `stripCountLine(finding)` — the strip's own **compact** count, ≤ 40 characters (§4), derived from the same fields as `sampleLine` and screened by the same guard; `textXS` · `colorTextTertiary` · `spaceMicro` below. Standing safety strips end with ` · last {Mon D}` (§3.4); the red-flag strip likewise. Compact because the strip is a compression: `14 episodes, 5 of 8 weeks · last Aug 26` says what the face's sample line says in fewer words (Dr. Chen's own strip form). One source per fact, nothing stated twice (S10). |
| Chevron | The `TrialStrip`/`MedStrip` `›`: a raw `<Text>` (`geist-ok`), `textLG` · `colorTextSecondary`, right-aligned, its own node — never concatenated into the clause. |
| Dropped | The sentence, every receipt, every meta chip (`New` cannot appear on a strip — novelty re-opens the card), the med line, the linked-pair row, "Why we're showing this". |
| Geometry | `minHeight 44` · `paddingVertical: space1` (the `rowCompact` rhythm) → ~52pt for a two-line benign strip, ~66pt for a three-line safety strip, against ~180pt for a lead canvas. Type drops two tiers: Newsreader 26 → Geist 15 → Geist 13/11. |
| Idiom | Borrows the compact register and chevron of `TrialStrip`/`MedStrip`, **not** their `Card` — it stays a row of the Signal. MedStrip §7 is the precedent with one divergence: MedStrip collapses by *record state* and may order expanded-before-collapsed (D8); the fold is by *owner action* and therefore never re-orders (FS-5). |

### 3.2 The three states
`face` (shipped) ⇄ `expanded` (shipped toggle, whole-row `Pressable`) → **`folded`** (new) → `face`.

- **face → expanded:** the shipped tap; unchanged.
- **expanded → folded:** the `Keep it compact` control (§3.3).
- **folded → face:** tap the strip (the strip is its own whole-row `Pressable`, `hitSlop 8`), or an automatic re-open (§5.3). Re-opening lands on the **face**, not the expanded state.
- **face → folded:** the face control (§3.3), one tap.

Owner-caused transitions run the §12 choreography (PR 3; until it lands, the shipped `LayoutAnimation.configureNext(LayoutAnimation.create(theme.durationMedium, 'easeInEaseOut', 'opacity'))`). Under `useReducedMotion()` there is no `LayoutAnimation` call and no translate — geometry is instant and the incoming content crossfades over `durationFast` (a crossfade is not motion; the arrival moment's own precedent). An automatic re-open never animates (FS-9).

### 3.3 The control row (DF-3, PM-ruled: on the face)
The card's hint row becomes a **control row of two real text buttons**, rendered as a **sibling** of the row `Pressable` (the MedStrip host-split — a button nested inside the row button is swallowed by VoiceOver and by the row's own `onPress`): `Why we're showing this` (toggles the evidence, the same action as the row tap; reads `Hide details` when expanded) and **`Keep it compact`** (folds). Both `textXS` · `weightMedium`; the first in `colorAccentInk` (as today), the fold control in `colorTextSecondary` so the doorway to the evidence stays the brighter of the two. `gap ≥ 16` between them (C-5: both carry a horizontal `hitSlop 8`, so the facing slops sum to 16). **The 44pt floor is reached upward, never downward:** the row reserves a 28pt line (`paddingVertical`) and each control takes an asymmetric `hitSlop` of `{ top: 16, bottom: 0, left: 8, right: 8 }`, because the next card's own `Pressable` (`hitSlop 8`) begins just past the hairline below — a bottom slop would share hit area with it. Pin the rendered gap off the flattened style (C-5). In the expanded state the same row also carries, beneath it, one `textXS` · `colorTextTertiary` caption (§4): *It comes back on its own when the picture changes.* — so sighted owners learn the contract without a zone-level line.

When F4 (the care thread) lands — not v1 (DF-9c) — its chip row replaces this control on safety cards: `Not yet` inherits this behaviour verbatim; `Booked` / `We've been` fold with state; **`Not yet` is never removed** — it is what keeps `Booked` honest (Jordan: owners will state a false action to get their screen back if it is the only exit).

### 3.4 The last-episode date (standing safety strips) and the acute strip's recency
The date of the most recent episode the finding counts, at **day precision in the device zone** (B-514: build the day from local components, never a UTC literal), rendered year-less — safe because the 56-day lookback bounds it (C-19). **Source of truth is the local record**: one SQLite read per safety strip, `MAX(occurred_at)` over the pet's non-deleted events of the finding's `symptomType` (the same query shape `getLocalSignalContext` uses), memoized on the hydration tick; the finding-derived approximation (`expiresAt − 24h − daysSinceLastEpisode` days) is the fallback when the local read fails. **A date, never a counter** — a ticking "N days since" on an always-visible strip is a countdown to relief; `recencyPhrase` stays in the expand and the phone script where it lives today. **Acute strips** carry their own recency from the finding itself: `intake_decline` says the day count the sentence already says (`daysBelowBaseline`, via `sampleLine`); `incident_red_flag` appends ` · last {Mon D}` from `mostRecentFlaggedIso` (already rendered by the phone script's `shortDateUTC`).

---

## 4. Copy (verbatim; nyx-voice-governed — no `!`, no glyph, no `%`, no pet name on a strip; `{symptom}` = the shipped `symptomWord`)

Every clause and every composed line passes `hasBannedSignalVocabulary` at build (test-pinned per type), the way the med line does; a clause that trips the screen is a build failure, never a rendered fallback.

| Type | Name line | Ask line (safety only) | Count line (compact, ≤ 40) |
|---|---|---|---|
| `symptom_chronicity` (firm) | `Recurring {symptom}` | `Worth a vet visit` | `{n} episodes, {a} of {w} weeks · last {Mon D}` |
| `symptom_chronicity` (standard) | `Recurring {symptom}` | `Tell your vet` | same |
| `symptom_worsening` | `{Symptom} up this week` | `Tell your vet` | `{n} this week, {m} last week · last {Mon D}` (days when the trigger is `more_days`) |
| `postprandial_timing` | `{Symptom} soon after eating` | — | `{r} of {e} timed within {rapidWindowMinutes} min of eating` |
| `empty_stomach_timing` | `{Symptom} long after eating` | — | `{l} of {e} timed {longGapHours}h or more after eating` |
| `timing_story` | `{Symptom} soon or hours after eating` | — | `{r} soon · {m} between · {l} long, of {e} timed` |
| `timeofday_clustering` | `{Symptom} {localHourBand}` (e.g. `Vomiting between 2 and 6am`) | — | `{c} of {e} timed {localHourBand}` |
| `food_symptom_correlation` | `{Protein} — {symptom} tends to follow` (a joint candidate names every member and may wrap — FS-11's one exception) | — | `{n} episodes across {k} matched days` |
| `reflection` | `{Symptom}, week over week` | — | `{n} this week, {m} last week` (the density-withheld swap preserved) |
| `trial_response` | `Trial diet — day {trialDayNumber}` / `… of {targetDurationDays}` when set | — | `{t} during the trial, {b} before` (time-ordered, direction-neutral) |
| `intake_decline` (`consecutive_low`) | `Eating less than usual` | the card's own verb: `Call your vet today` when the sentence says so (the feline 3-day floor), else `Check with your vet` | `{d} days below the usual, {k} recent meals` |
| `intake_decline` (`refused_normal_food`) | `Refused the usual food` | same verb rule | `Compared with {k} recent meals` |
| `incident_red_flag` (blood) | `Blood in a {vomit\|stool} photo` | `Call your vet` | `AI read of {n} logged photo(s) · last {Mon D}` |
| `incident_red_flag` (foreign material) | `Something unusual in a {vomit\|stool} photo` | `Call your vet` | same |

| Surface | String |
|---|---|
| Fold control (face + expanded control row) | `Keep it compact` |
| Evidence control (the former hint, now a button) | `Why we're showing this` / `Hide details` |
| Fold control caption (expanded state) | `It comes back on its own when the picture changes.` |
| Back-because — a newer episode / a count rose | `Back because a new episode was logged.` |
| Back-because — a new week's pair (reflection / worsening) | `Back because a new week's counts are in.` |
| Back-because — correlation tier early → established | `Back because this pattern is now established.` |
| Back-because — chronicity/worsening tier, or the cough↔vomit adjacency turning on | `Back because the vet ask changed.` |
| Back-because — trial counts moved | `Back because the trial counts moved.` |
| Back-because — intake decline, a further day below baseline | `Back because another day came in below the usual.` |
| Back-because — red flag, a newer flagged photo | `Back because the photo record changed.` |
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
| `intake_decline` (acute) | `daysBelowBaseline` ↑ · `trigger` change · `refusedFoodLabel` change — **moves daily while the decline continues, so the fold is a one-day fold by construction** | `ratedMealsConsidered` · `species` |
| `incident_red_flag` (acute) | `mostRecentFlaggedIso` change (a newer flagged photo) · `flags` set change · `flaggedIncidentCount` ↑ | `windowDays` |

**Release rules.** (1) A folded finding whose key is **absent** from the new set has its entry **deleted** — so when it re-fires after standing down, it renders as a full card (Dr. Chen's trigger 4; without it the improving-then-relapsing course fails). (2) A release writes `{ state: 'reopened', reason }` so the face renders the Back-because line; the entry is deleted on the owner's next touch of that card or the next fingerprint change. (3) A `changeToken` on the payload, when `generate-signal` ships one (v2), is compared first; the table becomes the fallback for rows without one.

**The property test** (`lib/signalFold.test.ts`), per type: incrementing any listed count re-opens; decrementing every count with nothing else changed stays folded; flipping any listed tier/boolean/direction re-opens; for chronicity, a net-zero count with `daysSinceLastEpisode` decreased re-opens; an absent key deletes the entry; `materialChange` is a pure function of `(prev, next)` and never reads the clock. Run it red against a table with the asymmetry inverted before trusting it (C-18: a guard is proven by mutation).

---

## 6. Composition (`SignalZone` / `LiveStack`) and edge states

- **Order = `visibleFindings` (server rank after B-789 suppression), unchanged.** Each row renders `FoldedStrip` (entry `folded`), the face with the Back-because line (entry `reopened`), or the face (no entry). `isLead` stays `i === 0` on the *rank*, not the first unfolded card (DF-7). Dividers unchanged.
- **All cards folded (any class, the acute ones included):** the receded `Signal` label, the strips, the patterns doorway — nothing else. The zone may be that short; that is the fold working (Jordan: "it stops the shouting"). **No zone-level line** ("Nothing new" reads as an all-clear; S6 governs presence-gated quiet, and every finding here is present — the contract is taught by the control's caption instead).
- **Lead folded, a secondary open:** the secondary keeps its compact face; no canvas.
- **A new finding into an all-folded zone:** renders open at its rank (canvas if rank 0). No `New` chip is derived from the fold store in v1 (a reinstall would false-flag everything; the `New` chip's contract is CUL-629 / the engine's finding-set memory).
- **Suppression beats fold; the ack line (§5.3 of the Signal spec) renders above the strips; the arrival moment is unaffected** (a first-ever finding has nothing stored). A pet switch reads the new pet's entries — never the previous pet's (the `useSignal` render-time reset pairs `findings` with `petId`; the fold read keys on the same `petId`).
- **Cross-pet banner:** unaffected — it reads the other pet's *findings*, not this device's fold state; a folded chronicity on pet A still raises A's banner on pet B's Home.
- **Offline / cache unreadable:** the last rendered state holds; fold entries are not touched on a failed read (never release on a read that did not answer — C-12).

---

## 7. Accessibility

- **Strip:** `accessibilityRole="button"`, label `"{name}. {ask}. {count line}."` (the safety strip's label therefore says the ask and the date: *"Recurring vomiting. Worth a vet visit. 14 episodes, 5 of 8 weeks, last August 26."* — the a11y label expands `Mon D` to the month name), `accessibilityState={{ expanded: false }}`, hint `Opens this insight.` Never "dismissed", "acknowledged", "read", "seen".
- **Control:** label `Keep it compact`, hint per §4. The control unmounts on fold, so focus moves to the strip (the row `Pressable` that replaced it); assert with the owning-touchable check (C-6), not `fireEvent.press`.
- **Back-because:** prefixed to the re-opened card's label (`"Back because a new episode was logged. {the shipped label}"`) so VoiceOver hears why the card is large again.
- **Dynamic Type:** the clause wraps; the strip grows; the chevron stays its own node (C-8); the 44pt floor holds by `minHeight`, never by the row's content.

---

## 8. PR plan (one PR per session; DoD + persona sign-off per CLAUDE.md; every PR carries its on-device QA script)

| PR | Scope | Gate |
|---|---|---|
| **PR 1 — the fold primitive + the benign fold** | `lib/signalFold.ts` (store, identity, fingerprint table, `materialChange`, `reconcileFolds`, clear-epoch, `clearSignalFold` wired into `wipeLocalSession` + the `session.test.ts` by-name assertion) · `InsightCard`: the three states, the control row host-split (`Hide details` + `Keep it compact` + caption), `FoldedStrip`, the Back-because line, a11y · `SignalZone`/`LiveStack` composition (§6) · copy table for every **benign** type, guardrail-screened per type · the property test · snapshot: nothing folded ⇒ byte-identical to the shipped surface. **Safety types are not foldable in PR 1** (the control does not render on a safety card). | none — ready now |
| **PR 2 — the safety strips (standing + acute)** | Enable the fold on every safety type: the ask-bearing clauses for chronicity / worsening / intake decline / red flag (§4), the last-episode date on the standing strips (§3.4, the local read + fallback) and the red flag's `last {Mon D}`, the FS-3 build guard (a safety strip without its ask verb fails), the a11y sentences, the chronicity net-zero fixture, the improving-then-relapsing fixture (release-on-absence), the acute daily-re-open fixtures (day 3 → day 4 re-opens; a new flagged photo re-opens). Dr. Chen signs the four acute strings. `pm-feature-review` + the on-device pass with the PM's own record. | DF-2 ruled — ready after PR 1 |
| **PR 3 — the fold motion (DF-10, §12)** | The owner-caused fold / unfold choreography on `InsightCard`: the continuous rail, the body's fade-and-drift, the strip clause's late fade-in, the unfold settle; `useReducedMotion` static swap; app-blur completion; no haptic. Snapshot: the motion adds no node when idle. | after PR 1 (benign) — extends to safety strips with PR 2 |
| ~~PR 4 — the card design refresh~~ | **Punted (PM, 2026-09-03: "don't want to blow up scope").** CUL-790 canceled; §13 kept as the record for a later track. | — |
| v1.1-a — the labeled stand-down | `generate-signal` emits a `stood_down` marker for a chronicity finding that stopped firing on recency (not on coverage); the client renders Dr. Chen's line once, no rail, until the weekly review says it as a count or seven days pass; never on the report. Adversarial-gated. | own issue |
| v1.1-b — the 4-week compare inside the safety card | The counted halves of the chronicity span (`Recent 4 weeks: 2 · The 4 before: 12`, density line) in the **expand + phone script**, with the why-it-stands clause when falling; never a separate benign card while chronicity fires. Engine payload + client + Change-Contract row + adversarial pass. | own issue |

PR 1 → PR 2 are sequential (PR 2 flips the class gate PR 1 ships closed); PR 3 can run parallel to PR 2 once PR 1 merges (it touches `InsightCard`'s transitions, not the strips' content). None touches `supabase/functions/`. PR 1 owns `stripCountLine` and the name-line table (§4) for the benign types; PR 2 adds the ask lines and the safety forms. The two v1.1 items are engine work and ride the normal `generate-signal` deploy path (currently unblocked — not under CUL-19 / CUL-557).

---

## 9. Acceptance criteria (QA-enforced per PR)

- Nothing folded ⇒ the shipped surface, byte-identical (snapshot-pinned).
- A fold is reachable from the face's `Keep it compact` control (and the same control in the expanded row) and from nowhere else; no swipe handler exists on any Signal row; the card tap still only toggles the evidence; the two face controls never share hit area with each other or with the next row (the rendered gap and the asymmetric `hitSlop` are asserted off the flattened style).
- A folded strip renders the rail (full opacity), the name line, the count line, the chevron — and on a safety strip the ask line and the last-episode date; the FS-3 guard fails the build on a safety strip without its ask line.
- **FS-11:** every name / ask / count string is pinned under its length cap by a per-type test, with the worst-case fixtures (`Recurring skin irritation` · `Check with your vet` · the longest count form); on a 375pt frame at default type no strip line wraps (a rendered-width assertion with the Geist metrics the test harness has); no strip `Text` carries `numberOfLines`.
- Render order equals server rank in every mix of folded/open; `isLead` never moves off rank 0; a folded safety strip is never below a benign card (fixture: safety folded + benign open).
- Persistence: fold → background → relaunch → still folded; sign out → sign in → nothing folded (`session.test.ts` asserts `clearSignalFold` by name); pet switch renders the other pet's own entries.
- Re-open: every row of §5.3's table has a passing increase/flip fixture and a passing decrease-only stays-folded fixture; chronicity's net-zero-with-newer-episode re-opens; an absent key deletes the entry; the regen alone (same payload) never re-opens; no code path reads the clock to decide a re-open.
- Back-because: renders once above the re-opened face with the right reason; clears on touch; is part of the a11y label; carries no banned vocabulary.
- Acute strips (`intake_decline`, `incident_red_flag`) carry the card's ask verb verbatim (the FS-3 guard covers all four safety types) and re-open on their daily fields: a `daysBelowBaseline` increment re-opens; a newer `mostRecentFlaggedIso` re-opens; nothing else on those types is a trigger.
- Every clause + composed line passes `hasBannedSignalVocabulary` (test-pinned per type); no string carries `!`, `%`, a glyph, or a vetoed word.
- Reduced motion: no `LayoutAnimation` call and no translate (a `durationFast` crossfade of the incoming content is allowed); automatic re-opens never animate in either mode; the two `LayoutAnimation` configs fire from the two press paths only — never from a `cached` change, the reopened path, or a strip's count changing.
- No changes under `supabase/functions/`; no detection / ranking / threshold delta (diff-scoped assertion).

**QA state matrix (on-device, the PM's own record + the seed):** nothing folded · one benign folded · all benign folded (safety open) · standing safety folded (PR 2) · an acute card folded then re-opened by the next day's regen (PR 2) · all folded · re-open on a newly logged episode (same symptom) · re-open denied on a window aging (wait a regen; count drops; strip stays) · new safety finding over an all-folded zone · pet switch A→B→A · sign-out wipe · VoiceOver pass on strip, control, Back-because · Dynamic Type at the largest accessibility size.

---

## 10. Persona conflicts (Conflict Protocol; one closed by the lenses, one for the PM)

> **Designer:** A standing safety card at canvas size for six weeks trains the eye off the zone, and the next new safety finding inherits the blindness. A fold reachable only from the expanded state is a stated acknowledgment; the strip keeps rail, ask, and rank.
> **Dr. Chen:** An unacted-on escalation must never quietly shrink — but a strip that keeps the ask *is* the same escalation at a size an owner can live beside, and the detector is the timer. What moved me: when a stated action is the only exit, owners state a false one and the record lies.
> **Resolution (DF-2, 2026-09-03):** both lenses landed on the conditioned strip for the standing class with the acute class exempt. **The PM ruled that the acute cards fold too.** Dr. Chen's dissent stands on the record — *an acute card asks for an action today and is retired by the record, not the reader* — and is answered structurally rather than by exemption: the acute finding's material fields move daily, so its fold lasts one regen cycle, the strip keeps the ask verb verbatim, and Dr. Chen signs the four acute strings at PR 2. Built as ruled.

> **Designer:** The fold must re-open on material change or it is a mute button; the fields are in the cached payload today, and holding v1 for an engine field parks the PM's fix behind a redeploy.
> **Data Scientist:** "Material" is a second predicate over data the engine already judged (the §5.3 one-predicate lesson): a client diff on sliding-window counts re-opens on drift or misses a tier flip, and `trial_response` already carries a server notion of "changed materially". The engine should emit a `changeToken` per finding.
> **PM ruled (DF-4, 2026-09-03): (a)** — ship v1 on the client table (per-type, increase-only counts, property-tested; a server token wins when present). The Data Scientist's dissent stays recorded; the property test and the token migration path are its mitigation.

---

## 11. Flagged Tier-2 edits (proposed wording — PM approval required before writing)

1. **`docs/nyx-design-principles-v1_0.md` — Principle 3, one addition:** *"A standing finding may be folded by the reader to a one-line strip that keeps its rail, its count, and — for a safety finding — its ask; a fold is seen, never resolved, and the record, not the calendar, re-opens it."*
2. **`docs/nyx-signal-home-requirements.md` §0 SD-5 (acknowledgment state):** add a pointer — the reader's fold state (this spec) is a second, distinct acknowledgment register: the §5.3 line acknowledges a *log*, the fold acknowledges a *reading*.

---

**Persona sign-off (spec):** Designer ✓ (anatomy, control, states, copy table, edge states — §3/§4/§6) — Dr. Chen ✓ (DF-2 conditions §2/§3.4/§4 vetoes, DF-5, the falsification set: the refusing cat, the owner who never books, improving-then-relapsing — all held once release-on-absence is in; the count-drifts-down-silently residual accepted provided it never animates) — Jordan ✓ / Sam ✓ (explicit control, persistence, re-open only on what they did, the ask + date in the strip, `Not yet` reserved for F4) — Data Scientist ⚠ (DF-4 dissent recorded §10; the property test and the server-token migration path are the mitigation) — Dir. of Eng ✓ (client-only, one AsyncStorage key, no new deps, no engine change in v1, the arrival-marker and recap-offer precedents reused) — T&S ✓ (device-local reader state, never exported, wiped by name) — QA ✓ (§9) — PO ✓ (issues filed under CUL-695; CUL-629 stays parked on the engine memory; CUL-375 unaffected).

---

## 12. The fold motion (DF-10 — PR 3, CUL-788; Designer, round 2)

**The principle.** A fold is a collapse in place, never a dismissal, so the motion is subtraction with one thing held constant: **the rail is the same node before, during and after** — it shrinks with the row and never changes colour or opacity. Words leave first (what is leaving needs no reading); the box closes around the line; the strip's clause arrives *with* the box, never after it, so the reader never sees an empty strip. Unfolding is the reverse with one asymmetry: the face opens and arrives together, because the reader asked for it. **The physics are identical on every class** — S1's plainness lives in what the safety strip says; identical motion is what keeps a safety fold from feeling like either a reward or a punishment. Stack: RN `Animated` + `LayoutAnimation` only (`react-native-reanimated` is not in the project — verified in `package.json` and `node_modules`).

**v1.2 — bolder, per the PM ("go a bit more aggressive"), the Designer's call on the details.** Three changes, none crossing the close-bounce line: the body's drift doubles to 8pt; the unfold's settle is felt (damping 0.7, ~4pt overshoot, still one settle); and **the rail leads** — it is its own animated height rather than a stretched sibling, so on unfold the line grows to the face's height ~80ms *before* the box follows it, and on fold it shortens ~80ms *after* the box has closed. The thread is visibly the thing that stays.

### 12.1 Fold (face / expanded → strip) — 480ms, composed 180 + 300

| t (ms) | What moves | How |
|---|---|---|
| 0 | Tap `Keep it compact`. No press flash beyond the default. | — |
| 0 → 180 | The body — sentence, receipt, meta row, evidence, control row — opacity 1 → 0, translateY 0 → −8 (`space1`), drifting toward where the name line will sit. | `Animated.parallel([timing(opacity), timing(translateY)])`, `Easing.out(Easing.quad)`, native driver |
| 180 → 480 | Row height expanded → strip. Every sibling below rises in the same transaction — Today and Trend come up into view for free. | `LayoutAnimation`, `update: easeInEaseOut` (300) |
| 260 → 480 | **The rail shortens last** — its own `Animated` height, from the face height to the strip's 16pt, starting ~80ms after the box begins to close, so the line is the last thing to move. | `Animated.timing(railHeight)`, `Easing.inOut(Easing.quad)`, 220ms (height is not native-driver; the rail is a 3pt View, cheap on the JS thread) |
| 180 → 480 | Strip name + ask + count + chevron opacity 0 → 1 as ONE node — no stagger between the lines. Legible by ~330ms, the ease's midpoint. | `LayoutAnimation`, `create: { easeInEaseOut, opacity }` |

### 12.2 Unfold (strip → face) — 450ms, the rail leads

| t (ms) | What moves | How |
|---|---|---|
| 0 → 160 | **The rail grows first** — its own `Animated` height, 16pt → the face's measured height, ahead of the box. | `Animated.timing(railHeight)`, `Easing.out(Easing.cubic)` |
| 80 → 450 | Row height strip → face, following the line; rows below descend. | `LayoutAnimation` (delayed 80ms), `update: { spring, springDamping: 0.7 }` on iOS — ~4pt overshoot, one felt settle, never a second bounce. Android: `easeInEaseOut` (its `LayoutAnimation` spring is coarse; a stutter is worse than no spring). |
| 80 → 450 | Face body opacity 0 → 1. | `create: { easeInEaseOut, opacity }` |
| 120 → 420 | The sentence translateY −8 → 0 — it settles into place a beat after the box does. | `Easing.out(Easing.cubic)`, native driver; **only on an owner-caused unfold** |

### 12.3 The rules around it
- **Automatic re-open (FS-9):** the face is on the first paint — no `configureNext`, no fade. **A strip's count changing** (a window aging) is a plain re-render: `configureNext` is reachable from the two press handlers only, never from a data effect.
- **Reduced motion:** no `configureNext` in either direction (geometry is instant); no translate anywhere; the incoming content — strip on fold, face on unfold — runs a `durationFast` opacity 0 → 1. A crossfade is not motion (the arrival moment's precedent, polish spec §4); a 130pt jump with nothing softening it is itself a jolt.
- **App blur:** one-shot, ≤ 400ms, no loop — nothing to pause, so `useAppActive` is not imported. A fold cut by a blur completes natively (a moment cut short is worse than one missed). If the 150ms `Animated` stage reports `finished: false` (unmount, pet switch), swap states without animating.
- **The rail's contract survives the choreography:** it changes *height* (leading on unfold, trailing on fold) and nothing else — never colour, never opacity, never width. Measure the face once per fold/unfold (`onLayout` on the body) so the rail's target is the real height; if no measurement exists yet (first paint), the rail falls back to `alignSelf: 'stretch'` and the choreography degrades to §12 v1.1's continuous rail.
- **Forbidden:** any loop, idle motion, or rail pulse · overshoot on **fold** (a bounce on *closing* a safety card reads as relief; the spring is unfold-only) · scale (shrinking into the distance reads as dismissal) · horizontal travel (sideways reads as swipe, swipe reads as delete) · any wash, gradient, glow, tint, or rail colour change (the arrival's wash is once-ever; a wash on fold makes folding a reward) · a check mark, a "Seen", a folded count (FS-8) · a stagger inside the strip · any class-keyed variation of any beat · a haptic (`InsightCard` is on `guards/haptics.test.ts`'s always-scanned list) · sound.

### 12.4 Build shape
Two custom `LayoutAnimationConfig` objects — `LayoutAnimation.create(d, type, prop)` sets one type for all three phases, so the ease-on-fold / spring-on-unfold split needs the object form:
```ts
const FOLD_LAYOUT   = { duration: 300, create: { type: 'easeInEaseOut', property: 'opacity' }, update: { type: 'easeInEaseOut' } };
const UNFOLD_LAYOUT = { duration: 370, create: { type: 'easeInEaseOut', property: 'opacity' },
                        update: Platform.OS === 'ios' ? { type: 'spring', springDamping: 0.7 } : { type: 'easeInEaseOut' } };
// The rail: its own Animated.Value height (measured face height ⇄ 16), timed to trail the fold by 80ms and lead the unfold by 80ms.
```
The Android enable flag is already at the top of `InsightCard`. The fold is two-phase: a `settling` state mounts an `Animated.View` around the body (mounted **only** while settling — the `ArrivalStage` rule, so nothing-folded stays byte-identical to the shipped tree), runs the 180ms parallel, and on `finished` calls `configureNext(FOLD_LAYOUT)` + `setState('folded')` and starts the rail's 220ms shorten after an 80ms delay. Unfold: start the rail's 160ms grow, then after 80ms `configureNext(UNFOLD_LAYOUT)` + `setState('face')`, the sentence's `Animated.Value` seeded at −8 only when the unfold is owner-caused. The rail is an `Animated.View` with an explicit height only while a transition is in flight; idle, it is the shipped stretched sibling. **Tests:** mock `LayoutAnimation`; the two configs fire on the two press paths only — never on a `cached` change, the reopened path, or under reduced motion; the settling wrapper is absent from the idle tree (snapshot).

**What makes it delightful, for the PM:** the coloured line never breaks — and now it leads. The same rail that stood beside the headline for six weeks is the line beside the strip: the words leave, the card closes around the line, and the line is the last thing to settle. Unfolding is that line growing back *first*, the card following it with one felt settle, and the sentence landing a beat after the box. Nothing is added and nothing is taken away; the owner watches the thread stay while everything around it moves.

---

## 13. The card design — three directions, drawn and punted (DF-11; Designer, round 2; PM 2026-09-03: "let's punt on card direction — don't want to blow up scope")

_Kept as the record for a later track. Nothing here is in v1's plan; CUL-790 is canceled. A's host-split control row ships regardless, because the ruled F5 placement needs it (PR 1)._

### A — "Quiet foot" (refines the current anatomy)
**Thesis:** the sentence is already right; the noise is beneath it. **Face:** the meta row loses its boxed pill — `Early pattern` becomes a tertiary `weightMedium` prefix on the sample line (`Early pattern · 6 of 9 …`); the one pill that survives is `New` (novelty earns a shape, and it is the one chip S1 permits). The foot becomes a single control row, host-split out of the face `Pressable`: `Why we're showing this` (`textXS` · `weightMedium` · `colorAccentInk`) · `Keep it compact` (`textXS` · `weightMedium` · `colorTextTertiary`, ≥ 4.5:1), `gap: space2` (C-5: facing slops 8 + 8), each reaching the 44pt floor upward only (§3.3). That is the PM's F5 placement drawn as the second verb on the line the card already has — not a new button, not a pill. Everything else unchanged. **Safety by contrast:** a safety face is sentence + sample line + the same two verbs, no pill unless `New` — as the benign lead grows a receipt, the safety row is visibly the plainer one. **Cost:** low — a snapshot update and the meta-row host split, which F5 needs anyway. No Tier-2 edit. **Risk:** two text verbs on every face; the accent/grey split keeps the evidence verb the brighter one.

### B — "Margin rule" (changes the frame)
**Thesis:** make the rail the structure. The hairline dividers between rows go; the rails become segments of one ruled margin down the stack's left — 3pt, the finding's class colour, `space1` breaks between segments (rail `marginVertical: space0_5`; rows keep their `paddingVertical`). The eye counts findings by segments, and a folded strip is a short segment beside one line — the fold's story told by the frame. `Signal` sits above the rule's start; the doorway keeps its hairline below the rule's end, so the card carries one hairline instead of n. Ground unchanged: `Card elevated` on `colorSurface` — the record stays in daylight (S7, D8 closed light). **Brand anchor:** Newsreader beside a ruled margin is the editorial page — Calm's typography, not a dashboard. **Safety by contrast:** the rose segment is the only warm mark on the paper; nothing else marks the safety row — no wash, no border, no chip. **Cost:** delete one `Divider` per row, one margin on the rail, a snapshot update. **Tier-2:** `docs/nyx-signal-home-requirements.md` §5.2 says "hairlines unchanged" — one line: *row hairlines are replaced by the ruled margin; the doorway hairline stays.* **Risk:** two adjacent benign rows told apart by an 8pt break in a teal line — check at the largest Dynamic Type; if the break reads weak, widen it to `space2`, never restore the divider.

### C — "Picture first" (re-thinks the lead canvas) — **vetoed**
**Thesis:** on a benign lead that owns a receipt, the receipt leads at reading size and the Newsreader sentence sits beneath as its caption; a safety lead is sentence-only at full size, so the two lead shapes are told apart by structure. **Why it is vetoed:** (1) it re-opens S4 (*the sentence stays the headline; counts stay subordinate*) and S10 (a receipt that leads no longer earns a place beside the sentence — it replaces it), both ratified spine rules this spec composes with and never modifies; (2) it breaks the fold's logic — the strip keeps clause + count, so folding a picture-led face removes the most prominent element and the strip stops being a compression of the face; (3) a `fewer_during_trial` compare as a hero beside a folded safety strip is reassurance by layout, which DF-7 forbids. Drawn in round 2 so the PM sees why, not adopted.

### Recommendation
**Build B carrying A's foot** — they compose (B is the frame, A is the foot), and the F5 control needs A's host split regardless. B is the only direction that makes the fold *more* legible, for the price of a deleted divider. Vetoed at the frame level for any direction: a per-class ground or a tinted safety row (S1: no decorative ground; a teal wash on benign rows beside an untinted safety row is reassurance by layout), and any night ground on the Signal (S7; D8 closed light, twice).
