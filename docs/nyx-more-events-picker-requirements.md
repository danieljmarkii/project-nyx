# More Events / Log Event Picker Redesign — Requirements (B-745)
**Version:** 1.0 — design-locked | **Date:** 2026-08-13 | **Status:** BUILD-READY (F1 confirmed)

The build contract for the FAB → "More events" redesign: the event-type picker rebuilt as a grouped, category-tinted grid that rises as a bottom sheet, with simple events completing on one surface in the daylight confirm register. Product of four same-URL mock rounds, 2026-08-12/13.

**Design authority:** `docs/culprit-more-events-mockups.html` **round 4** (the convergence) — artifact 🗂️, one URL across all rounds. The three round-4 frames are the spec; this doc carries what frames can't.

---

## §0 Decision record (all PM-ruled, 2026-08-12/13)

| ID | Ruling |
|---|---|
| R1 | Shape = **C, grouped compact grid** (Symptoms / Food & care / Body & more; symptoms first). 2-up tiles per the design principles' "large tap targets, not a list" + the B-113 precedent. |
| R2 | Lethargy glyph = **BatteryLow** (Moon retires to the brand crescent). |
| R4 | **Photo-first entry removed** — every log starts from the event. Capability audit clean: photos still attach inside every event flow; the type-step attachment banner + `attachmentUri`-before-type state retire as dead code. |
| G1a | Stool glyph = **the custom line-drawn swirl** (CircleDot rejected). Loose stool's sibling drawn in the same pass, same language. |
| G1b | Vomit glyph = **V1, the splat** (blob + flecks; PM call over the team's V2 spew lean — recorded). |
| A2 | The stretch = **the one-surface log**: a simple event completes entirely inside the sheet; Home never leaves the screen. Meal / Medication / Weight still route to their own screens. |
| A3 | The capture bar's **predictive layers are parked as north star** (suggestion chips + typed parse). Its *visual language* is absorbed into the converged design. Revisit only after this track ships. |
| F1 | **Convergence confirmed → design-locked** (2026-08-13), with three riders: AC-CHIP, AC-FOUND, and the beta-flag gate (§3) below. |
| — | "Other" glyph = Ellipsis (Plus is reserved for add/create). Round-1 system repairs all ride: shared `Header` migration across the five log headers, token cleanup, extraction to `components/log/`, design-system README icon-section correction. |

**The register rationale (binds the stage-2 design):** by the time the confirm renders, the app can fully describe the row it is about to write — so it is a *confirmation*, not a form (the B-614 line), and it wears the shipped teal confirm register (`colorAccentLight` wash + `colorAccentInk` ink). The **summary pill is the save**: a live sentence ("Vomit · today at 5:33 PM") with the one dark Log-it pill (the FAB's echo). No other dark surface exists on stage 2.

## §1 Scope and non-goals

- **Presentation and step structure only.** No data semantics change: same event writes, same `occurred_at_confidence` model (B-010/B-448), same photo→AI-read trigger, same sync paths, same `EVENT_TYPES`/`EventIcon` single render path.
- **Non-goals:** the FAB menu itself (B-007's other half); grid membership changes (B-201 Weight / B-139 Medication promotions — untouched); the capture bar's predictive engine (A3, parked); any LLM anywhere (explicitly out; a future parse assist is its own D2-class AI-boundary ruling).
- **Register:** daylight, always (brand §1.2 names the quick-log). Category tints are identity, never verdict.

## §2 The flag — `log_picker_v2` (B-712 shape)

Ships dark behind the two-gate beta pattern, exactly as `signal_design_v2`:

- **Gate 1 (eligibility):** `app_config.log_picker_v2` allowlist, seeded dark (default nobody), resolved via `resolveAllowlistFlag` (fails closed unset/signed-out).
- **Gate 2 (opt-in):** a `BETA_REGISTRY` row → the feature appears as a card on the Settings → Beta features shelf for eligible accounts; local opt-in, default off, wiped on sign-out. `live = eligible && optedIn`. `serverCost: false` — this track has zero server component, so the client-only gate is sound (the B-712 rule that server-cost betas must gate server-side does not bite).
- **FL-1 no leak:** flag-off renders byte-identical to today's shipped picker — snapshot-pinned in every PR.
- **FL-2 seed-first:** the flag seed + client registration + shelf row land before any consumer (PR 0).
- **FL-3 the old picker survives** until GA: the flag switches between the shipped type grid and the new experience at one seam.
- **FL-4 retirement is a GA call only:** when the PM calls GA, a removal PR deletes the flag, the old grid, and the shelf row (the FR-FLAG-5 shape).

## §3 The two ruled ACs (the F1 riders)

**AC-CHIP — the Saw it / Found it chips never wrap.** The mock's known render flaw is a build requirement, not a hope: chip labels are fixed-intrinsic-width (`flexShrink: 0`, `numberOfLines={1}`, no percentage widths). When the time row cannot hold label + chips at the current font scale, the chip pair drops to its own line below the label as a whole — a chip never squeezes, truncates, or wraps mid-label. **Verify at 320pt width and at the largest iOS accessibility text size**; both states in the component test.

**AC-FOUND — Found it carries its full state set in-sheet.** Found-it is not one state; the one-surface confirm must carry everything the pushed screen carries today:
- The **window modes**: open-ended ("sometime since {last-known-OK / this morning}") and bounded ("between {earliest} and {latest}") — the existing B-010/B-448 model, no new semantics.
- "Adjust window" opens the existing window picker **inside the sheet** (no navigation out).
- The **summary pill re-renders per state**, wording at History parity: point time → "today at 5:33 PM"; open window → "found — sometime since this morning"; bounded → "found — between 2 PM and 5:33 PM".
- `occurred_at_confidence` lands exactly as today (`witnessed` / `window`); EXIF attribution unaffected.

## §4 PR plan (value ships at each; every PR flag-gated + snapshot-pinned flag-off)

| PR | Ships | Contains |
|---|---|---|
| **PR 0** | The flag, dark | Migration seeding `app_config.log_picker_v2` (own PR per schema isolation; applied live via MCP + advisors) · client registration (`ALLOWLIST_FLAG_KEYS`/`ALLOWLIST_FLAGS_UNSET`) · `BETA_REGISTRY` row + shelf card (eligible-only, opt-in default off, sign-out wipe). Nothing consumes the flag yet. |
| **PR 1** | The new picker, current presentation | Custom glyphs (splat + swirl + loose-stool sibling) as small SVG components behind `EventIcon` · BatteryLow + Ellipsis swaps · grouped tile grid extracted to `components/log/EventTypePicker` · photo-first entry removed · `Header` migration + token cleanup across all five log headers · README icon-section correction. Flag-on only; flag-off = today's grid, byte-identical. |
| **PR 2** | The sheet | Bottom-sheet presentation over the current tab · split stool tile (sub-step deleted) · pet switcher on the title. B-007's destination half — its row is annotated, not duplicated. |
| **PR 3** | The one-surface confirm | Step machine reworked so symptoms + Other complete in-sheet: pill rows, teal chips (AC-CHIP), the live summary-pill save, AC-FOUND states, completion moment in place · full `nyx-voice` + `clinical-guardrails` copy pass (incl. the photo row's "I can read it for signs" line — capability, never reassurance). |

**Glyph note:** the two customs conform to the Lucide component interface so `EVENT_TYPES` stays the single point of change; B-746 (the icon-family commission) narrows to the remaining six glyphs. Per B-410 doctrine the widget does **not** adopt them (abstract geometry stands).

## §5 QA spine (every PR's manual script draws from this)

1. 10-second test: FAB → More events → symptom → Log it, one hand, under 10s (flag-on).
2. Flag-off: pixel-identical shipped picker (snapshot + on-device spot check).
3. AC-CHIP at 320pt + max accessibility font.
4. AC-FOUND: all three summary-pill wordings; window picker opens in-sheet; History row shows the same confidence wording after save.
5. Multi-pet: switcher on the sheet title; write lands on the pet named in the title (write-time identity, §6 of the multi-pet spec).
6. Reduced motion: sheet transition has a static-respectful variant; no ambient loops (brand rule 5).
7. Beta shelf: card appears only when allowlisted; toggle off → next FAB → More events renders the old picker.

---

_Superseded mock rounds 1–3 live only in git history of `docs/culprit-more-events-mockups.html`; round 4 is the live page at the artifact URL. Session record: `docs/sessions/2026-08-12-more-events-picker-redesign-research.md`._
