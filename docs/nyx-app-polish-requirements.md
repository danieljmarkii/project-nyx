# Culprit — App Polish Requirements (Aug 2026)
**Version:** 1.0 | **Status:** BUILD-READY | **Last Updated:** 2026-08-22

The build contract for the **Aug. 2026 Design Polish** track (Linear project, team Culprit). Born from the 2026-08-22 design/UX session: a four-lens audit (Jordan capture · Sam multi-pet · Designer periphery · PO Linear reconciliation) → three mock rounds, every decision PM-ruled same day. This doc is canonical; the Linear project links it as a Resource and the repo file wins on divergence.

**Design authority:** mock round 3 (`docs/culprit-app-polish-round3-mockups.html`) as amended by the §0 final rulings, with rounds 1–2 as deliberation records. Mock artifacts: rounds 1/2/3 are linked on CUL-580.

---

## §0 Decision record (all PM-ruled 2026-08-22)

| # | Decision | Ruling |
|---|---|---|
| D1 | Tab bar shape | **B+C hybrid** — glyphs + labels; the Pet tab is the pet (avatar + name). |
| D2 | Pet-tab long names | **Fallback ladder ratified** (R2-1): full name @11pt → 10pt → the word "Pet". Never a mid-word cut. Full name always on the a11y label. |
| D3 | Home header | **H2a — one row, the pet alone.** The pet's **photo** avatar + name is the left anchor ("when my wife saw Nyx's photo she was delighted"); the crescent leaves Home's chrome (brand keeps Landing / loading / night surfaces — Tier-2 edit to the B-284 §3 contract, flagged §10). Known-and-accepted: the pet appears twice on screen (header photo + tab mini) — the photo is the warmth. |
| D4 | Header "new signal" cue | **Deleted.** The teal dot failed the PM's own read ("not understanding it"); no replacement chrome. The Signal card's live rail + the arrival moment carry "new". **No looping animation in chrome, ever** — closes the ring-train Open Question (header mark removed entirely on Home). |
| D5 | First-insight arrival | **Adopted — dawn sweep** (spec §4, PM: "perfect, love the spec"). |
| D6 | Completion registers | **Adopted whole** (R2-3): two registers (named card + in-place beat), white takeover retired, beats speak the summary sentence, Undo armed, capture paths route through the real cards. |
| D7 | Haptics | **Adopted** — the seven-verb tone-aware vocabulary (§5.6), silence on safety by rule. Ships inside the completion chain. |
| D8 | Trend zone | **Graphic exploration killed** (R3-2 final): the current bar/dot charts stay. Scope = the **verbiage update only** (§6), Dr. Chen-gated, + the already-filed ink fixes (CUL-578). The v2.1 extras (today-mark, whole-card tap, week-pair) die with the exploration; CUL-383 returns to the backlog un-consumed. |
| D9 | Geist rollout | **Adopted; ThemedText wrapper**, swept tab-by-tab (no default-Text magic). Resolves the B-061 Open Question. CUL-364 is the parent issue. |

Out of scope for this track, held in round 1's appendix for their own selection: capture-convergence endgame, Sam's household, The First Week arc, detail-screen shell, multi-med grouped strip (amends B-614 D3 — PM decision only). Defect fallout filed separately: CUL-574…CUL-579 (pulled into the project as standalone fixes).

---

## §1 DP-1 — The tab bar

`app/(tabs)/_layout.tsx` (NyxTabBar) + new glyphs in the `eventGlyphs` house style.

- **Glyphs:** Home (house), History (clock), Foods (bowl) — three new stroke glyphs on the house line (react-native-svg via the shared `GlyphSvg` wrapper, B-745 PR 1 precedent; 1.75 stroke, 22pt). **Pet tab = `PetAvatar` mini** (photo; initial-chip fallback) + the pet's name as the label.
- **Active state:** ink label (weightSemibold) + a 4pt teal tick beneath; inactive = `colorTextTertiary`. Pet tab active = a 2pt `colorAccent` ring on the avatar + ink label. No badge, no motion.
- **The ladder (D2):** label renders the full name at 11pt if it fits the tab's width (minus 6pt side padding); else 10pt; else the literal string `Pet`. Measurement once per name × width, cached (onTextLayout or a char-width budget — implementation's choice, deterministic either way). No ellipsis rung. Multi-pet: the tab always shows the **active** pet; re-renders on switch.
- **A11y:** `tabBarAccessibilityLabel` always the full name (`"Biscuit — pet profile"`); labels stay fixed-size under Dynamic Type (platform tab-bar convention).
- **AC:** 4 tabs render glyph+label at 320pt without wrap/clip · "Schrodingers Cat" falls back to "Pet", "Bartholomew" renders at the 10pt rung · VoiceOver reads the full name in every rung · flag-free (this is not a beta; it replaces the bar outright).

