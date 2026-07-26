# Pinch-to-zoom across the app's photos (B-036 option A)

**Date:** 2026-07-26

Shipped via **#461**.

## How this started

The PM asked to convene the product team and discuss what it would take to add pinch-and-zoom to every photo in the app, from two scenarios: *in a vet appointment, pulling up a vomit photo so the vet can inspect it*, and *zooming a food's ingredient list in the library*.

Three findings reshaped the question before any code was written.

**There was already a row for this, and the PM's message falsified its rationale.** B-036 was filed 2026-05-26 at priority `Later`, reasoning: *"reading an ingredients label wants true zoom… Low priority — ingredient text is already captured by extraction."* That row only ever considered the ingredients case. It never imagined the exam room, which is the reactive-owner wedge at its highest-stakes moment. Its evidence cell was rewritten in-session rather than at wrap, per the Backlog Protocol.

**The blast radius was one file.** `components/ui/PhotoViewer.tsx` is already the shared lightbox behind 4 of the 5 in-app photo surfaces (event detail, edit-event, medication detail, food carousel) — a legacy of B-022's extraction. "Across all photos" cost one component, not an app-wide sweep.

**The resolution ceiling mattered more than the gesture, and it inverted the PM's two examples.** Uploads cap at `MAX_EDGE_PX = 1600` / JPEG q75 (`lib/storage.ts:9`), and `EVENT_PHOTO_TRANSFORM` serves at the same 1600. A 1200×1600 portrait shown `contain` on a 393pt 3× screen renders at ~1176 physical px — **already 1:1**. So a remote photo has essentially no real zoom headroom, and pinching it shows interpolation rather than information.

But `app/log.tsx:724` calls `persistCapture` on the **raw picker output** (full sensor, q0.85 — not the compressed upload), and `resolveEventPhotoDisplay` prefers that local file. So:

| What you're viewing | Pixels | Real headroom |
|---|---|---|
| Event photo, capturing device, local file intact | full sensor ~3024×4032 | **~2.5–3.5×** |
| Event photo, cache evicted / other device | 1600px q75 | ~1.0× portrait, ~1.36× landscape |
| Food photo — always (signed-URL only, no local copy) | 1600px q75, network-required | ~1.0–1.36× |
| Vet report in the WebView | 1000px q72 rendered ≤340px tall | ~3× |

Which means the **vomit-at-the-vet case is the one zoom serves best** (recent photo, capturing device, full sensor) and the **ingredient-list case is the one it serves worst** (1600px, network-required, 6pt text) — exactly backwards from how B-036 was filed and dismissed.

## The options put to the PM

Costed three, with the sequencing constraint that neither `react-native-gesture-handler` nor `react-native-reanimated` is installed (both pinned in SDK 57 at `~2.32.0` / `4.5.0` + `react-native-worklets@0.10.0`; New Arch on by default) — and a native module means a native `eas build`, never an OTA.

- **A** — RN's built-in `ScrollView` zoom. iOS-only (`maximumZoomScale` etc. live in `ScrollViewPropsIOS`), no dependency, **ships OTA**. ~0.5 day.
- **B** — gesture-handler + Reanimated: double-tap, swipe-down-to-dismiss, Android parity, UI-thread. Native build, app-wide gesture regression surface. ~2 days.
- **C** — raise the capture cap for text-bearing photos. The only irreversible piece, since every stored photo is capped forever.

Recommended A now, C decided now, B behind the App Store submission. **PM chose A**, in-session.

## What shipped

Pinch + pan on all four `PhotoViewer` surfaces via the built-in props. Three deliberate choices:

**The ceiling is computed per photo from pixels that exist.** `lib/photoZoom.ts` — `resolveMaxZoomScale`: the `contain` ratio (points per image pixel) × `PixelRatio` gives device pixels per image pixel; its reciprocal is where real detail runs out; clamped to `[MIN_MAX_ZOOM_SCALE, MAX_MAX_ZOOM_SCALE]`. Extracted as a pure module for the same reason as `lib/eventPhoto.ts`: it is the only part with real arithmetic, its inputs are device-dependent and awkward to reach through a render, and getting it wrong fails silently.

**No tap gesture was added**, so B-022's single-tap-anywhere-to-dismiss survives untouched. Double-tap-to-zoom cannot coexist with an undelayed single tap; deferring B rather than silently trading that away is why the Designer/Jordan conflict never had to be resolved.

