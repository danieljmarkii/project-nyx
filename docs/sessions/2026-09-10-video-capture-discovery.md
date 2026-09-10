# Video as evidence — the product team on "record a clip, document it, surface it later" (CUL-507 restored)

**Date:** 2026-09-10

Shipped via **#819** (draft) on branch `claude/culprit-video-capture-x4a05v` (the record only). Mode: **DISCOVERY** (a team discussion, directions compared, two conflicts surfaced, five decision briefs; no app code, no schema, no change to the manual). Issue **CUL-507** (B-757), restored from Canceled. Published brief: https://claude.ai/code/artifact/bd2a1b23-d387-4b24-a260-66260e48f584 (round 1; the canonical text is this file).

## What the PM said

> "I have some data capture capabilities built into culprit. Ex photos. Like.. direct data capture. First hand evidence. I think there's an opportunity to capture videos. Ex. I saw my pet exhibiting a behavior and want to record a video to log it. There's a range of ways to solve.. we could simply link out to other platforms.. integrate w other platforms.. capture videos natively.. and likely a whole other range of ideas. Let's gather the team and discuss how we might support the job to be done of.. I want to record a video so that I can document a situation and surface it later."

Read as: a discovery, not a build; the PM wants the team's read on the *directions* before picking one; the job is stated in three verbs (record, document, surface) and the team should hold all three.

## What already existed (found, not re-derived)

- **CUL-507 / B-757** "Video capture + analysis for non-photographable events (cough, gait, seizure-like episodes)". Filed 2026-08-14 from the PM's signals deep-dive read ("if I had a way to upload a video and have that video analyzed it would be incredible. But I'm assuming that's a MASSIVE workstream"), already split into two rungs priced separately: (1) video as an attachment a vet watches, no AI, "moderate"; (2) AI over video, "large", gated on its own evidence bar plus a D8-class PM + T&S ruling. Canceled 2026-08-20 in the reconciliation as bucket E "someday-maybe, no current path" with the note *"Restore if it returns to the roadmap."* Restored this session rather than duplicated (Product Owner: dedupe first). It still sits in the shipped **Signals v2** project, which is the wrong home; where it lives is part of brief D-V1.
- The taxonomy spec carries the question as **Q3** (`docs/nyx-event-taxonomy-requirements.md:644`, owner PM): "Does B-757 get restored when a cough type ships?" and lists video capture as a non-goal pending that call (`:65`). The same line pre-classifies camera-based respiratory-rate measurement as AI-over-media, D8-class: the RRR leaf is a manual tap counter in any version.
- `docs/logging-capture-discovery.md` §1.3 (2026-07-10): the camera roll + Notes "wins the *capture* race today"; every dollar on step 4 (the log itself) buys nothing, steps 1–3 (remember, reach the phone, launch) "live at the OS layer." The direction this session takes on the record door follows from that finding.
- `docs/nyx-vet-files-requirements.md` D5 is the repo's one precedent for admitting a new media class (PDF): **store-and-view only, every processing verb denied explicitly**; D8 for AI over documents; §5.2 flags any media path with no strip transform as a hazard ("flag any future scanned-to-PDF path").
- `docs/nyx-incident-screen-requirements.md` D3: the photo is the hero *because* "I want the pet owner to be able to pull up a vomit and show it to a vet"; §5.4 the viewer's caption is derived, never a display string.
- `docs/monetization-and-throttling-requirements.md` §3 row 1: core logging incl. photos and attachments is free forever; the cap gates the model call only, never the log. No storage or attachment cap is ruled anywhere.
- `docs/research/2026-08-signals-deep-dive.md` §4 cites BMC Vet Res 2015 for rung 2's warning; re-verified this session (below).

## What the tree holds (two isolated sweeps + the live database)

**Reuses as is.** `event_attachments` (migration 003) has no mime CHECK, default `image/jpeg`; the `nyx-event-attachments` bucket is private, per-pet path prefix, RLS on all four verbs (025), and has **no `file_size_limit` and no `allowed_mime_types`** (verified live with `select … from storage.buckets`, 2026-09-10) — a `video/mp4` row and object would be accepted today, by accident. The upload path reads bytes via `expo-file-system` (`lib/storage.ts:231-260`, the 0-byte blob trap avoided), sets `cacheControl: '0'`, takes an explicit mime. The queue is one drain at a time (`serializeQueuePush`), transient failures free, 25 attempts, HTTP 413/415 terminal (`lib/syncQueue.ts:192`). Detach removes storage first (`lib/attachments.ts:56-75`); `delete-account` purges all seven buckets; the sign-out wipe derives its file set from `sqlite_master`. `NamedPayload.hasAttachment` makes Undo confirm and name a photo (`components/ui/NamedCompletionCard.tsx:267-281`).

