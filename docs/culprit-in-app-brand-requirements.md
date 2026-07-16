# Culprit In-App Brand Alignment — Requirements (B-284)

**Version:** 1.0 (build-ready) · **Date:** 2026-07-10 · **Owner:** Sr. Product Designer, ratified by PM through four review rounds
**Provenance:** `docs/brand/culprit-direction.html` (the brand system) → `docs/brand/culprit-in-app-direction.html` (r1) → `-r2.html` (r2) → `-r3.html` (r3) → the PM's iteration-3 reactions (2026-07-10). All four are durable records in `docs/brand/` (see its README).
**Build plan:** §10 — PRs N1–N7. Zero new dependencies (`react-native-svg 15.12.1` + `expo-linear-gradient` already shipped).

This spec turns the locked design direction into per-PR behavior contracts and acceptance criteria. Where the PM's last reaction was uncertainty rather than a call, the spec builds the reversible thing and names the decision gate — it does not guess.

---

## 1. The rules (locked across all rounds)

1. **The carve rule.** The crescent is always drawn as a **mask/cutout** — never by laying a filled circle over the ground. The sky (and any gradient on it) must pass through the crescent's opening. This applies to every rendering of the mark, at every size, in every medium.
2. **The register rule.** Night grounds appear where the app is **working on the pet's behalf** — the Landing, loading beyond a beat, the night moment. Capture and records (quick-log, History, Foods, Profile, the vet report) stay the shipped light system, untouched. The Signal card's ground is governed by §7.
3. **One interactive accent.** Teal `colorAccent #00C2A8` remains the sole tappable/live accent on every ground. Indigo is only ever a world/ground color. Red keeps its shipped meanings (symptom / destructive) and is never decorative.
4. **No metaphor framing.** PM-explicit: no weather/rain/forecast language anywhere — not in copy, component names, code comments, or docs. Rendering behavior is described mechanically ("renders when findings exist"), never analogically.
5. **Motion budget.** At most one ambient loop per screen. The header mark's pulse runs only while a fresh finding is unseen. All loops: native-driver transforms only, paused on app blur, fully disabled under reduced-motion (each animated component defines its static frame).
6. **Voice.** Every user-facing string in this spec is nyx-voice-governed (no exclamation marks; warm, specific, honest; absence is never wellness). Verbatim strings live in §9 and are the source of truth for the build.

---

## 2. Tokens — PR N1 (prerequisite for everything)

Additive `constants/theme.ts` entries. The r2 dusk/tint values are **dropped** (dead with the r2 treatments); this is the reduced, final set.

| Token | Value | Role |
|---|---|---|
| `colorEventSymptomOnNight` | `#FB7185` | Safety rail/tag on night grounds (6.8:1 on `#13112E`). Sibling of the shipped `colorDestructiveOnDark` precedent. |
| `colorTextOnNight` | `#ECEAF6` | Primary text on night grounds (15.4:1). |
| `colorTextOnNightMuted` | `#A6A2CE` | Secondary text on night grounds (7.6:1). |
| `colorTextOnNightFaint` | `#706BA6` | Metadata/sample lines on night grounds (large/secondary only). |
| `colorMoonlight` | `#F2EEE4` | The crescent fill + display headlines on night grounds (15.8:1). |
| `colorBorderOnNight` | `rgba(196,190,255,0.16)` | Hairlines/dividers on night grounds. |
| `colorAuroraViolet` | `#221C56` | Radial glow stop 1 (the hero gradient the PM ratified). |
| `colorAuroraIndigo` | `#191449` | Radial glow stop 2. |
| `colorAuroraTeal` | `rgba(0,194,168,0.10)` | The restrained teal radial near the Signal dot. |
| `colorStar` | `rgba(255,255,255,0.45)` | Starfield dot base (per-dot opacity varies 0.28–0.55). |

Existing tokens consumed, unchanged: `colorBrandNight #13112E`, `colorBrandNightElevated #251F57`, `colorAccent`, `colorAccentSoft`.

**AC-N1:** tokens additive only; no component repoints; `tsc` clean; a token-file comment carries the §1.3 accent rule and the contrast receipts.

