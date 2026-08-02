# Notification foundation PR 3 (B-661) — consent primer + settings un-mock

**Date:** 2026-08-02

The consent layer of the notification foundation: un-mocked the notifications
settings screen into a real, honest opt-in surface for the one v1 category
(**Daily summary**), and built the pre-permission **primer** that guards the single
system prompt. Ties PR 2's synced preference mirror to PR 1's scheduling primitive.
No schema, no Edge Function, no clinical/statistical logic (the mandatory-adversarial
DoD line is scoped out of this track, spec §7).

**shipped via #567** (draft).

## What shipped

### The consent/preference layer — `lib/notificationSettings.ts` (+ test)
The `dietTrialSetup` side of the pure `dietTrialMirror` split: the I/O module that
writes the product opt-in row and reconciles the OS schedule from it. Two SQL
constants are extracted and unit-tested against `node:sqlite`:
- **the split-brain-safe read** (`ORDER BY synced DESC, updated_at DESC, id`) — the
  §4 mirror carry-forward, so a quarantined cross-device loser never shadows the
  synced row;
- **the get-or-create write** — keys on the natural key so a same-device toggle
  never duplicates a row, and clears the B-398 quarantine trio (`synced=0`,
  `sync_attempts=0`, `sync_error=NULL`) in the same statement (source-scan enforced).

`applyCategoryPreference` persists then reconciles; `reconcileFromPreferences`
repairs drift on settings-focus (AC 6 — a permission revoked in iOS Settings has its
orphaned schedule cancelled here, ahead of PR 4's app-foreground reconcile). The
system prompt is never fired from this module — reconcile reads permission with
`request=false`.

### The primer — `components/notifications/NotificationPrimerSheet.tsx` (+ test)
A bottom sheet between the toggle-on and the OS prompt: says what the category
sends, how often, and that it is reversible. Single-pet copy names the pet; a
multi-pet/nameless account stays neutral ("for all your pets" — D3, one notification
per account). **Declining spends nothing** — "Not now"/scrim only dismiss, so the
one prompt is preserved. Copy is strictly **retrospective** ("the meals, symptoms,
and doses **you logged**") — no medication-reminder implication (G4 / the D7 lineage).

### The settings screen — `app/settings/notifications.tsx`
Un-mocked into the real Daily-summary toggle with the **three honest permission
states**: (a) never asked → toggle interactive, first enable walks the primer → the
one prompt; (b) granted → live toggle, enabling schedules / disabling cancels; (c)
denied at the OS level → the category is visibly inert with one honest line (calm,
not alarm) and a deep link to iOS Settings (`Linking.openSettings()`). A toggle-on
the OS won't honor is never persisted (§2 — no on-while-denied lie). No
medication-reminder row survives the un-mock (G4).

### The mock — `docs/culprit-notifications-mockups.html` (round 1)
Primer (both account shapes), the three settings states, and the system prompt in
context. Published as an Artifact and re-published to the same URL after the review
revisions. PR 4's Day Summary + lock-screen frames come in round 2, same URL.

## Reviews (both gates run this session)

**pm-feature-review — one blocking miss + two clean fixes, all applied:**
- **[blocking]** the un-mock stopped one screen short: the Settings → Notifications
  **doorway** (`app/settings.tsx`) still said "Coming soon" over the now-live screen —
  a factual falsehood in both the label and the a11y strings, and its sublabel named
  only the two dead categories. Fixed: plain live nav row, a sublabel that names the
  live category, honest a11y.
- the intro line "Nothing's on…" read false the moment Daily summary was on → made
  it state-independent ("You choose what Culprit lets you know about…").
- the two reserved "Coming soon" rows are the placeholder nyx-voice Pattern 3 +
  Principle 5 forbid on a live surface → removed them (future categories add live
  rows when they ship). Verdict on the consent flow itself: **SHIP-SHAPED**.

**code-reviewer — one fix-before-merge bug + a low-prob bug + coverage, all closed:**
- **[fix-before-merge]** a real **4th state** the three named states missed: a pref
  synced `enabled=true` from another device while THIS device's permission is still
  `undetermined` rendered a live **ON** switch — so a tap fired the *disable* branch
  and silently turned the summary off account-wide via LWW (breaking AC 8, the
  two-device case). Fixed: the switch is ON only when this device can actually
  deliver — `primerVisible || (permission === 'granted' && enabled)` — so on an
  ungranted device it shows off-and-interactive (honest: nothing fires here yet;
  safe: a tap walks the primer → grant, never a silent account-wide off). Regression
  test added.
- **[low-prob]** the focus-effect catch reset `permission` but not `enabled` → added
  `setEnabled(false)` so a transient read failure can't strand a stale on-state.
- **coverage:** added the primer's neutral (`petName == null`) branch test (the D3
  path, previously exercised nowhere) and orchestration tests for
  `notificationSettings.ts` (getDb wired to a fake — the feedingArrangements /
  dietTrialSetup precedent), which the SQL-only tests skipped.

D7/G4 verified clean by both reviewers via direct read: no medication-reminder row
or implication anywhere; no exclamation marks.

## Decisions

- **PR 3 schedules, via reconcile.** Rather than defer all scheduling to PR 4, the
  toggle drives `reconcileSchedules` (needed for the AC-6 orphan-cancel anyway),
  using PR 1's interim placeholder body. PR 4 owns the real G1-safe body, the
  `/day-summary` screen the tap opens, and the app-foreground reconcile. Flagged in
  the PR as a call the PM can reverse trivially.
- **Reserved "Coming soon" rows removed, not restyled.** Resolves the nyx-voice
  Pattern 3 tension by showing only what is real on a live surface.
- **The 4th cross-device state is handled by the switch-value derivation, not a new
  banner** — per-device truth (the switch reflects what THIS device delivers), which
  matches the local-first (D2) per-device scheduling model.

## Deferred (filed)

- **B-664** — consolidate the app's bottom-sheet chrome into one shared shell (the
  primer hand-rolls the `SheetShell` chrome; right fix is relocating `SheetShell` →
  `components/ui/` + a header slot, its own refactor).