**Needs new work.** Every `expo-image-picker` call site passes `mediaTypes: ['images']` (ten sites); no `expo-camera`, `expo-av`, `expo-video`, or `expo-media-library` anywhere; `components/ui/PhotoViewer.tsx` is `<Image>`-only and `expo-image` is not a dependency. `compressForUpload` is `expo-image-manipulator`; nothing re-encodes video. No duration/size/source columns on the attachment (the `vet_documents` table is the shape to copy). `constants/eventTypes.ts:86` `hasPhoto` is per leaf and **`cough` / `sneeze` are `false`** ("no photo zone") — the leaves video serves render no media zone. Copy siblings owed for `ADD_PHOTO_ACTION`, `ADD_PHOTO_HINTS`, the Undo confirm, the caption.

**Hard facts to design around.** `app.json:59` `"microphonePermission": false` is deliberate (`docs/app-store-readiness.md:36`: an unused permission string is its own review risk) — sound means a config change **and a new native build**. The photo path strips EXIF/GPS by re-encoding; a phone video carries a QuickTime location atom and **no transform exists for video** — whether the picker's export preset drops it is unverified. `generate-report` embeds photos as EXIF-stripped data URIs (max 40, 3.9 MB each) and is a held deploy (CUL-19); a PDF cannot carry a clip. Every AI path (`_shared/incident-analysis.ts`) is image-only and byte-capped; `ask` A8 forces the image transform. `lib/network.ts:15` reads reachability only — every upload runs on cellular, immediately. `vet_documents` rejects `video/*` by CHECK and by test (`lib/vetDocuments.test.ts:56`).

**Time provenance.** `occurred_at_source` is `'manual' | 'exif' | 'now'` (no CHECK); the log paths re-date from EXIF through `trustedPastExifIso` (`app/log.tsx:346-353`), the detail paths attach without re-dating (`exif: false`). The picker returns `exif: null` for videos and no creation date; `expo-media-library` returns `creationTime` under the library permission the library door already requests.

**Found on the way, filed rather than folded in.** **CUL-879**: `app/vet-visit.tsx:95-103` parses the EXIF date without `trustedPastExifIso` (a future camera clock lands as `visited_at`); Quick Win. **CUL-880**: five of seven buckets (`nyx-event-attachments`, `nyx-food-photos`, `nyx-medication-photos`, `nyx-vet-attachments`, `nyx-vet-reports`) have no size or type limit; verified live; proposal on the issue, values Waiting on PM; independent of this track and its natural PR-0.

## Platform facts, checked at the source today