---

## 3. `CulpritMark` — PR N2 (LOCKED, r1 reaction: "absolutely, ship it")

The one brand-mark component. Replaces the lucide `Moon` in `AuthBrandMark` and the text-only header wordmark.

**Geometry.** SVG, viewBox 100×100: moon disc `cx45 cy50 r33`, carve circle `cx61 cy43 r29` applied as a **mask** (rule §1.1), Signal dot `cx66 cy53 r9`. Dot nudges to `r10.5` at rendered sizes ≤24px (the icon kit's small-size rule). Crescent fill: `colorMoonlight` on night grounds, `#211E4E` (deep indigo) on light grounds; dot always `colorAccent`.

**Props.** `size` (px), `ground: 'light' | 'night'`, `live: boolean` (the pulse), `withWordmark?: boolean` (adds "Culprit" in `fontDisplay`, `trackingTight`).

**The pulse contract (locked, r2 §2).**
- `live=true` while a fresh finding set exists in the signal cache that the owner has not viewed since it landed; flips false when the Signal zone is viewed (screen focus with the zone on-screen, or tap-through).
- Motion: dot scale 1→1.12→1 at 2.6s ease-in-out + one ping ring (scale .66→2.1, opacity .9→0) per cycle. Native driver.
- **Never used for safety escalation** — safety leads in the Signal zone itself with its rail; the pulse is a neutral "something new."
- Reduced-motion: static dot with a soft glow (`shadowRadius` bloom), no ring, no scale.

**Placements in this PR:** `HomeHeader` (wordmark row → mark + wordmark, `live` wired to signal cache state; tap scrolls to the Signal zone) and `AuthBrandMark` (glyph swap only — `compact`/`hero` sizes preserved, no pulse on auth).

**AC-N2:** carve renders as a true cutout over any ground (test: place on a gradient, assert no occluding fill — snapshot on both grounds); pulse starts/stops per the contract (unit-test the state selector); a11y label "Culprit"; header tap target ≥44pt; existing auth-screen tests updated, none deleted.

---

## 4. The Landing hero — PR N2b (LOCKED + iteration-3 addition)

PM (r3): "Genuinely genius. We need to ship this." Iteration 3: **"Perfection if we add a star element in the background."**

**Composition (top → bottom):** full-screen night ground (`colorBrandNight` + the two aurora radials) with a **full-bleed starfield across the entire ground** (the iteration-3 addition — not confined to the stage band): 10–14 dots, sizes 1–1.6px, opacities 0.28–0.55, two slightly brighter "anchor" stars in the upper third; then the hero stage (the carved moon at ~44% width, glow + ping loop on the dot), the "Culprit" wordmark (`fontDisplay`), the one-line positioning sub ("Track symptoms, find triggers. Walk into your next vet visit with answers, not guesses."), the existing Create-account / Log-in stack unchanged.
- The starfield is a static SVG (no twinkle animation — the ping is this screen's one ambient loop, rule §1.5).
- Replaces the current logo row on `app/(auth)/index.tsx`; the ValuePreview pager and CTA behavior are untouched.

**AC-N2b:** stars render across the full ground (not just behind the moon); exactly one ambient loop on-screen (the ping); reduced-motion = static glow, no ring; the Landing's existing a11y grouping and 44pt targets preserved; screenshot-test both grounds of the moon vs. the gradient (carve rule).

---

## 5. `WhorlSpinner` + the loading system — PR N3 (LOCKED tiers 1–2; PTR locked; night moment per §6)

**Tier 1 — skeletons (<~1s).** Content-shaped shimmer placeholders on content surfaces (Patterns cards, History, detail screens). No Whorl at this duration.
**Tier 2 — `WhorlSpinner` (~1–10s, in-place).** Four concentric arc ridges counter-rotating (periods 9/14/19/25s, alternating direction) + the core dot breathing at 2.6s. Sizes `sm` (20–24px) and `md` (44–56px). Grounds: `day` (teal/indigo-lavender ridges) and `night` (teal/moonlight ridges). Replaces every bare `ActivityIndicator` (~25 call sites — mechanical sweep; each site chooses tier by expected duration, defaulting to `sm`).
**Pull-to-refresh sky (LOCKED, text-light per iteration 3 of r2→r3).** Pulling Home reveals a night band (~112pt) — stars + `WhorlSpinner sm night` + **one muted line: "Checking for anything new…"** — then retracts on settle. **Zero-text variant is the pre-approved fallback** if the line reads busy on-device. No other copy. Ships here because it consumes the spinner.

**AC-N3:** no `ActivityIndicator` remains in `app/` or `components/` (grep gate) except inside `PrimaryButton`'s existing loading prop (its own shipped pattern — swap is optional polish); spinner loops pause on blur; reduced-motion shows the static Whorl frame (arcs at rest, dot static); PTR band respects safe-area; PTR copy is the §9 string verbatim or absent.

---

## 6. The night moment — PR N3 (revised by iteration 3; D7 CLOSED by this spec)

PM r2: didn't grok → r3 full-bleed: "is it too big. Maybe there's a world where whorl is medium large but in background."

**Definition (unchanged, one sentence):** when a wait is full-screen — the app has nothing else to show yet — the wait itself becomes a branded screen: the night, the Whorl, one warm line.

**Final composition (the iteration-3 middle):** night ground + aurora + starfield; the Whorl at **medium-large scale — 0.9–1.1× screen width, centered upper-middle — rendered as a background layer at 40–55% stroke opacity** (a texture the copy sits over, not a foreground graphic; r3's 85–100% full-bleed is superseded). Core dot stays full-opacity (it's the one focal point). Copy block lower-third: title + one short line (§9). The exact scale/opacity inside the specced ranges is an **on-device tuning AC** — locked at the N3 QA pass on the PM's phone, then recorded here.

**Trigger rule (unchanged from r2/r3, ratified by silence + "LOVE it"):** all three must hold — full-screen blocking wait AND expected >~2s AND real work on the pet's behalf. Qualifying: cold-start hydration (`ColdStartOverlay` rebuilds onto this), vet-report generation (`app/report.tsx` build state), food/med photo extraction waits. Never: card loads (skeletons), PTR/saves/retries (spinner), anything under ~2s. Minimum hold 600ms; dissolve to the destination screen over ~700ms.

**AC-N3b (rides PR N3):** plays end-to-end on cold start (night → dissolve → Home); whorl opacity/scale within spec ranges pending the device lock; one ambient loop (the whorl counts as one composition); reduced-motion = static composition, copy carries the moment; the three qualifying call sites adopted, no others.

---

## 7. The Signal card — PR N4 (D8 resolved to a decision gate)

Four rounds of reactions: r1 "direction genuinely good, contrast too high" → r2 treatments "hate it" → r3 rule "love the improvement" but iteration 3: **"not sure I love the dark background at all."** The spec honors the uncertainty: **the content system ships ground-agnostic; the ground itself is a one-flag variant decided on-device, where contrast is real.**

**7.1 Content system (ships regardless of ground — all of this is PM-loved):**
- **Presence rule:** the styled Signal card renders **only when established findings exist**. Building state (first days) and nothing-established state render the plain treatment (7.3). No metaphor language describes any of this (§1.4).
- **Safety findings** wear the design system's danger styling exactly as shipped: the rail + tag in `colorEventSymptom` on light ground / `colorEventSymptomOnNight` on night ground. Ranking, detection, phrasing, guardrails: untouched — this PR is presentation only.
- Lead finding keeps the Newsreader `textSignal` treatment (ink on light / `colorMoonlight` on night); secondary findings in the body face; per-row expand ("Why we're showing this") unchanged.
- The Patterns AI-summary card adopts the same ground decision (it's the same voice — one flag governs both).

**7.2 The ground flag.** `SIGNAL_NIGHT_GROUND: boolean` in `constants/flags.ts` (the shipped flag pattern). `false` → the card is the standard light elevated card with night **accents** (the label dot, teal label, the mark's atom). `true` → the r1 night-sky ground (indigo gradient + stars + aurora, `colorBorderOnNight` hairlines) with the §2 night text tokens. Both variants fully built and snapshot-tested; flipping the flag is a one-line change with no content difference.

**7.3 Empty + building states (LOCKED — the "quiet night" language is dead, r3):** always the plain light card. Empty: the small crescent glyph + the §9 "No established patterns yet" copy. Building: the same card with `WhorlSpinner sm` + the ghost previews (shipped copy). Never a dark card with nothing to say.

**7.4 The decision gate (this closes D8):** PR N4 ships with the flag **`false` (light default)**. The N4 Dev-Handoff QA script includes a 2-minute A/B on the PM's device (flip, relaunch, compare against a live finding + a safety finding). The PM's call on-device locks the flag's shipped value and is recorded here as D8-final. Either outcome is a supported, tested state — no rework.

**AC-N4:** presence rule unit-tested (findings → styled card; none/building → plain card); both grounds snapshot-tested with a safety + an ordinary finding; danger styling identical in semantics across grounds; empty/building copy verbatim from §9; zero changes under `supabase/functions/` or `lib/signal.ts` ranking/phrasing; the on-device ground call recorded before merge (the PR may merge flag-false with the gate noted if the PM defers).

---

## 8. Calendar v3 — PR N5 (D10 CLOSED; resolves B-226) · The briefing — PR N7 (D9 adopted directionally)

**8.1 Calendar v3 (final shape — PM answer: cut the strip; no iteration-3 objection):**
- **Pips:** 1–3 episodes → 1–3 rose dots (`colorEventSymptom`, 5px, 2px gaps); ≥4 → `×N` numeral in the same rose. Day numeral darkens + semibolds on symptom days. The opacity heat ramp (`HEAT_OPACITY_STEPS`) and its legend are **deleted**.
- **Month paging:** ‹ › through calendar months (and swipe), bounded oldest-data → current month; future disabled. Weekday header stays; leading/trailing blanks pad as today.
- **Summary line** above the grid: "Vomiting on 5 days · most on Jun 24 (×4) · 9 episodes" — computed, exact; empty month: "No vomiting logged in June."
- **Day drill-in:** any day cell (≥44pt at device scale) opens a sheet listing **every** event that day (type icon, label, time) with "Open in History ›" deep-linking day-filtered. Cells carry full a11y labels ("Jun 24, 4 vomiting episodes").
- **Coverage ticks:** off-by-default toggle "Show all logging" — a 2px neutral tick on days with ≥1 event of any type; a bare day under the toggle = nothing logged (coverage ≠ wellness, and the label never implies otherwise).
- **Cut:** the six-month strip. Its read ships instead as a one-line "symptom months" entry in the **vet report** (routed to the Step 9 track — backlog note, not this PR).
- **AC-N5:** `buildHeatRows`' weekday math reused/retested; B-226's three complaints each have a passing AC (drill-in shows all types; paging works across month boundaries incl. DST months; no shade-decoding anywhere); pip counts render exactly; VoiceOver reads day labels; History deep-link lands filtered.

**8.2 The Home briefing (iteration 3: "Love the improvement… moved the ball downfield" — adopted, iteration expected):**
- Content-gated cards in fixed priority: cross-pet safety → Signal → Today → Care due → Diet trial → Trend → Weight. A card renders only when it carries information today (no meds → no Care card; no trial → no trial card). **Safety is never gated, capped, or reordered.** A pet with none of the extras sees exactly the current three zones.
- Care due: at most one row per day, factual copy (§9), one-tap "Log dose"; never a push notification (Principle 4 untouched).
- **Requires the Tier-2 `design-principles.md` §3 edit** — proposed replacement text ships in this PR's description for formal PM ratification (Tier-2 protocol); the PR merges only with that sign-off.
- "More we can do" (PM) → post-v1 iteration is expected; candidates tracked in backlog (ordering signals, card-level polish), not speculatively built here.
- **AC-N7:** gating pure-function unit-tested per scenario (rough morning / ordinary / healthy fixtures from r3 §4); safety-never-gated asserted; every card is a doorway (no dead ends); zero cards render that carry no information.

---

## 9. Copy (verbatim — nyx-voice-checked; no exclamation marks anywhere)

| Surface | String |
|---|---|
| PTR sky | `Checking for anything new…` *(or no text — pre-approved fallback)* |
| Night moment — cold start | `Catching up on {pet}'s history…` / `This only takes a moment.` |
| Night moment — report | `Building {pet}'s report…` / `Pulling together the full record.` |
| Night moment — photo read | `Reading the label…` / `A few seconds.` |
| Signal — empty | `No established patterns yet.` / `Nothing in the last month of logs has cleared our evidence bar. That isn't an all-clear — keep logging, and the moment something clears it, it'll be here.` |
| Signal — building | *(shipped `buildingIntro` + ghost previews — unchanged)* |
| Care due | `{Drug} — evening dose` / `Usually given with food` / `Log dose` |
| Completion — trial tick | `Day {n} of {total} — logged` |
| Landing sub | `Track symptoms, find triggers. Walk into your next vet visit with answers, not guesses.` |

Banned vocabulary (grep gate in every N-PR): weather, rain, forecast, climate, storm — zero occurrences in code, comments, copy, or tests (word-boundary match; "JetBrains" et al. exempt).

---

## 10. Build plan + completion moment + decision log

**PR order:** **N1** tokens → **N2** CulpritMark (+header/auth) → **N2b** Landing hero → **N3** WhorlSpinner + skeleton sweep + PTR + night moment → **N4** Signal card (+ the on-device ground gate) → **N6** completion → **N7** briefing (+ §3 Tier-2 edit). **N5 calendar is fully parallel** with N2–N4 (disjoint files; the one collision is STATUS.md at wrap). One PR per session; each emits the standard Dev Handoff with an on-device QA script.

**Completion moment — PR N6 (D11, resolving by default):** the base teal ping on log-save is **in scope** (ratified r1 "love it"). The r2 pushes ride along with a pre-approved cut-line: the landing arc (dot arcs to the Home tab, one glint, ~800ms, native-driver) and the trial tick line ship together; **if the arc reads busy on-device, ship ping + tick only** — the fallback needs no PM round-trip. No streaks, no gamification, symptom logs keep the calm tone (no gold).

**Decision log (final states):**
| # | Decision | State |
|---|---|---|
| D1–D3, D5, D6 (r1) | Superseded/absorbed: D1→§7's gate, D2→N7, D3→N5, D5→rule §1.5, D6→N6 | Closed into this spec |
| D4 | Night tokens | **Closed** — §2 (dusk/tint dropped) |
| D7 | Night moment | **Closed** — §6 (medium-large background whorl per iteration 3) |
| D8 | Signal ground | **Closed as a gate** — §7.4 (light default; night variant flag; on-device call locks it) |
| D9 | Home briefing | **Adopted directionally** — §8.2 (merge gated on the Tier-2 §3 sign-off) |
| D10 | Calendar v3 | **Closed** — §8.1 (strip cut; months-read → vet report) |
| D11 | Completion pushes | **Closed with a cut-line** — §10 |

**Out of scope, explicitly:** the vet report's rendering (Principle 6 — no decoration; only the §8.1 "symptom months" routing note touches that track, as a future Step 9 item); the paywall's `colorSurfaceDark` canvas (KEEP-BOTH decision stands); B-061 app-wide Geist rollout (composes, separate); any engine/detection/phrasing change (none of these PRs may touch `supabase/functions/` or ranking logic).

**Persona sign-off (spec):** Designer ✓ (four rounds consumed; uncertainty resolved as gates, not guesses) — Jordan ✓ (log path untouched in every PR) — Sam ✓ (calendar answers one question exactly) — Dr. Chen ✓ (danger semantics unchanged; absence-≠-wellness held in §7.3/§8.1 copy) — Data Scientist ✓ (presence rule + counts stay deterministic; no new verdicts) — Dir. of Eng ✓ (zero new deps; flag pattern reused; grep gates) — QA ✓ (per-PR ACs; reduced-motion matrix; contrast receipts §2).
