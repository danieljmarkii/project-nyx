# Widget V2-PR-4 — TestFlight cut prep: informational app.json copy (B-664)

**Date:** 2026-08-03

## What this session was

Cut the TestFlight build for the v2 informational widget (B-664, V2-PR-4). The
actual `eas build` is a PM **Runtime A-Native** action — this cloud session has
no EAS CLI, no `EXPO_TOKEN`, and no Expo auth (consistent with the project's
standing "TestFlight cuts are run by hand by the PM, in their own session"), and
the final acceptance step (remove/re-add the widget, confirm the informational
grid renders) needs a physical iPhone. So the session did the **in-repo prep
that makes the cut push-button** and handed off the exact command sequence.

## What shipped — `shipped via #577` (draft)

One change, in the native binary's config: **`app.json` widget copy rewritten
from v1 capture language to v2 informational.** Both strings live in the
`expo-widgets` plugin block, so they are compiled into the binary and **cannot
be OTA'd** (same reason the widget UI itself isn't — spec §6). They had to ride
this cut or need their own.

| Surface | Was (v1 capture) | Now (v2 informational) |
|---|---|---|
| Gallery `description` (`app.json:83`) | `Log a meal or a treat without opening the app.` | `See what's been logged today at a glance — meals, treats, meds, and symptoms.` |
| Edit-Widget config `description` (`app.json:88`) | `Pick which pet this widget logs for. …` | `Pick which pet this widget is for. …` |

The v1 gallery line wasn't just stale — **V2-1 reversed the widget's direction**
(the v2 widget *never writes*; every element is a door *into* the app), so
"log … without opening the app" was actively false. The new gallery line states
what the widget *shows* and names the four event classes (specific over generic).

`nyx-voice` pass on both: no exclamation, no §2.7 banned widget vocabulary
(`missed`/`due`/`overdue`/`all clear`/`all quiet`/`great job`/`streak`/praise).

Validation: `tsc --noEmit` clean · `widgets/CulpritWidget.test.ts` 24/24 · full
pre-push suite 194 suites / 4249 tests green · `app.json` parses, `version`
still `1.2.0`, diff is the two strings only. No schema, not in the TS graph.

## Decision made

**Marketing version stays `1.2.0` — no bump.** #514 deliberately set
`1.1.0 → 1.2.0` as the native-module OTA fence and named the next cut
"build 36 = 1.2.0". This informational-widget cut *is* that next native cut, so
1.2.0 is the intended, not-yet-shipped version (installed build is 1.1.0 (35)).
The build **number** advances automatically (`autoIncrement: true`,
`appVersionSource: remote` → EAS counter). Reversing a deliberate team decision
wasn't warranted; the PM can override the version string at cut time if they want
a different one.

## The handoff (PM, Runtime A-Native — the part this session can't do)

1. **Merge #577 to `main` first.** The cut is "from current main"; the copy fix
   must be on main before building, or it misses the binary.
2. From current `main` (after #577 merges):
   ```
   git fetch origin main && git checkout main && git pull --ff-only
   npm install -g eas-cli && eas whoami        # ephemeral container; re-login if needed
   eas build --platform ios --profile production --auto-submit
   ```
   `production` profile (not `preview` — internal isn't store-submittable);
   `--auto-submit` (not `eas submit --latest` — that re-uploads a stale store
   build). `autoIncrement` → build 36 at 1.2.0. If it errors "build number N
   already used", `eas build:version:set --platform ios` above ASC's max, rebuild.
3. **Native `eas build`, never `eas update`.** OTA leaves the old widget
   extension in place — that's the mismatch this cut exists to fix. (And the SDK-57
   OTA fence means an OTA to the installed 1.1.0 build is a no-op anyway.)
4. After it installs from TestFlight: add the Culprit widget → gallery reads
   *"See what's been logged today at a glance …"*; Edit Widget → *"Pick which pet
   this widget is for. …"*; **remove and re-add** → the **informational grid**
   renders (stat tiles + ground band + "Up next"), **not** the v1 Meal/Treat
   "tap to pick" tiles. That on-device pass also closes **V2-PR-3 / B-481**
   (folded into the cut).

## Why the sequencing matters (the production-not-preview trap, restated)

TestFlight builds are `production` profile / `production` channel
(`distribution: store`). `preview` is `distribution: internal` (ad-hoc) and is
**not** TestFlight-eligible — the mis-doc of this once cost a full session
(STATUS.md → Runtime in Use). This cut is native by necessity: the widget
extension is a native target, uncarryable by OTA.