- **Expo SDK 57 `expo-image-picker`**: `mediaTypes: 'videos'`; `videoMaxDuration`; `videoQuality` (iOS only); `videoExportPreset` (default Passthrough — on iOS Passthrough requires media-library permission; a re-encoding preset avoids it and shrinks the file); `allowsEditing` gives the system trimmer (iOS caps at 10 min); assets carry `duration` (ms), `fileSize`, `width`/`height`, `mimeType`, `exif: null`; the config plugin's `microphonePermission` sets `NSMicrophoneUsageDescription`.
- **`expo-camera`**: `CameraView mode="video"`, `recordAsync({ maxDuration, maxFileSize, mute })`, `videoQuality` 2160p…480p; audio requires the microphone permission; works in Expo Go.
- **`expo-video`**: `VideoView` with `nativeControls`, `contentFit`, `fullscreenOptions`; `useVideoPlayer`; `useCaching` on the source (off for health media); headers on a network source; `generateThumbnailsAsync` on iOS/Android.
- **Supabase Storage** (pricing page + file-limits guide): Free 50 MB per file, 1 GB storage, 5 GB egress; Pro up to 500 GB per file, 100 GB storage then $0.0213/GB, 250 GB egress then $0.09/GB standard ($0.03 cached). Bucket `file_size_limit` may not exceed the project's global limit.
- **iPhone clip sizes** (iMore's compilation of the Settings-screen figures; third-party, order-of-magnitude): ≈60 MB/min at 1080p30 HEVC, ≈40 MB/min at 720p30 HEVC, roughly double in H.264. A 30 s default clip ≈ 20–30 MB before any export preset.
- **Packer et al. 2015, BMC Veterinary Research** (Europe PMC abstract): 100 videos of canine and feline paroxysmal events rated online by neurology specialists and non-specialists; agreement on epileptic-seizure presence κ = 0.40 (fair), seizure type κ = 0.44 (moderate), primary generalised 0.60, focal 0.31, consciousness and autonomic signs 0.21–0.40, neurobehavioural signs 0.16 (poor). Conclusion: "the relatively low levels of agreement … highlight the need for … diagnostic tools (e.g. electroencephalogram) able to differentiate between epileptic and non-epileptic paroxysms."
- **Vets ask for exactly this artifact**: telehealth services (Vetster, Rex Vet) request a 15–60 s well-lit clip; a vet-authored piece (Pet Health Network) names limping, coughing, sneezing and lethargy as symptoms that "have a way of magically disappearing when the animal is under the influence of adrenaline," with the caveat to skip the video and go to the ER for anything life-threatening.

## The team on it

- **Dr. Chen.** A clip answers what the taxonomy could not make owners answer: cough vs reverse sneeze vs retch (the cough leaf shipped bare; Q9 deferred dry/wet chips), vomiting vs regurgitation (the council's "active retch?" proxy is the owner's guess; the clip is the thing), a limp graded from movement, breathing effort at rest and open-mouth breathing in a cat, a sleeping breath count *she* takes from 30 s of a sleeping pet, straining in the litter box where the owner cannot tell what came out. **Sound is half the evidence.** Never the app's read: Packer 2015 says specialists disagree on presence at κ 0.40; the clip goes to a neurologist because it is hard, and that same fact forbids the app captioning it "seizure" or saying "looks normal." Clip length is stored and shown as clip length, never as how long the episode lasted (the CUL-62/CUL-223 class).
- **Designer.** Do not compete for the first frame: the lock-screen camera is faster than any app will be, and the capture-discovery already measured that. Own the moment after: import is the reflective moment, two taps, Principle 2 applied to evidence. The record door still earns its place for the owner already in Culprit logging the bout; the system camera, not custom chrome. On the record a tile, not a hero (D3 gave the hero to the photo because the read needs it); tap to play, never autoplay, never loop; the §5.4 caption plus the duration; the completion card names it; Undo confirms and names it. Home never shows a clip.
- **Engineer.** Rung 1 stays "moderate": import = the picker in video mode + trimmer + a re-encoding export preset, `expo-video` with native controls and caching off on the same one-hour signed URL the hero uses, one additive migration, a new native build. Record = the same picker's camera with `videoMaxDuration: 60` + the mic string + a build; small once import exists. Bucket limits from the dashboard, never SQL; the terminal 413 must become a sentence. Server: nothing for rung 1; the report line rides CUL-19; no poster frames in v1.
- **Data Scientist.** A clip is evidence, not data — never in the engine, a count, a floor, a coverage line (the Noticed rule generalised). Provenance is the design: on a new log the clip's own time seeds the event (the photo path's EXIF shape), on an existing record it attaches without re-dating (the photo split); a roll clip is witnessed by construction, so `occurred_at_confidence` stays `witnessed`. Creation time from the media library when granted, else the owner's existing time control, default now, `manual` only on a real edit. Store `source` (camera / library) **and render it** ("recorded Tue 7:14 pm · added Thu"); do not repeat CUL-464.
- **Trust & Safety.** Audio is a new data class (household voices, children); import carries it too because the OS recorded it, so the privacy label's scope sentence and the policy add "short videos with sound" whichever door ships first; the mic purpose string is asked only at the moment of recording. **No transform exists**: PR-2 is gated on proving, by download-back, that no location metadata survives the export preset; if it survives, a strip step is a precondition. Same boundaries otherwise: private bucket, per-pet prefix, short signed URLs never persisted, player caching off, `rls-privacy-reviewer` on the build PR. AI over a clip stays D8-class.
- **Jordan.** "Mochi is doing the weird thing right now. I'm not opening Culprit. I'm swiping to the camera." Later, two taps put it on Mochi's record, dated Tuesday not Thursday; thirty pre-Culprit clips are the backfill the trial record was missing; no upload bar on the way out the door.
- **Sam.** "Pixel's coughs are four seconds long and happen at 5 am; what I have is the third cough of the bout, blurry, from across the room." Still useful (Dr. Chen: the sound separates cough from retch from reverse sneeze), so the preset must not crush the audio track. The clip attaches to the record's pet and the sheet says whose. Never "analysed the video and found nothing."
- **QA.** New with video, not inherited: a 3-minute clip by mistake; over the bucket limit (413 said, retry or remove); mic denied after the string ships; a screen recording or Live Photo picked; orientation on playback; a photo and a clip on one event (the photo stays the hero for vomit/stool); offline on a full device; the same clip twice; Undo naming a clip whose original still lives in the roll. All on-device.
- **Product Owner.** Restore, don't duplicate; the project home is wrong; Q3 is answered by D-V1; CUL-879 and CUL-880 filed on their own; priority is the PM's to set (Medium proposed, post-launch).