## §2 DP-2 — The Home header (H2a)

`components/home/HomeHeader.tsx`.

- **One row (~52pt + inset):** `[PetAvatar 30 photo] [Name ▾]` left · `[Ask pill] [OwnerAvatar]` right. The whole left cluster is the pet-switcher target (44pt floor); the chevron renders only when `pets.length > 1` (single-pet households keep zero multi-pet chrome).
- **Removed:** the wordmark + `CulpritMark` (and its `live` pulse — D4), the identity line (breed · age; it lives on the Pet tab), the second row entirely. The mark's jump-to-Signal tap retires with it; **SHOULD:** Home-tab re-tap scrolls to top (the standard affordance, restoring the lost jump).
- **Name overflow (header edition):** 17pt semibold → 16pt → tail-ellipsis. The header has no acceptable generic fallback word (a header reading "Pet" is a downgrade, unlike a tab), and the full name is one tap away in the switcher sheet + always in the a11y label — so ellipsis is the header's floor. This deliberately differs from the tab ladder; both are written here so neither is re-derived.
- **Ask pill:** unchanged (allowlist-gated, D5/B-228 placement rules hold).
- **AC:** header height shrinks ≥40pt vs today (Signal rises accordingly) · no looping animation anywhere in chrome · switcher opens from the left cluster · single-pet shows no chevron · `hasUnseenSignal` no longer feeds any header UI (hook consumer removed).

## §3 Cross-cutting rule — chrome motion

