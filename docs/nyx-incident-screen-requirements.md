# Culprit — The Incident Screen: post-log routing + the AI read's arrival

**Version:** 1.0 (**BUILD-READY** — D1–D4 PM-ruled 2026-09-05) · **Date:** 2026-09-05 · **Owner:** Sr. Product Designer (design authority), Dr. Alex Chen (clinical conditions), Dir. of Engineering (the route + the motion contract) · **Track:** CUL-800 (parent; absorbs CUL-158 / B-029) → CUL-802 (PR 1, the route), PR 2 (the screen), PR 3 (the arrival); CUL-801 (the trigger race) blocks PR 1 · **Design authority:** `docs/culprit-incident-screen-mockups.html` round 2 (the artifact re-publishes to the same URL)

**Read this when:** touching what happens after a vomit or stool is logged, `app/event/[id].tsx`, `VomitAnalysisSection` / `StoolAnalysisSection`, the named completion card's placement, or any surface where a per-incident AI read appears.

---

## §0 Decision record (PM-ruled 2026-09-05)

| # | Decision | Ruling | Binds |
|---|---|---|---|
| D1 | Where a photographed vomit lands after Save | **Land on the record.** The log modal is replaced by `/event/[id]`; the named card lands over it; Back is one tap to Home. | PR 1. Resolves the Designer's Principle-1 dissent ("a brief completion state, then back to home") by **scope** (D2), never by tie-break: on the record, the record *is* the confirmation. |
| D2 | Which logs take the route | **The logs with an AI read: `vomit` and both stool types, when a photo was attached at log time.** PM: "the logs where the owner should see the incident screen — just vomit and stool now." | Every other event type, and a photoless vomit/stool, keep the shipped `router.back()` + card path **byte-identical** (snapshot-pinned). A photoless contextual escalation is the Signal's acute `incident_red_flag` card's job — verify at `generate-signal/detection.ts` before relying on it. |
| D3 | Photo as hero or as a tile | **Keep the hero.** PM: "I want the pet owner to be able to pull up a vomit and show it to a vet." Overrides round 1's tile recommendation. | PR 2 builds the S-A shape: hero unchanged, the read moves up under the record. The viewer gains a caption (§5.4) so the vet also sees *when*. |
| D4 | How the read arrives | **The rail-led arrival, the Signal fold's physics.** PM: "absolutely go with the motion arrival moment." | PR 3, sequenced after CUL-788 so `foldMotion` is one shared module. No haptic on any verdict. |

## §1 What this fixes

Today `app/log.tsx` saves, calls `router.back()`, and the named card (`NamedCompletionCard`, R1 register) lands over Home for 5s. The photo's read runs in the background (`lib/simpleEvent.ts` → compress → upload → `analyze-vomit` / `analyze-stool`) and lands in `event_ai_analysis` some seconds later. Nothing routes to `/event/[id]`; the read is reachable only through History → row → scroll. The differentiator is invisible to the person who just took the photo (PM dogfood, 2026-09-05).

## §2 The spine

