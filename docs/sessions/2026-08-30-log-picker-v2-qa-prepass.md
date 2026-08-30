# log_picker_v2 pre-GA QA pass — the static pre-pass, and two predicted failures

**Date:** 2026-08-30
**Issue:** CUL-663 (DISCOVERY; the device sitting itself is still owed)
**Also covers:** CUL-729 (merged into one script)
**Filed:** CUL-755, CUL-756
**Outcome:** shipped via #776

---

## What this session was, and what it deliberately was not

CUL-663 is a **device** pass — twenty-three checks that need a phone, VoiceOver, a
keyboard and airplane mode. A cloud session has none of those, so the deliverable it
asks for is not one this session could produce.

What a cloud session *can* do is the half that does not need a phone: read the
surface against every step of the script and see which ones are already answerable
from the code, so the sitting spends its time on the checks that genuinely need a
device rather than rediscovering things a file could have told it. Two of them turned
out to be answerable, and both answers are "this will fail".

So the session ran the pre-pass, filed the two defects with decision briefs, and
turned the two issues' twenty-four source steps into one phone-ready script. The
sitting is still owed; it is now shorter and better aimed.

## The two findings

### CUL-755 — the keyboard covers the note field *and* the save

`EventTypeSheet` presents a bottom-anchored `Modal`; `SimpleEventConfirm` renders
inside it with the note `TextInput` second-from-last and the summary pill — which
**is** the save (picker spec §0) — last. There is no keyboard avoidance anywhere in
that tree.

Verified at file:line rather than assumed, on both architectures, because the whole
finding rests on a default:

- `RCTScrollView.m:284–286` — `_keyboardWillChangeFrame:` returns early unless
  `automaticallyAdjustKeyboardInsets` is set.
- `BaseScrollViewProps.h:40` — `bool automaticallyAdjustKeyboardInsets{false}`;
  `RCTScrollViewComponentView.mm:149` sets `NO`, early return at `:189`.
- `ScrollView.js:190` — declared optional, no default.

Geometry on a 390×844 phone: the sheet is ≈406pt and bottom-anchored, an iOS portrait
keyboard with the predictive bar is ≈336pt, so ≈70pt survives — the grabber and most
of the header. The note field and the pill are both entirely behind it.

**What makes it a regression rather than a rough edge is the comparator.** The
flag-*off* path this replaces wraps the identical note field *and* its bottom action
in a `KeyboardAvoidingView` (`app/log.tsx:1399`), as do `app/edit-event.tsx:581`,
`app/medication/[id].tsx:396` and all five auth screens. The sheet is the only
note-bearing surface in the app without one. `log_picker_v2` ON is worse than OFF
here — precisely the class the D12 host gate exists to catch, arriving on the gate
itself.

The recovery path is the part worth remembering. `multiline` on iOS has no
return-to-dismiss, there is no accessory Done, and `keyboardDismissMode` is unset —
so the only visible target is the header, whose one control is the *unguarded*
discard (CUL-612, deliberately). The owner's natural gesture is the scrim, which
raises **"Discard this log?"**. CUL-612's guard does catch it, which is the system
working; but the app is offering a discard dialog as the route to finishing a log.

A second, lower-confidence defect rides the same fix: `styles.sheet` is
`maxHeight: '80%'`, the **grid** stage shrinks into that clamp because `gridScroll`
carries an explicit `flexShrink: 1`, and the **confirm** stage's container carries
none. The asymmetry is the tell — one sibling's host was given the property on
purpose and the other's was not.

### CUL-756 — AC-CHIP has no third state

AC-CHIP (§3) says a chip never squeezes, truncates or wraps mid-label, and that the
pair drops to its own line whole. Both are implemented and both are pinned in jest.
Neither covers **the pair being too wide for the line it just dropped onto**, and
`chipPair` has no `flexWrap` and nothing under it that can shrink.

Measured rather than estimated — advance widths read out of the shipped
`Geist_500Medium.ttf` (hmtx/cmap), scale multipliers from
`RCTAccessibilityManager.mm:264–271` (AX5 = 3.571):

| Text size | Pair needs | 390pt (326 avail) | 320pt-class (256 avail) |
|---|---|---|---|
| Default | 161pt | fits | fits |
| xxxLarge | 192pt | fits | fits |
| AX3 | 307pt | fits | **over by 51pt** |
| AX5 | 389pt | **over by 63pt** | **over by 133pt** |