## Directions compared

| # | Direction | Record | Document | Surface later | Cost | Verdict |
|---|---|---|---|---|---|---|
| A | **Link out** (open the Camera app / a note "I recorded a video") | OS-fast | no | no | free | **No** — the clip never enters the record |
| B | **Import from the camera roll** (system picker, trim, cap, honest dating) | retrieve | yes | yes | M, one native build, no new permission | **Yes, first** |
| C | **Record in Culprit** (log-sheet door → system camera, ≤60 s, sound) | yes, slower than the lock screen | yes, witnessed | yes | S after B + mic string + build | **Yes, second** |
| C′ | Custom in-app camera (`expo-camera`, Culprit chrome) | yes | yes | yes | M–L, a new surface | not v1 |
| D | **Integrate** — light: an iOS "Share to Culprit" extension; heavy: iCloud/Google Photos/a clinic system | retrieve | yes | yes | light rides the un-ratified native-target path (B-290); heavy has no standard | later (light) / no (heavy) |
| E | Live Photos | yes | yes | weak | S | no — too short for a bout |
| F | Audio only | yes | yes | partial | S | no — a clip carries it anyway |
| G | AI over the clip (rung 2) | — | — | — | L + a D8-class ruling | parked |

**Why B before C.** No new permission, no label change, meets the clips owners already have, backfills, and is the cheapest way to learn whether clips get attached and watched before paying for the record door's permission surface.

## Where the lenses disagree (Conflict Protocol)

> **Dr. Chen:** the job the PM stated is "record it when it happens"; an owner logging a cough bout in Culprit should record the next one from Culprit, with sound. Import alone leaves the moment to the camera app and the record a day behind.
> **Designer:** Culprit will never be the fastest camera; a record door tempts the owner to lose the moment fumbling for the app. The honest v1 is import only; the door is earned by evidence that clips get attached at all.
> **PM decision needed:** one door or two, and in which order (→ D-V2).

> **Dr. Chen:** a muted clip is a lesser artifact; do not ship a record door without sound.
> **Privacy lens:** the microphone is a new data class, a new prompt, a new label row, and the launch build removed that string deliberately; sound is a submission-surface change.
> **PM decision needed:** does the record door ship with sound, or wait (→ D-V3).

**Dissolved on a fact.** Data Scientist vs Designer on whether import may ask "when was this?": the picker returns no date for a video, but the library door already asks the media-library permission and the library returns the creation time; so import pre-fills when granted and falls back to the owner's existing time control when not — the photo path's own shape, no new question at the moment of event.

**Resolved by an existing ruling.** Jordan (it's evidence, it's free) vs Engineer/PO (unbounded media is an abuse vector): monetization §3 row 1 settles it — the record is never gated; a per-clip cap and an export preset are the bound; a per-account fair-use counter in `app_config` is a lever, disclosed in the calm register, identical across tiers, only if abuse appears (the values are D-V4).

## The recommendation, shaped

Restore rung 1 as a **post-launch 1.x track** in its own project: two doors, import first, the vet as the only reader, no AI. If greenlit, one PR per session, in this order:

| PR | What | Notes |
|---|---|---|
| PR-0 | Bucket hygiene on `nyx-event-attachments`: ~25 MiB limit + a type list incl. `video/mp4`, `video/quicktime`; the terminal 413 becomes an owner-facing sentence | dashboard, not SQL; rides CUL-880 |
| PR-1 | Migration: `duration_ms`, `file_size_bytes`, `source` on `event_attachments` + the local mirror | additive; rollback drops three columns; backfill N/A; own PR |
| PR-2 | Import: picker in video mode + trim + medium export preset; `hasVideo` per leaf (every symptom leaf + `other`); the attach path; `expo-video` on the event screen with the caption + duration; completion card + Undo naming; a play marker in History; creation-time dating via the library when granted | new native build; `rls-privacy-reviewer`; **gate: the stored object carries no location metadata, verified by download-back** |
| PR-3 | Record: the log-sheet door via the system camera, 60 s cap, sound on; the mic purpose string; the privacy label's scope sentence + policy (rides CUL-161) | a new build |
| PR-4 | The report lists clips on file (date · time · length · event) under the incident and in Appendix E; never embedded | rides CUL-19 |
| later | poster frames (`generateThumbnailsAsync`); a "Share to Culprit" extension (B-290); a History lens; streaming through the public link's token route (Step 9 PR 6) | each its own greenlight |

**Bounds:** 60 s per clip; a medium export preset on both doors (single-digit MB, audio intact); bucket limit above it so a legitimate clip never hits the terminal 413; no per-account cap in v1.

**Copy, illustrative, for the `nyx-voice` pass:** "Add video" beside "Add photo"; on a cough, *A short clip with the sound on lets a vet hear it.*; on the record `0:23 · recorded Tue 7:14 pm · added Thu`; Undo *The video you attached will be removed with it.* / on an import *Your camera roll keeps its copy.* Never "analysed", "looks normal", "seizure", "laboured".

**What we will not do:** AI over a clip or frame extraction into the photo reads (rung 2, D8-class); a clip on Home, in the engine, a count, a floor, a coverage line; autoplay, looping, sound without a tap; a custom camera in v1; embedding in the PDF; a clip through the unshipped public link; any gate on the record; "looks normal."

## Decision briefs (on CUL-507, Waiting on PM)

- **D-V1 · Restore rung 1, and where it lives.** *Deciding:* whether "video as evidence" becomes a build track, its Linear home, and pre- or post-submission. *Options:* (a) **restore as a post-launch 1.x track in its own project** ← recommended (sound + the label are submission-surface changes; do them once, after 1.0); (b) restore and pull import (PR-2, no new permission) into the launch build; (c) leave parked. *Consequence:* (a) unblocks PR-0/PR-1 planning, answers taxonomy Q3, moves CUL-507 out of Signals v2; (b) adds a native build to the launch critical path.
- **D-V2 · Which doors.** *Deciding:* import only, or import + a record button. *Options:* (a) **both, import first** ← recommended (Dr. Chen's door on the Designer's sequence); (b) import only, the door earned later; (c) record only (the literal ask; forfeits backfill). *Consequence:* (a) fixes the PR order; (b) drops PR-3 and the mic question; (c) inverts the order.
- **D-V3 · Sound.** *Deciding:* whether the record door captures audio (mic string, new build, label row). *Options:* (a) **with sound** ← recommended, asked only at the moment of recording, purpose string specific, label + policy in the same PR; (b) muted; (c) hold the record door until CUL-161 is settled, ship import alone meanwhile. *Consequence:* (a) is the only option that makes the door worth building; (c) is (a) on a delay and costs nothing if D-V1 is post-launch.
- **D-V4 · The bounds.** *Deciding:* per-clip cap, export quality, per-account fair-use cap. *Options:* (a) **60 s, medium preset, 25 MiB bucket limit, no per-account cap in v1** ← recommended; (b) 30 s (fits a cough, not a walk or a breath count); (c) a per-account daily clip counter in `app_config` now. *Consequence:* sets PR-0's values and PR-2's copy; (c) adds a Track-2 counter and a QA state.
- **D-V5 · Rung 2 stays parked (confirm).** *Deciding:* whether any AI touches a clip in this track, incl. frame extraction. *Options:* (a) **none; the app never claims to read a clip; rung 2 re-opens only with a D8-class ruling and a defined evidence bar** ← recommended, Packer 2015 as the floor; (b) scope the evidence bar now as its own discovery. *Consequence:* (a) keeps the track outside the 5.1.2(i) gate and every AI cap; (b) is a research session.