- **B-665** — post-grant "you're set — first summary tonight" confirmation microcopy
  (partly PR 4 territory).
- **B-666** — PM decision: should the primer signal that the coming system prompt is
  one-shot? (over-warning is dark-pattern-adjacent) — plus the fresh-decliner nuance
  in the denied copy.

## Checks

- `tsc --noEmit` clean; full jest suite green (189 suites / 4128 tests before this
  session's additions; the new suites add the split-brain/orchestration + primer +
  4th-state + three-state coverage). The B-514 non-UTC-timezone CI job and the B-398
  source-scan both pass.
- CI on #567's first commit: all three checks green (typecheck+jest, non-UTC
  timezones, Edge Functions deno test).

## PM feedback (same session, post-review)

- **One notification per account** — confirmed by the PM; already the D3 design, no change.
- **The OS-denied banner was too subtle** → rebuilt as a **danger treatment**: a
  red-tinted fill + hairline + `AlertTriangle` glyph + a bold title, with the fix
  ("Open Settings") as a red-outlined action. Two new theme tokens
  (`colorDestructiveLight` / `colorDestructiveBorder`), matched in intensity to the
  `colorEventSymptom` safety-banner pair. Rationale on the record: this is a
  *functional* system state, not a health flag, so nyx-voice's "no alarm" rule
  (which governs health copy) doesn't apply — a loud, unmissable inert state is
  honest states (Principle 5) done right. Mock state (c) + annotation updated and
  re-published to the same URL.
- **Schedule-vs-defer (PM Action Item #1)** — explained in full to the PM; decision
  still theirs. Current behavior: PR 3 schedules via reconcile (interim PR-1
  placeholder body); deferring to PR 4 is a small change.

## Not done / next

- **PR 4** — `lib/daySummary.ts` + the `/day-summary` screen + the 9pm schedule wired
  to the pref + the real G1-safe body; mock round 2 adds the Day Summary + lock-screen
  frames to the same artifact URL.
- **PR 5** — the `nyx-voice` / `pm-feature-review` / Dr. Chen finish pass.
- The single-pet-body-naming open item (§10.3) and the two PM-decision backlog rows
  (B-666) await a PM call.