`marginLeft: 'auto'` resolves to 0 with no free space, so the pair starts left and
**"Found it" clips at the right edge**. Unkerned sums, so these are lower bounds.

It matters more than a layout nit because that pair is the witnessed-vs-discovered
classifier: it decides `occurred_at_confidence`, which is what the vet report and the
correlation engine read. The owner most dependent on the largest text size would be
choosing between one visible option and a half-word.

## The thing worth generalising

Both findings live in the gap between what a jest test can assert and what the AC
actually promises — and in both cases **the test file already said so**.
`SimpleEventConfirm.test.tsx:5` records that the style contract is pinned in jest and
"the visual check at [320pt / max font] is the device pass". That deferral is
correct: jest has no layout engine, so a style assertion is the most it can offer.

But a deferral is not a verdict, and it had been sitting green for weeks while the
answer was computable the whole time. The style contract was pinned; the *arithmetic
over that contract* was nobody's. Reading the shipped font and RN's own multiplier
table turned "we should look at this on a phone" into a number and a predicted
failure — before anyone spent phone time on it.

So: **where a test defers a check to a device, ask whether the deferred part is
measurable rather than merely observable.** A geometry claim usually is. The device
then confirms a prediction instead of discovering a defect, which is a much cheaper
sitting and a much better bug report.

The corollary the keyboard finding adds: **when a flag replaces a surface, diff the
new one against the one it replaces, not against the spec.** The spec never mentioned
keyboard avoidance, so nothing in the build or its reviews was looking for it; the
old screen had it, which is what made the absence legible. On a flag-gated
replacement the previous implementation is the strongest available spec for the
things the written one forgot.

## The script

CUL-663's 13 steps and CUL-729's 11 checks were merged into one sitting and
**reordered by setup state** rather than by issue — VoiceOver goes on once, the text
size moves once, airplane mode goes on once. That reordering is the whole value of
running them together, and it was the PM's own instruction on CUL-663 ("one phone
session covers both").

Published as an artifact (marks persist per-browser, so the phone can be put down):
<https://claude.ai/code/artifact/2d7faca3-a82f-4709-a911-dcf13eecd60b>

Two script corrections found while cross-reading the shipped strings, each of which
would otherwise have produced a false FAIL on the phone:

- CUL-663 step 9 says Cough/Sneeze appear under **"Respiratory"**. The shipped family
  label is **"Breathing"** (`constants/eventTypes.ts:168`) — deliberately, per the
  taxonomy spec's owner-language naming rule.
- The CUL-681 comment quotes the no-pet title as **"No pet to log for yet"**. The
  shipped string is **"No pet loaded yet"** (`lib/logCopy.ts:128`).

Neither is a defect. Both are in the merged script with the shipped wording and a
note saying not to score them.

## What passed the pre-pass

Everything else the code can answer, which is most of it. Named here so the sitting
knows these are confirmations rather than investigations: the stage reset on every
dismissal path (step 1); the switcher as a layer with both halves of assistive-tech
containment declared (2, 13); the split stool tile's two routes and the grid's
derived ordering (3); AC-FOUND's three wordings composed through the one shared
composer that History and the vet report use, so they cannot disagree (4); the photo
path's chooser-before-permission order, B-352 compression and 0-byte guard (5); the
discard guard's copy naming what would be lost (6); the beat's calm-tone soft impact
and its pet captured at grid→confirm rather than re-read (7, 11); `routesOut` (8);
both flags' two-gate wiring (9); the local-first write (10); the app-active
re-derive's photo latch (12).

The confirm header's yield order (CUL-729 checks 9–11) also measured out exactly as
CUL-726 documented it, including that issue's own "268px column" figure, derived here
independently: at xxLarge and xxxLarge the name drops to its own line whole, and past
AX3 both halves ellipse against the full column — the documented last resort, not a
failure. That expectation is in the script so check 15 is scored against a number.

## State

`tsc --noEmit` clean. 202 tests green across the 13 log-surface suites. No app code
changed this session — the only diff is this record.

CUL-663 stays open: the sitting is the deliverable and it needs a phone. It is now
blocked by CUL-755 and CUL-756, both of which want a PM ruling on their decision
brief before a build session picks them up.
