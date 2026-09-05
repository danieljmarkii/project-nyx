# Session — 2026-09-05 — The incident screen: post-log routing + the AI read's arrival (CUL-800)

**Mode:** DISCOVERY → ruled → build-ready spec, one session · **Branch:** `claude/vomit-incident-routing-design-i37tl1` · **Outcome:** shipped via #801 (draft; docs + mock only, no app code) · **Artifact:** https://claude.ai/code/artifact/84cb32c6-5693-4bc7-a510-37778e2437fd (rounds 1 and 2 on the same URL)

## What the PM brought

Logged a vomit with a photo. The black card appeared on Home and worked. But the incident screen, the one surface that holds the per-incident AI read, was never shown; the read is the differentiator and nobody reaches it. Asked for routing directions and for "some similar design delight" on the incident screens, in the spirit of the Signal fold's motion.

## What the session found

- `app/log.tsx` saves, `router.back()`s, and lands the named card (R1 register) over Home for 5s. The read runs in the background (`lib/simpleEvent.ts` → compress → upload → `analyze-*`) and lands seconds later on `/event/[id]`, which nothing routes to.
- The design principles' Motion section allows one considered animation: *"the transition from 'building your picture' to a real insight should feel like something arrived."* Written for the AI Signal, it names the per-incident read too. The fold's §12 ("the rail is the continuous thread") already gives it a vocabulary and a module (`components/home/foldMotion.ts`, CUL-788).
- Principle 1's quick-log line ("a brief completion state, then back to home") is the constraint every routing direction has to survive.

## Round 1 (directions) → the PM ruled the same day → Round 2 (build-ready)

| # | Brief | Ruling |
|---|---|---|
| D1 | Where a photographed vomit lands | **Land on the record** (R1). The modal is replaced by `/event/[id]`; the named card overlays it; Back is one tap. |
| D2 | Which logs take the route | **The logs with an AI read: photographed vomit + stool.** "Just vomit and stool now." |
| D3 | Photo: hero or tile | **Keep the hero.** "I want the pet owner to be able to pull up a vomit and show it to a vet." Overrides the round-1 tile recommendation. Round 2 adds the captioned viewer (V1) so the vet also sees *when*. |
| D4 | How the read arrives | **The rail-led arrival, the fold's physics.** "Absolutely go with the motion arrival moment." |

Not taken (frames stay in the mock as the record): R2 the card carries the read (safety prose on a fading surface); R3 an escalation strip on Home (duplicates the Signal's acute card); S-B the photo tile.

## Persona conflict, and how it closed

**Designer** (Principle 1: the log ends on Home; a landing screen is a 2am tax) vs **PM + Dr. Chen** (the read is the differentiator and, when it escalates, the sentence the owner must see). **Jordan:** "if the app is about to tell me something about the thing I just photographed, I will wait eight seconds." Closed by **scope, not a tie-break** (D2): only the logs with something to show take the route, and on the record the record *is* the confirmation. The escalation-after-you-left case is not the route's to solve: a non-escalating read has nothing urgent to say (never-reassure makes this honest), and an escalation is the Signal's acute `incident_red_flag` card's job — to be verified at `generate-signal/detection.ts` before PR 1 relies on it.

## Written this session

- `docs/culprit-incident-screen-mockups.html` — round 1 (directions) then round 2 (build-ready) on the same URL: §0 decision record; T1/T2 today; R1a/R1b, R2a/R2b, R3; S-A (ruled), S-B (not taken); **round-2 frames** S-A2 (stool, contextual escalation), U1/U2 (Undo from over the record → Removed on Home), V1 (the captioned viewer); §4 the live arrival demo re-drawn on the hero layout; §5 the states table; §6 the ruled build shape.
- `docs/nyx-incident-screen-requirements.md` v1.0 — the spine G1–G6, the route contract (§3), the states (§4), the screen (§5, incl. the fold store wiped by name and the viewer caption via `describeOccurredAt`), the arrival (§7, the fold's constants verbatim, FS-9 applied, no haptic).
- `CLAUDE.md` v1.31 — the Read-These row + version history (v1.28 archived to `docs/CLAUDE-md-history.md`).

## Linear

- **CUL-800** (parent, Aug. 2026 Design Polish) — the track; absorbs **CUL-158** (commented). Attachments: PR #801 + the artifact.
- **CUL-802** — PR 1, the route (blocked by CUL-801).
- **CUL-803** — PR 2, the screen. **CUL-804** — PR 3, the arrival (blocked by CUL-788). Both filed on the PM's second ask after Linear's write API timed out on every earlier attempt; the creates only went through stripped of `parentId` / `project`, patched on afterwards. Worth knowing for the next session that hits a 60s `save_issue` timeout: the comment write succeeded while the same-sized issue create did not.
- **CUL-801** — the analysis-trigger race the route makes urgent (the detail-mount trigger can fire before the log-path upload lands and answer `not_enough_to_say` on a photo still in flight). Blocks CUL-802.

## Known issues / tech debt

- The named card's bottom offset is a tab-bar constant today (`TAB_BAR_HEIGHT` in `NamedCompletionCard.tsx`); PR 1 makes it route-aware. Check the beta sheet path (`EventTypeSheet` → `SheetLogBeat`) lands the same route.
- `router.replace` on an expo-router modal must be verified on iOS before PR 1 trusts it (fallback in spec §3.1).

## PM action items

None.

## Next session kickoff

**Recommended first prompt:**
> Build CUL-801 (the per-incident analysis trigger race) as its own PR: read `docs/nyx-incident-screen-requirements.md` §3.6 and `lib/simpleEvent.ts` `attachPhotoBestEffort` + `lib/analysis.ts` `triggerVomitAnalysis`; gate the detail-mount trigger while a pending row exists or the log-path chain is in flight. It blocks CUL-802.

**Alternate prompts:**
- Build CUL-802 (PR 1, the route) from `docs/nyx-incident-screen-requirements.md` §3 once CUL-801 is merged; verify `router.replace` on the log modal on iOS first.
- Build CUL-803 (PR 2, the screen) from spec §5 and mock round 2 frames S-A / S-A2 / V1 — independent of PR 1, disjoint files (`app/event/[id].tsx`, the two analysis sections, `PhotoViewer`).

**Parallel / efficiencies:** CUL-803 and CUL-801 are disjoint and can run concurrently. CUL-804 waits on CUL-788 (the fold motion) for the shared module. CUL-660 ("whose record") lands inside PR 2 for free.