- **G1 — Principle 1 survives by scope.** The route fires only where there is a read to show (D2). A log with nothing to show never gains a screen to leave.
- **G2 — The record is the confirmation, and the safety net rides along.** The named card overlays the record it describes; Undo and Change time keep working there (confirm-XOR-reversal, CUL-645, unchanged).
- **G3 — Never reassure, and never chase.** The verdict enum and its copy are the shipped `worth_a_call` / `monitor` / `not_enough_to_say` set, verbatim (`clinical-guardrails` Pattern 1). A non-escalating read has nothing urgent to say, so a read that lands after the owner has left does not chase them; an escalation that lands after they leave is the Signal's acute card's job (D2).
- **G4 — Same physics on every verdict; silence on safety.** A `worth_a_call` arrives on a rose rail, no louder and no harder, with **no haptic** (both analysis sections are on `guards/haptics.test.ts`'s scanned list — never move a call to an unscanned file).
- **G5 — A screen never shows a row that is no longer in the record.** Undo from over the record dismisses the screen before the Removed line lands on Home.
- **G6 — The record stays in daylight** (Signal/Home D8). The one dark ground is the photo viewer.

## §3 The route (PR 1 — CUL-802)

1. **`app/log.tsx` `handleConfirm`, non-meal branch:** when `attachmentUri` is set and `selectedType` is `vomit` or `isStoolEvent(selectedType)`, **replace** the modal with `/event/${eventId}` instead of `router.back()`. The modal must be gone from the stack so Back lands on Home in one tap. Verify expo-router's modal-replace behaviour on iOS at file:line before trusting `router.replace`; if a modal cannot be replaced cleanly, `router.back()` then `router.push` with the card's `delayMs` covering the transition is the fallback, and the choice is recorded on CUL-802.
2. **The named card still fires** (`showNamedMoment`, `hasAttachment: true`, `delayMs` as shipped). Its bottom offset becomes **route-aware**: over a tabs screen it clears `TAB_BAR_HEIGHT` as today; over `/event/[id]` (no tab bar) it sits at the safe-area inset.
3. **Undo from over the record (G5):** the reversal runs as shipped (`momentStore.undo()` → `reverseLoggedEvent`; the photo-naming confirm of CUL-645 stands); then the record screen dismisses (`router.back()`), and the "Removed" line lands on Home as it does today.
4. **The beta sheet path** (`components/log/EventTypeSheet.tsx` `handleLogged` → `SheetLogBeat`): same scope, same landing. The R2 beat plays; on `onDone` the sheet closes and pushes the record.
5. **Both entry points asserted by test:** the photographed-vomit path reaches the record and the photoless path does not — **count** the navigation calls (`toHaveBeenCalledWith` cannot see an identical second fire, CUL-170).
6. **Blocked by CUL-801:** on arrival, `VomitAnalysisSection`'s mount trigger must not fire a second `analyze-*` call before the log-path upload has landed. Today both calls are idempotent on `event_id`, but the early one can answer `not_enough_to_say` on a photo still in flight.

## §4 The states the landing must survive

All are existing states of the analysis sections; the route makes them visible on arrival instead of on a later visit.

| State | On arrival | Rule |
|---|---|---|
| Pending, then lands | The tick and whorl, then the arrival (§7). | — |
| Slow (upload on a bad signal) | Pending stays; the card dismisses at 5s as today; the screen does not. Back is always available; the read lands in the row for next time. | Real work on the pet's behalf earns a wait; a spinner never blocks Back. |
| Failed | "Couldn't finish reading this one." + Try again, as shipped. | Error copy names the repair. |
| Daily cap reached | The calm cap copy, no retry, no Premium mention. | Pets > $; monetization §7.3. |
| Consent off (CUL-552) | No read section at all; the screen is the record. | Never a spinner that cannot end. |
| Photo unclear | "Not enough to say about this one yet." + Try analysis. | Not-enough is the floor, never reassurance. |
| Undo from the card | Screen dismisses, Removed line lands on Home. | G5. |

## §5 The screen (PR 2)

Design authority: mock round 2, frames S-A, S-A2, U1/U2, V1.

- **§5.1 Order.** Hero (unchanged, D3) → the record block (type label, date, time, confidence tag, **"{pet}'s record"** via `resolveRecordPetName`, never `activePet` — this lands CUL-660) → **the read** → the observations → Food / Intake / Notes / the rest, as shipped.
- **§5.2 The read card.** A 3pt rail on the left: `colorEventSymptom` on `worth_a_call`; a neutral grey on `monitor` / `not_enough_to_say`. The verdict label is the enum copy verbatim; on the rose-light ground it takes **`colorEventSymptomInk`** (a category colour is a glyph tint; text takes the ink — CLAUDE.md C-1). Read text, then the disclaimer ("This is a quick read of a single moment, not a diagnosis."), then Hide/Show, all as shipped. The pending state is a **16pt tick of rail** beside the `WhorlSpinner` and "Reading the photo…".
- **§5.3 The observations ("What's visible").** A two-column label/value grid, `Edited` markers and the "Edited {date}" line as shipped. A `Keep it compact` control (expanded state only; never a swipe, never the face tap — the fold spec's rule) folds it to a one-line strip: the values and the count ("Yellow, foamy, bile · 4 findings"); the strip re-opens it. Persisted per pet per event, device-local, the Signal fold's store shape (`lib/signalFold.ts`), **wiped by name in `wipeLocalSession`**. Editing is unchanged: the owner's edit stays the more-trusted value and a re-analysis never clobbers it. A `Blood: none visible` row is a fact about this frame, never a wellness claim; CUL-531 tracks dropping it under a contextual escalation.
- **§5.4 The viewer caption (V1).** `PhotoViewer` gains a caption under the photo: "{pet} · {type}" then "{date} · {time} · {confidence}", derived through the same `lib/logCopy` → `describeOccurredAt` path the card and History use — never a display string, so a found-not-witnessed time renders its **window**, never a point.
- **§5.5 Copy.** Every string re-enters the `nyx-voice` pass; no exclamation marks; owner-facing text through `ThemedText`. New strings in this spec: "Reading the photo…" (replaces "Reading this one…" on the photographed path), "Keep it compact", the strip line, the caption. Everything else is verbatim shipped copy.

## §6 Guards that stay green

`guards/accentOnLight` · `guards/geistRollout` · `guards/recordPetName` · `guards/haptics` · `guards/ownerFacingCopy` · `guards/reversePath` · the wipe-set scan in `hydration.test.ts` for the fold store key.

## §7 The arrival (PR 3)

The design principles allow one considered animation: *the transition to a real insight should feel like something arrived.* The per-incident read is that class of moment, one incident down. The arrival borrows the Signal fold's rule (fold spec §12, CUL-788): **the rail is the continuous thread.**

| Beat | What moves | Constant (the fold's, verbatim) |
|---|---|---|
| 1 · the rail grows | 16pt tick → the card's height, ahead of the box; the whorl and "Reading the photo…" fade out in the same beat. | `railLeadMs` 160 |
| 2 · the box opens | Spring on iOS (damping 0.7, ~4pt settle) / ease on Android; never a bounce on close. | `openMs` 370 |
| 3 · the sentence lands | Verdict + read text as one block, −8pt → 0, fade in, starting a beat after the box begins. | `landDelayMs` 40, `landMs` 300, `driftPt` = `space1` |

- **Engines:** the fold's two-engine split stands — `LayoutAnimation` for geometry, `Animated` on the native driver for opacity/transform; the rail leaves the row's flow (absolute, explicit height) for the animated commits, or Fabric snaps it back (the fold's lesson, verbatim in `foldMotion.ts`'s header).
- **Shared module:** lift `components/home/foldMotion.ts` to `components/motion/` and consume it from both analysis sections; PR 3 sequences **after CUL-788**.
- **What never animates (FS-9 applied):** a read that already exists on open paints on the first frame; a re-analysis after an owner edit swaps un-animated; `failed` / `capped` / `not_enough_to_say` arrive with the same choreography on their own card, never a special error motion.
- **Reduced motion:** crossfade over `durationFast`, no translate, no `LayoutAnimation`. **App blur finishes, never pauses.** **No haptic** (G4).
- **Proof:** snapshot pins that the arrival adds no node when idle; a test counts zero `configureNext` calls when a row already exists on mount.

## §8 Out of scope (filed or deferred)

- R2 (the card carries the read) and R3 (an escalation strip on Home) — not taken (D1); frames stay in the mock as the record.
- S-B (photo as a tile) — not taken (D3).
- A standing / re-surfacing flag for `worth_a_call` — CUL-208, unchanged.
- Auto-refresh of the read when a photo is added mid-session — CUL-143, unchanged.

## Version History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-09-05 | Build-ready. Distilled from mock round 2 after the PM ruled D1–D4 the same day. |