**The media box is measured (`onLayout`) and slides sized in explicit points.** Zoom needs content that exactly fills its frame at scale 1 — and explicit sizing also retired the two flex-collapse-to-black traps the old file carried comments about; there is no longer a `flex: 1` image anywhere to collapse.

Intrinsic size comes from the image's own `onLoad`, not `Image.getSize`. This was a course-correction: the first draft used `getSize`, and `jest-expo`'s mock being incompatible with RN 0.86's promise-based call was what prompted a second look — at which point the real objection surfaced, that `getSize` issues a **second fetch of a signed URL** purely to learn dimensions already being downloaded. An unresolved or failed load falls back to the zoom floor, so it costs precision, never the gesture.

## What broke, and how

**The mixed-gallery defect.** An earlier draft measured the ceiling once at viewer level. A food carousel routinely mixes a full-res local capture with 1600px remote photos, so one shared ceiling either wastes a local photo's detail or overstates a remote one's. Fixed by giving each slide its own ceiling; pinned by a test that loads two different sizes into one gallery and asserts the ceilings differ.

**Falsification attempts** (the adversarial line is *not* mandatory here — a presentation gesture touches no detection, correlation, escalation, or vet-report field — but they were made anyway):

- *"A slow signed URL means `onLoad` never fires, so the ceiling is never computed."* Held. Every degenerate input resolves to the floor rather than to 1, so the gesture stays usable; each case is pinned by a test. Failing toward "the gesture still works" is the deliberate safe direction.
- *"A mixed local/remote gallery gets one shared ceiling."* **Broke it.** See above.
- *"A hardcoded expected scale in the component test asserts the wiring."* Broke a draft test — jest reports `PixelRatio` 2, not 3, so a literal was asserting the runner's screen density. The component test now derives its expectation from the pure function (its job is wiring; the arithmetic is covered against a real 3× device in `lib/photoZoom.test.ts`).

## The one unratified judgment call

`MIN_MAX_ZOOM_SCALE = 2.5` **permits zooming past the real-pixel ceiling** on a low-detail photo. Rationale: a dead pinch reads as broken; magnification has communicative value for *pointing at* a region in an exam room, not only for resolving it; and interpolation discloses itself as blur rather than masquerading as detail.

Dr. Chen's objection is recorded and **not** resolved — magnified JPEG artifacts on a suspected-blood or foreign-material photo can read as clinical texture, mottling and colour fringing not in the sample. His strict reading is `MIN_MAX_ZOOM_SCALE = 1`, one constant away and documented at the flip point. This is PM decision #4 and wants an on-device look at an older (remote) photo.

## Residuals

- **B-037** — cross-platform pinch, double-tap-to-zoom, swipe-down-to-dismiss, plus the tap-affordance half. Coupled to B-036 in the backlog: same component, same dependency, same build cut. Should ride the pending native `eas build` (W6 / rebrand icon / `supportsTablet: false` all need one, and the SDK-57 OTA fence means the next TestFlight cut must be native regardless) — landing the deps on a cut that is already mandatory is free; after it, a whole cycle.
- **Option C** — the 1600px cap. Unaddressed, and the reason the ingredient-list case is *not* fixed by this PR. Time-sensitive only in that it can never be applied retroactively. Note it changes what `analyze-vomit` / `analyze-stool` / the extraction functions see, making it an `adversarial-reviewer` item rather than a gesture change.
- **Does the vet report already zoom?** Viewport is `width=794` with no `user-scalable=no` / `maximum-scale`, and Android's `setBuiltInZoomControls` defaults to `true`. It has the most headroom of any surface and is what Dr. Chen actually reads. Unverifiable in a cloud session.
- **Five capture-preview surfaces have no expand affordance at all** — food-capture confirm, food-capture checklist thumb, medication-capture confirm, quick-log attachment thumb/banner, and the vet-visit **prescription** photo. For the exam-room scenario the prescription one is arguably a worse gap than zoom was.

## Base drift

`main` moved four times during this session (#460 B-431 landed six minutes before the first check). Merged in twice by hand rather than leaving it for the scheduled check-in — `docs/backlog.md` was touched on both sides and auto-merged; the B-036/B-037 rows were verified intact afterward. One check-in was armed mid-session while siblings were actively landing, per the CLAUDE.md bound, and cancelled at wrap.
