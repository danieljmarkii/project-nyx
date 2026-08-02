# Culprit Home Screen Widget — Requirements

**Version:** 2.0 (build-ready) | **Date:** 2026-08-02 | **Status:** PM-ratified 2026-08-02 (ideation rounds 4–7 on the round-3 shipped widget; R7-1 "confirm for build" given)
**Supersedes:** v1.0, preserved verbatim at **`docs/nyx-widget-requirements-v1-frozen.md`** 🧊 (the as-built record of the build-35 capture widget). This file is the living spec; header-versioned per the 2026-07-19 doc-versioning rule.
**Pairs with:** `docs/culprit-widget-mockups.html` (the design-locked **round-7** mock — the geometry the build copies, screenshot-verified) · `docs/sessions/2026-08-02-widget-redesign-ideation.md` (the full round 4→7 reaction record) · backlog **B-664** (the rebuild track) · B-481 (the on-device pass it absorbs)

---

## 0. Decision record

Rulings from the 2026-08-02 redesign rounds (all PM), plus the v1 rulings that carry or die. The v1 decision numbers keep their names to stay greppable; new rulings are numbered V2-*.

| # | Decision | Ruling |
|---|---|---|
| **V2-1** (was R4-1) | Does the widget write? | **No — capture is retired from the widget entirely.** The PM's own on-device verdict on build 35: the widget is for *knowing what's been logged today* and *getting back into Culprit fast*; limited real estate + "which meal would it even log?" kills Home-Screen capture. Every element is a deep link; the dashed **Log ›** door opens quick-log. Reverses v1 D1–D3. W4's App Intents are **kept, parked** as the B-291 Siri/Action-Button rail — surfaces where voice/hardware makes the event unambiguous, which is where capture belongs. |
| **V2-2** (rounds 5–6) | Layout | **"J, grounded"** — content-gated stat-tile grid + permanent ground band + the Up-next tile (round-6 V1 placement, PM-picked). The round-5 reaction set the register: summarized facts win; the raw ledger (I) and the time-axis (E) are rejected; H's bottom graph is promoted to a structural band. |
| **V2-3** (was R4-2) | Symptom naming on the widget | **Name it** ("Vomiting ×2"), the frames' assumption, ratified by reaction through three rounds. The Home Screen is post-unlock, so this sits within the shipped T&S posture. **Escape valve recorded, not built:** a per-widget "discreet wording" Edit-Widget toggle ("2 symptoms logged") if dogfooding surfaces the houseguest-glance problem — backlog it only if it does. Lock-Screen accessories (parked) keep the stricter rule: counts and state only, never symptom text. |
| **V2-4** (was R4-3) | The look-ahead | **Kept and promoted** — the "usually ~5p · not logged yet" element is the Up-next tile (§2.4). The PM: "might be a powerful nudge if we can actually pull it off." We can: it renders the learned-window field the snapshot already carries (`lib/widgetResolution.ts`, `SLOT_MIN_DAYS` ≥ 4 distinct days). |
| **V2-5** (was R4-4 + round-5 scope call) | Size classes | **systemMedium only in v2.** Smalls (round-4 Candidate G) parked until the medium proves out on-device — B-481's lesson: prove one surface renders reliably first. |
| **D4** (v1, carried) | Monetization | **The widget ships free.** Unchanged; an informational widget is even more clearly care, not convenience. The v1 §10 Tier-2 D-M1 amendment edits are still pending PM confirm and carry forward. |
| **D5** (v1, carried) | Multi-pet | **Per-widget pet binding at placement** (slot enum, sticky/tombstoned index, never follows the in-app active-pet switch — B-086). Multi-pet households stack one widget per pet. Unchanged. |
| **D6** (v1, carried, reshaped) | Feeding arrangements | Arrangement-driven facts carry: a free-fed component renders as the **bowl** fact ("Bowl topped 8:05a" in the meals tile's sub-line or its own tile when it's the day's only meal fact) — an arrangement re-attest, never an intake claim. A grazing pet with no learned window never grows an Up-next tile, so the grazing baseline never reads as a missed obligation. |
| **D7** (v1, carried) | Platform | `expo-widgets` / SDK 57 / App Group snapshot pipeline / EAS-built extension — the W2/W3 rails are the whole architecture now (§4). |
| **D8** (v1, reshaped) | Event-class scope | v1 excluded med/symptom **capture**; v2 has no capture, so the exclusion dissolves. **Display** of all four classes (meals, treats, meds, symptoms) is in scope as record facts. Med display obeys the med-strip register (§2.3): confirmation counts, never "missed"/"due", and a **denominator only when the regimen's cadence is known** (the B-614 confirmability gate, applied to display). |
| **D9** (v1, carried) | AI on the widget | **None.** No Signal/AI copy, no reads, no reassurance on a refresh-lagged surface. Unchanged. |

---

## 1. The widget's jobs (PM-defined, round 4)

1. **Answer "what's been logged today?" at a glance** — meals, treats, meds, symptoms; the kitchen-counter accountability question answered in under two seconds without opening the app.
2. **Be the fastest door back into Culprit.** Every element deep-links somewhere specific. Logging happens in the app; the widget points at it and never impersonates it.

**Non-goals:** no writes (V2-1); no notifications (the widget stays the anti-nag surface — the Up-next tile is ambient state, §2.4, and does not touch the Principle-4 budget); no AI (D9); no monetization state; no streaks/scores/praise; no per-person household stats (pet-centric only).

---

## 2. The design (design-locked to the round-7 mock)

One `systemMedium` widget. Reference: `docs/culprit-widget-mockups.html` round 7 — its geometry was screenshot-verified and **is the contract**; round 6's flexible-height jank is the counterexample that made fixed shares a requirement, not a preference.

### 2.1 Geometry — the strict vertical budget
In the mock's 364×172 px frame (content = 149 px after 12/11 padding): **header 16 · gap 6 · tile grid 94 (two 44 px rows, 6 px gap) · ground band 33 (6 gap + 1 px hairline + 6 pad + 20 row)**. The build maps these proportions to pt; the invariant is that **every region has a fixed share and no region competes**. Tile typography is metric-locked (label 11 px line / value 17 / sub 11 inside a 44 px row); **every text line clips with an ellipsis — nothing wraps, nothing overflows.**

### 2.2 Header
`CulpritMark` (16 pt, static — never pulses here) · pet name · right-aligned context line: trial day during a trial (via the shared `contextLineFor`, including the overrun rule — `Day 61 · 5d past`, never `Day 61 of 56`), else the arrangement shape (`free-fed + meals`), else empty.

### 2.3 The tile grid (content-gated)
2×2 grid of fact tiles. **A tile exists only when its class carries information today; a missing tile is never a claim.** Tile anatomy: glyph + small-caps label / value line (count + recency in the value's unit style) / one name sub-line.

**Priority order (fixed):** ① **Symptom** — whenever ≥1 symptom event is logged today; **always renders, always top-left, never dropped** (Principle 3). One tile aggregates per symptom type shown as the label ("Vomiting ×2"); multiple distinct types render the most recent type with the total in the sub-line — build detail, Designer call at implementation. ② **Meals** ③ **Meds** ④ **Treats** ⑤ **Up next** (§2.4) ⑥ **Trial record** (during a trial: "12 of 12 days") ⑦ **Door tile** ("Log · opens Culprit ›"). The first four candidates render; the door tile fills a free slot only — the band's Log › chip is the door's permanent home.

**Glyph vocabulary (shape first, color second — iOS 18 tinted mode / iOS 26 glass):** meal = large filled circle (`colorEventMeal`), treat = small filled circle, med = rounded square (`colorEventMedication`), symptom = rotated square (`colorEventSymptom`), learned window = hollow ring. Every distinction must survive monochrome rendering on shape alone.

**Med tile register (B-614 rules, applied to display):** value = confirmation count. **A denominator ("1 of 2 today") renders only when the regimen's cadence is known** — resolved by the same predicate `lib/medStrip.ts` uses, never re-derived. No cadence → count + time only ("1 · 8:00a"). Never "missed", never "due", never a compliance bar, never a cheery line.

### 2.4 The Up-next tile (V2-4)
- **Presence rule:** renders only while a **learned meal window** (`lib/widgetResolution.ts`, ≥ `SLOT_MIN_DAYS` distinct days) lies **ahead of now and has no logged meal against it today**. No stable window → no tile, never a guessed one. Once the meal is logged, the tile vanishes (the fact moves into the meals tile).
- **Style:** outlined (unfilled = not yet happened — the same filled/hollow grammar as the glyphs). Copy: the slot name + `usually ~5p · not logged yet`.
- **The tone rule (non-negotiable):** after the window passes unlogged, the tile keeps the **identical neutral form** — no color change, no urgency, no imperative copy, ever. It resets at local midnight with the day (B-156 G1: unanswered = a visible, calm gap). The nudge is the visibility, never the tone.
- **The honest edge, accepted:** in a multi-device household, a partner's log on another device can leave this device's tile saying "not logged yet" until this app next runs. The copy asserts the **routine** ("usually ~5p"), not the world — same edge the v1 status column carried.
- **Tap:** deep-links to quick-log with meal preselected — the door, aimed.

### 2.5 The ground band
Full-width footer under a hairline, present in **every** state:
- **During a trial:** the trial-day strip — one dot per trial day (filled = a day with logged events, hollow = a gap, today accented; **when the trial exceeds ~14 days, show the most recent 14 dots**; the caption always totals the whole trial: `11 of 12 trial days logged`). **All trial numbers come from the shared `lib/dietTrial` day math** — the widget introduces no third definition (the §5.3 one-predicate lesson), and its device-zone day boundary is the sanctioned widget/publisher path (B-514). Coverage language only — the strip describes the *record*, never the trial's outcome.
- **Otherwise:** the 7-day pips — per local day: a tick (≥1 event logged) + a rose pip (≥1 symptom logged), today outlined. Label `last 7 days`. Coverage ≠ wellness; a bare day is "nothing logged," never "nothing happened."
- **Always:** the dashed **Log ›** chip, right-aligned → quick-log.

### 2.6 States
1. **Resting** (Day-A/Day-B frames) — grid + band as above.
2. **Empty day** — headline line `Nothing logged yet today` + single-row grid (Up-next tile if a window is ahead + door tile) + band. A designed state (Principle 5), never a nag, never "all quiet."
3. **Complete evening** — no window ahead → no Up-next; the slot self-heals (trial-record tile or door). Reads complete as a *record*, never as praise.
4. **Doors** (carried verbatim from v1): signed out / unbound slot / tombstoned pet — whole-widget message states, always a Link into the app.
5. **Midnight/stale:** the `dayKey` staleness rule carries — a render on a later local day than the snapshot describes shows an empty day (no carried ticks, counts, or tiles) and drops the context line. Timeline = now + next local midnight entries, `.atEnd`, same as v1.

### 2.7 Copy (draft — `nyx-voice` pass at build; no exclamation marks anywhere)

| Surface | String |
|---|---|
| Empty headline | `Nothing logged yet today` |
| Up next sub | `usually ~{time} · not logged yet` (future window: `usually ~{time}`) |
| Trial caption | `{n} of {m} trial days logged` |
| Pips caption | `last 7 days` |
| Med value (cadence known / unknown) | `1 of 2 today` / `1 · 8:00a` |
| Door tile / band chip | `Log — opens Culprit ›` / `Log ›` |
| Doors | v1's three door strings, unchanged |

**Grep-gated banned vocabulary on this surface:** `missed`, `due`, `overdue`, `all clear`, `all quiet`, `great job`, `streak`, praise of any kind.

---

## 3. Data — snapshot & props v2

`WIDGET_PROPS_SCHEMA_VERSION` → **2**. Everything remains **decided app-side, rendered widget-side** (the W5 architecture finding): the publisher computes facts; the layout is a pure renderer over them.

**Per-pet panel adds:**
- `todayByClass` — per class: `{ count, lastAt, names[], times[] }` (meals/treats/meds/symptoms), meds additionally `{ expectedToday: number | null }` (null unless the `lib/medStrip.ts` cadence predicate resolves — §2.3), symptoms additionally the leading type label.
- `upNext: { label, approxTime } | null` — from the existing learned-window resolution, ahead-of-now + unlogged computed **at publish**, re-evaluated on each app foreground/sync tick.
- `sevenDays: [{ dayKey, logged, symptomLogged }]` — record coverage, local days.
- `trial: { day, target, daysLogged, daysElapsed, stripDays: [{ logged }] } | null` — all values from the shared `lib/dietTrial` helpers; invariant `daysLogged ≤ daysElapsed` (property-tested in the lib already).
- **Removed:** `pending`, `revoked`, per-slot `ui` picker state — the outbox and its undo machinery leave the props contract entirely. `mealChoices`/`treatChoices` leave the panel (nothing picks).

**Upgrade rule (one-time, in the rebuild PR):** before first publishing v2 props, the app **drains any residual v1 outbox** through the existing `lib/widgetBridge` path — a build-35 user's un-drained tap must not be dropped by the schema flip. The layout reads `schemaVersion` and renders the sign-in door on a mismatch rather than garbage.

`logged_via` (W1) is untouched and stays the provenance rail for B-288/B-291. No schema migrations — this is all App Group JSON.

---

## 4. Architecture

Unchanged rails: **W2** (SDK 57, dev client), **W3** (App Group container, snapshot publisher on foreground/sync/relevant-change, Keychain-shared session, `rls-privacy` posture — though v2's widget never uses the session for writes; the read path stays snapshot-only, the widget never queries Supabase). The **W5 JSC constraints** stand and are load-bearing (see the `widgets/CulpritWidget.tsx` header + the CLAUDE.md widget-layouts convention): no imports at runtime, no filesystem/network, SF Symbols + system face, flat child arrays, and the eval-in-a-stand-in-context test (`widgets/CulpritWidget.test.ts`) remains the enforcement.

**W4 App Intents:** kept in the repo, tested, **not invoked by the widget**. They are the B-291 free-rider rail (Siri phrases / NFC / Action Button / Back Tap), where capture belongs because the trigger disambiguates the event. `lib/widgetBridge`'s drain survives solely for the §3 one-time upgrade drain, then its call sites retire.

**Deep links (all existing routes):** tiles → History filtered to today + class · symptom tile → the day view · Up next → quick-log (meal preselected) · trial elements → the trial card · pips → calendar · door → quick-log · header → Home. Carry the v1 `ts`-nonce lesson on History links.

---

## 5. Acceptance criteria (v2)

1. **No widget state can write.** Every interactive element is a `Link`/deep link; the props contract contains no outbox. (The v1 capture ACs are void.)
2. Tiles are content-gated; a class with nothing logged renders no tile; the **symptom tile renders whenever ≥1 symptom is logged today and is always first** — never dropped for layout.
3. The Up-next tile renders **only** under §2.4's presence rule; disappears when the meal is logged; keeps its identical neutral form after the window passes; is gone at local midnight.
4. The med tile shows a denominator **only** when the cadence predicate resolves; its strings never include the banned vocabulary (grep gate).
5. Trial strip + caption agree with the trial card's numbers on the same fixture (shared-lib test) — no third day-math definition.
6. Midnight rollover renders an empty day — no tick, count, tile, or context line carried across `dayKey` (the v1 staleness tests carry, re-pointed at tiles).
7. Two widgets bound to two pets render independently of the in-app active pet (D5, unchanged).
8. No state renders AI copy, reassurance, praise, monetization, or per-person attribution.
9. The emitted layout string evaluates clean in the JSC stand-in context, and the geometry matches §2.1's fixed shares (structural assertions in `CulpritWidget.test.ts` — row counts, fixed band presence, ellipsized lines).
10. A widget rendered from a stale snapshot (app hasn't run today) shows the empty-day state, never yesterday's facts — on-device check in the B-481 pass.

**Success measure (open, non-blocking):** v1's kill criterion (≥20% capture share) dies with capture. The v2 analog — widget-sourced app opens (a `src=widget` param on the deep links) — needs the B-016 analytics rail; recorded here so the links carry the param from day one, measured later.

---

## 6. Dev & QA workflow

Unchanged from v1 §6: widgets need the custom dev client (no Expo Go), **widget UI is not OTA-able** — every visual iteration is an EAS binary, PM previews ride TestFlight cuts. The B-481 on-device pass (which of the states actually renders) folds into this track's PR 3 rather than running against the doomed v1 layout.

---

## 7. PR plan

Schema isolation n/a (no migrations). One PR per session; standard DoD; the Migration Safety Pre-flight does not apply.

| PR | What | Gates / notes |
|---|---|---|
| **V2-PR-0** | **This spec + the mock + records** — v2.0 at the canonical path, v1 frozen verbatim, CLAUDE.md Read-These row updated, rounds 4–7 mock history | ✅ ships via **#563** (this branch) |
| **V2-PR-1** | **Snapshot v2, additive** — `lib/widgetSnapshot`/`widgetProps`: `todayByClass`, `upNext`, `sevenDays`, `trial` builders + types, all **alongside** the v1 fields (nothing consumes them yet; build-35 widgets keep rendering v1 props). Med denominator via the `lib/medStrip` predicate; trial numbers via `lib/dietTrial`. Full unit tests incl. timezone-honest fixtures (B-514 — the widget path deliberately uses the device zone) | Tests mandatory (lib logic); `code-reviewer`. Parallel-safe with everything |
| **V2-PR-2** | **The layout rebuild** — `widgets/CulpritWidget.tsx` v2 (header/grid/band/Up-next/doors per §2), props flip to schema 2, v1 fields + outbox/undo/picker code deleted from layout & props, the §3 one-time residual-outbox drain, JSC eval + structural-geometry tests, `nyx-voice` pass over every string | Designer + `pm-feature-review`; `code-reviewer`; the banned-vocabulary grep gate lands here |
| **V2-PR-3** | **On-device + B-481 closure** — fresh dev-client build from post-PR-2 `main`; walk every §2.6 state on the PM's device (incl. stale-snapshot and two-pet stacking); fix render defects found; close **B-481** with the findings | Needs the device + the PM; findings may loop one fix PR |
| **V2-PR-4** | **TestFlight cut** (Runtime A session) — native `eas build` (widget UI is not OTA-able), PM lives with it | The v1 W6 redo, on a widget worth living with |

**Parallelism:** PR-1 is independent and can land immediately; PR-2 queues behind it; PR-3/4 need the PM + device. The Ask A5/A7 track, B-661 notifications, and everything else in flight are disjoint — the one shared-file collision is `STATUS.md` at wrap. **Carried Tier-2 edits (still awaiting the PM's one-word confirm, from v1 §10):** the D-M1 "Home-screen widgets" Premium-bullet amendment in `docs/monetization-and-throttling-requirements.md` + the B-263 paywall-bullet swap.

---

## 8. Safety & privacy invariants (restated for this surface)

- **Fail-safe honesty:** a filled mark/count exists only where logged rows exist; hollow = not yet happened; unanswered = a visible calm gap; midnight empties the day (B-156 G1 generalized).
- **Absence is never wellness:** `Nothing logged yet today` is a record fact; no state reads as an all-clear; the pips describe logging coverage, never health.
- **Intake is not preference / n=1 never reassures:** the widget records and displays; it never interprets, rates, or reassures. No AI (D9).
- **Med display:** confirmation register only; the confirmability gate governs denominators (B-614).
- **Household visibility is pet-centric only:** no per-person counts or attribution, ever (T&S surveillance guardrail).
- **Access control:** read path is snapshot-only (no Supabase queries from the extension); the App Group holds one account's data and is wiped on sign-out/account-swap (`wipeLocalSession` — the B-576 lesson applies: the publisher re-arms on session transitions, so wipe ordering matters); Lock-Screen surfaces remain parked with the stricter pre-auth rule.

---

## 9. Parked (not dropped)

| Item | State |
|---|---|
| Small widget (round-4 Candidate G: one synthesized fact / trial ring) | Behind the medium proving out (V2-5); one snapshot already feeds it |
| Lock Screen accessories / StandBy audit | Phase 2; pre-auth rule recorded (§8) |
| Siri / NFC / Action Button / Back Tap capture (B-291) | The W4 intents rail, unchanged — capture lives where the trigger disambiguates |
| "Discreet wording" per-widget toggle | The V2-3 escape valve; build only if dogfooding surfaces the problem |
| Widget-sourced-opens metric | Links carry `src=widget` from PR-2; measurement waits on B-016 |
| Multi-symptom-type tile treatment | Designer call at PR-2 (§2.3 ①) |