## Research debt (premises a build checks, never assumes)

- Whether the picker's export preset strips the QuickTime location atom (Apple's export session passes all metadata through unless a filter is set). **PR-2 gate.**
- Actual clip sizes after the medium preset on the PM's devices.
- Android: video quality options are iOS-only in the picker; camera-app behaviour varies.
- Mic permission denied after the string ships: silent video or a refused recording.
- Owner camera-roll behaviour has never been measured (B-195 / CUL-268 archived unrun); the PM's own roll is the first data point.
- Competitor video support unchecked at store-record strength (Petalife's "gait analysis from video" graded E in July); re-verify at use (CUL-671).

## Three questions for the PM (non-blocking)

1. Would your vet watch a clip from your phone in the room, or want it sent ahead? (share sheet in v1 or later)
2. Which behaviour is in your mind's eye: the cough, a wobble, a limp, something else? (which leaves get the affordance first; whether `other` is enough for v1)
3. Are there already pet videos in your camera roll from before Culprit that you would want on the record? (the import/backfill case; the one piece of evidence nobody has)

## Decisions made this session

None PM-ratified, by design: the five briefs are on CUL-507. Taken in-session and labeled: CUL-507 restored (per its own archive note) rather than a new issue; two incidental findings filed on their own (CUL-879, CUL-880); the brief published as an Artifact with this file as the canonical text.

## Definition of Done (discovery)

- AC: N/A — discovery; no build step advanced.
- Diff vs anti-patterns: N/A — no code.
- Types / lint / tests: N/A — a `docs/sessions/` file only.
- Secrets: none introduced.
- Persona sign-off: Dr. Chen ✓ (the clinical case, the Packer bound, the length/sound rules) — Designer ✓ (Principles 1, 2, 3; the two-door sequence) — Engineer ✓ (the reuse map, the build/permission facts, the PR shape) — Data Scientist ✓ (evidence-not-data, provenance) — T&S ✓ (audio as a data class, the transform gap, the label) — Jordan ✓ — Sam ✓ — QA ✓ (the edge-case list) — Product Owner ✓ (restore, dedupe, the two filed issues).
- Adversarial review: N/A — no clinical or statistical logic; the one load-bearing clinical claim (rung 2's evidence bar) was re-verified at the source (Packer 2015) rather than carried from the deep dive.
- Isolated reviews: none run at discovery. Owed at build: `rls-privacy-reviewer` on PR-2 and PR-3, the device pass, `pm-feature-review` once the flows exist.
- Future-self review: the pattern proposed is the existing attachment pattern with one more mime; the one new thing (a media class with no strip transform) is named as a PR-2 gate, not deferred.
- Dev handoff: none — no code to run. Backend deploys: none.
- PM action items: CUL-507 (rule on D-V1…D-V5), CUL-880 (confirm the bucket values).

## Next session kickoff

**Recommended first prompt (after the PM rules on CUL-507):**
> Video as evidence, PR-0 + PR-1: read `docs/sessions/2026-09-10-video-capture-discovery.md` and the rulings on CUL-507, apply the `nyx-event-attachments` bucket values from CUL-880 via the dashboard (never SQL), then write migration `event_attachments.duration_ms / file_size_bytes / source` as its own PR with the Migration Safety Pre-flight.

**Alternates:**
- If the PM wants frames before ruling: a mock round for the two doors and the event-screen tile (`docs/culprit-video-capture-mockups.html`; the "mock what you change" rule).
- CUL-879 as a Quick Win in any session (one line plus the designed two-option chooser on the vet-visit screen).
- CUL-880's image-only values on the other four buckets, independent of any ruling.

**Parallel / efficiencies:** PR-0 (dashboard) and PR-1 (migration) are disjoint and can run in one session; PR-2 is the long pole and needs a native build, so cut it early in a Runtime-B week; PR-3's label wording can be drafted alongside CUL-161's without waiting for PR-2; PR-4 waits on CUL-19 whatever else happens.