**No looping animation in app chrome, ever** (design principles §Motion, PM-reaffirmed with the startup-pulse history). "Something new" is carried by content (the Signal card's live rail), not by chrome. The one sanctioned Signal motion is the arrival moment (§4), which plays once.

## §4 DP-3 — The first-insight arrival moment

`components/home/SignalZone.tsx`, local `Animated` values, no new deps. PM-locked spec:

- **Trigger:** the Signal cache transitions building → live with ≥1 finding AND the per-pet arrival marker is unset.
- **Sequence (~1.2s):** 0ms rail turns live → 250ms the wash begins (teal into a breath of moment-gold, left-to-right, 900ms, ease-out) → building rows dissolve as the first headline crossfades in (400–900ms) → sub-line fades at 1200ms. One soft success tap at 900ms.
- **Once per pet, ever:** AsyncStorage marker `signal_arrival_played:<petId>`, registered in `wipeLocalSession` (B-402 rule — a shared device never replays another account's moment). Device-local; a reinstall may replay once (accepted, harmless).
- **Never for a safety finding:** if the first-ever finding leads the safety band, the card appears plainly and instantly (S1 — plainness is the severity signal) and the marker is set anyway.
- **Reduced motion:** plain crossfade, no sweep; the haptic still fires (touch is not motion). Uses `hooks/useReducedMotion` + pauses on blur per the loading-system convention.
- **AC/tests:** marker-once semantics · safety bypass · wipe-path inclusion · reduced-motion static frame.

## §5 DP-4 — The completion system (multi-PR chain)

Six registers today (named meal card / dose card / MedStrip teal line / full-white takeover / sheet beat / capture-screen ✓ glyph) → **two**:

- **R1 · The named card** — the `MealCompletionCard` anatomy generalized: every full-screen commit (symptom, weight, capture-path meals/doses) lands a warm dark bottom card over a **dimmed** Home (never a white flash). It speaks the record's own sentence via `lib/logCopy` (`"Vomit · found by 5:33 PM"`, `"Weight · 12.4 lb"`) + `Saved to {pet}'s record`, and carries **Undo** + Change time. Symptom tone: calm — no gold, single soft tap.
- **R2 · The in-place beat** — the sheet's mint check, for commits inside a surface (sheet confirm, MedStrip one-tap). Inherits the sentence; MedStrip's confirm gains the mark + haptic.

**Rules:**
- **Sentence rule:** a beat never says a bare "Logged" when `logCopy` can compose the sentence (History-parity derivation — the same `describeOccurredAt` path, so a beat can never over-claim).
- **Undo semantics:** Undo soft-deletes the just-written event (`deleted_at` — the house rule; children/attachments ride the existing soft-delete path) and swaps the card to a quiet `Removed` line. Window = the card's visible dwell. A paired dose already logged against an undone meal keeps its own row; the cross-link resolves against the soft-deleted meal exactly as B-156 B4 already guarantees. Undo never touches sync ordering (the tombstone queues like any edit).
- **Fail-safe unchanged:** B-156 G1 stands — an unanswered card still lands `unconfirmed`, never `given`; Undo adds a reversal, not a new path to an affirmative.
- **Dwell:** the auto-dismiss timer pauses while the owner is touching the card (any interaction resets it) — answers the dose card's 9-chips-in-5s problem without redesigning the chips.
- **Discard guard:** a backdrop tap on a half-filled sheet confirm (photo attached, window adjusted, or note typed) asks before discarding (F9).
- **Capture paths:** `food-capture` fires `showMeal` (intake + Change time stop vanishing — CUL-368's class) and `medication-capture` fires `showMedication`; both hand-rolled ✓ glyphs retire.

**PR chain (ordered; the parent issue carries this plan):**
1. **PR 1 — `lib/haptics.ts`** + wiring into the existing beats (foundation; no visual change).
2. **PR 2 — the named card generalized** + white takeover retired + sentence rule.
3. **PR 3 — Undo** + the discard guard.
4. **PR 4 — capture paths through the real cards** (food-capture / medication-capture).
5. **PR 5 — in-place beat upgrades** (sheet beat + MedStrip sentence/mark/haptic, dwell-pause) + voice/guardrails pass over every beat string.
PRs 3–5 are parallel-safe after PR 2; PR 1 blocks everything.

### §5.6 The haptic vocabulary (D7)

One `lib/haptics.ts`, seven verbs, consumed at the moment stores so a new log path inherits its haptic with its card:

| Moment | Haptic |
|---|---|
| Meal / dose / routine commit | success (soft double) |
| Symptom commit | single soft tap — never the success pattern |
| Chip select (intake / adherence) | selection tick |
| FAB open · pet switch | light impact |
| Pull-to-refresh threshold | light impact |
| Destructive confirm (Remove, End trial, Undo) | rigid |
| Safety card arrival · red-flag reads | **none — deliberate** (plainness is the severity signal; silence is part of it) |

iOS system haptic settings are respected automatically; `expo-haptics` (managed-workflow safe) is the one new dependency.

## §6 DP-5 — Trend verbiage (D8; Dr. Chen-gated)

`components/home/TrendZone.tsx`, copy only — the charts do not change.

- Symptom sublabel: `"↓ from {M} last week — improving"` / `"↑ from {M} last week"` / `"Same as last week ({M})"` → **`"{M} last week"`** (the head already says `{N} this week`; the pair reads complete). `"None this week or last"` stays (factual).
- Feeding sublabel: `"↑/↓ from {M} days last week"` → **`"{M} of 7 days last week"`**; `"Every day this week"` stays.
- The conditional accent coloring of the sublabel (`chartSubLabelImproving`) is **removed** — a colored delta is a verdict.
- **Gate:** final wording ratified by Dr. Chen alongside CUL-568/CUL-571 (the ungated week-over-week cluster) before merge — the change removes arrows + the "improving" verdict, which is exactly that cluster's ask, but the sentence itself gets the clinical read.
- CUL-578's ink repoints (door + labels) ship with or before this (same file).

## §7 DP-6 / CUL-364 — Geist, app-wide (multi-PR chain)

- **PR 1 — `components/ui/ThemedText.tsx`:** wraps `Text`, maps `weightRegular/Medium/Semibold` → the loaded Geist faces (RN doesn't synthesize custom-font weights), passes everything else through. Convention entry appended to CLAUDE.md §Code Conventions on landing ("new owner-facing text uses ThemedText"). No default-Text override — the no-magic rule holds (D9).
- **PRs 2–6 — sweeps**, one per surface family, each a small on-device-verifiable diff: **History tab** → **Foods tab + food screens** → **log flow + pickers + completion surfaces** → **Home zones + profile** → **periphery remainder** (insights, vet files, trial screens, onboarding) + a closing audit (grep: no raw `<Text>` without an explicit family on owner-facing surfaces).
- PR 1 blocks all sweeps; the sweeps are mutually independent (disjoint files — parallel-safe across sessions).
- Existing Geist surfaces (ask, report, settings, night components) are untouched — they're already right.

## §8 Guardrails binding every DP issue

- Theme tokens only; the `*Ink` tokens for accent text on light (CUL-27/CUL-578 convention).
- 44pt tap floors (`hitSlop` where visual size is smaller) — new surfaces don't repeat CUL-579's class.
- nyx-voice on every new string (no `!`, pet-name-first, count-anchored); `clinical-guardrails` on anything touching symptom/safety beats.
- Reduced-motion static frames + pause-on-blur for any animated element (loading-system convention).
- No new schema, no Edge Function changes, no flags — this track is client-only and replaces surfaces outright (the B-745 GA-style two-gate ceremony is not needed for chrome/typography; the completion chain's PR 2 is the one judgement call — if the PM wants it dark first, the B-712 shape applies, default is direct).

## §9 The Linear map — PR by PR (issues created 2026-08-22; the project description carries the same plan)

Project **"Aug. 2026 Design Polish"** (team Culprit). 18 PRs, one PR = one session; defect pairings compress to ~16 sessions. Ordering is enforced by Linear blocking relations.

- **Wave 0 — foundations (run first, parallel-safe):** CUL-604 (`lib/haptics.ts`, §5.6 — unblocks the completion chain + CUL-601's tap) · CUL-605 (`ThemedText`, §7) — **already shipped via #699** (a sibling session, same day), so the Geist sweeps are unblocked from day one.
- **Completion chain (parent CUL-603, §5):** CUL-604 → CUL-606 (named card; takeover retires; sentence rule) → then CUL-612 (Undo + discard guard) ∥ CUL-613 (capture paths; closes CUL-368) ∥ CUL-614 (in-place beats + dwell-pause + copy pass, run last).
- **Chrome (parallel with everything):** CUL-599 (tab bar, §1) · CUL-600 (header H2a, §2).
- **Arrival:** CUL-601 (§4) — best after CUL-604 for its tap.
- **Trend:** CUL-602 (§6) — Dr. Chen brief in-session; **CUL-578's ink repoints ride this PR** (same file).
- **Geist chain (parent CUL-364, §7):** CUL-605 → sweeps CUL-607 (History) ∥ CUL-608 (Foods) ∥ CUL-609 (log flow + completion surfaces — sequence after the completion chain, same card files) ∥ CUL-610 (Home zones + profile — sequence after the chrome PRs, same files) → CUL-611 (periphery + closing audit, last).
- **Defect wave (independent filler):** CUL-574 (wrong-pet captions — early) · CUL-575 (History states) · CUL-576+CUL-577 (one session — both log-capture fixes) · CUL-579 (tap-target batch; the chip half may ride CUL-614). CUL-580 = the closed design record.

**Parallel lanes** (only standing collision: STATUS.md at wrap): **A** completion CUL-604→606→612/613/614 · **B** chrome+moments CUL-599→600→601→602 · **C** type CUL-605→607/608, then 609/610 once lanes A/B clear their files, 611 last · **D** defects as filler.

## §10 Flagged doc edits (Tier 2 — awaiting PM approval to write)

1. `docs/culprit-in-app-brand-requirements.md` §3 (the CulpritMark pulse contract): Home no longer hosts the mark (D3/D4); the pulse states retire. Proposed edit: mark placements = Landing, loading system, night surfaces; delete the Home `live` state.
2. `docs/nyx-design-principles-v1_0.md` §Motion: append one line — "No looping animation in app chrome; content announces, chrome doesn't." (Codifies D4 as a principle-level rule.)

---

## Version History

| Version | Date | Summary |
|---|---|---|
| v1.0 | 2026-08-22 | Initial build contract. All decisions PM-ruled across mock rounds 1–3 same day; session `docs/sessions/2026-08-22-design-ux-opportunities.md`. |
