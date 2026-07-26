# B-399 — the pet-photo alert, and the 14 sibling leaks the voice pass found

**Date:** 2026-07-26

Single-item copy fix that turned out to be a class. Shipped via **#470**. No schema, no Edge Function, no `lib/` logic — screen and component copy only.

## The filed bug

On pet-photo upload failure the owner saw:

```
Upload failed
Could not save photo. Make sure the nyx-pet-photos storage bucket exists and has upload policies.
```

Unactionable dev-speak, plus the retired `nyx` codename, on one of a new owner's first actions. Reworded to the string the backlog row prescribed, in the shape `app/(tabs)/profile.tsx:440` already used for a failed dose (`"Couldn't log that dose"` / `'Something went wrong. Please try again.'`):

```ts
Alert.alert("Couldn't save the photo", 'Check your connection and try again.');
```

The cause now goes to the `console.error` that was already one line above it. Line number in the row was `:383`; the file had drifted to `:341`.

This is the reword **B-431** asked for last session — its record closes with *"an ownership denial now surfaces through `app/(tabs)/profile.tsx:341`, which tells the owner the bucket may not exist — dev-speak with the wrong diagnosis. Already B-399; worth landing that reword soon."*

## What the sibling sweep found

The kickoff asked for a check on sibling alerts. It was not one site — **15**, across 7 files. Fourteen of them piped a raw provider string (`error.message`, `e.message`, or a `functions.invoke` transport message) straight into an alert body or a screen error state:

| Site | What the owner could see |
|---|---|
| `app/(tabs)/profile.tsx:341` | the filed bug — bucket name + "upload policies" |
| `app/add-pet.tsx:29` | raw Postgres/RLS message on pet creation |
| `app/report.tsx:132` | **`Report generation failed: FunctionsHttpError: Edge Function returned a non-2xx status code`** — on the Step 9 vet-report screen |
| `app/report.tsx:154` | raw `e.message` in the PDF-share alert |
| `app/food/[id].tsx` ×5 | load error state, save, add photo, extraction retry, remove food |
| `app/medication/[id].tsx` ×3 | load error state, item save, photo replace |
| `components/food/AlwaysAvailableCard.tsx` ×2 | free-choice toggle on and off |
| `components/event/{Vomit,Stool}AnalysisSection.tsx` ×2 | raw invoke message on analysis retry |

Every one now logs the cause and shows owner copy. Where the failure had two genuinely different owner-facing truths, the copy says which: the two detail screens' load state distinguishes a *retryable read failure* from a *missing row*, rather than collapsing both into the old `error?.message ?? 'Food not found'`.

The register came from `lib/authErrors.ts`, which already exists for exactly this bug — its header documents that "every auth screen used to pass Supabase's raw `error.message` straight into an Alert" and that the fix is one mapper and no raw provider string ever reaching an owner. The auth screens were the only surfaces already doing it right; they were left alone.

Its other rule shaped the wording too: *an inaccurate-but-confident error message is worse than a vague one, because it sends the owner off fixing the wrong thing.* Hence "Try again in a moment" for failures whose cause we genuinely don't know, and a named cause only where one is realistic.

## One thing worth flagging on the prescribed string

`"Check your connection and try again"` asserts a cause. After migration 042 (B-431) the photo path can also fail on an *ownership denial* — so on that path the copy is confidently wrong in the same way the old string was. Kept it anyway: for a legitimate owner the policy keys off their own pets, so a denial is the pathological case and the network is the realistic one, and the string is what the PM wrote in the row. Worth revisiting only if the denial path turns out to be reachable in practice.

## Deliberately not changed

- **The vet backstop.** `nyx-voice` Pattern 8's canonical example ends health-adjacent failure copy with "if you're worried about {pet}, your vet is the best call." Not added to the two analysis-retry alerts: that alert fires on a failed *trigger* (a network hiccup on a button press), the section still renders its own `Couldn't finish reading this one.` state underneath, and the vet backstop already lives in the server's read text where the read itself couldn't be produced. Putting it in a transport-failure alert would over-fire it.
- **Alert titles**, except one. `'Extraction failed to start'` became `"Couldn't start reading the label"` because "extraction" is build vocabulary. The rest were already in voice.
- **`app/food/[id].tsx:231`** (`'Brand and product name are required.'`) — form-speak, not a dev-copy leak; out of this sweep's scope.
- **STATUS.md** — nothing here made it untrue, so it was left alone per the `/wrap` minimise-the-diff rule.

## Filed

**B-477** — nothing structurally prevents the 16th site. All 15 are fixed by authorship only, and `lib/authErrors.ts` is standing evidence the class recurs. `nyx-voice` Ambiguity #1 had called a copy guard "not obviously worth the maintenance now"; 15 sites is the evidence that changed. Cheapest useful shape is a lint or source-scan test (the `widgets/CulpritWidget.test.ts` pattern) that fails when an alert body or error-state setter takes a non-literal derived from an error, with `authErrorCopy`-style mappers as the sanctioned escape hatch — folding in the `!`-and-jargon scan the same note describes.

## Verification

`tsc --noEmit` clean. Full jest suite green: **131 suites / 2331 tests**, no test asserted on any of the replaced strings. Re-grepped `app/` + `components/` afterwards: the only remaining `Alert.alert(copy.title, copy.message)` calls are the five curated `authErrorCopy` ones, and no UI string names a bucket, RLS, a policy, or the service role.

No PR check-in armed — no sibling PRs are mid-landing on `main` that this branch needs to track, and CLAUDE.md bars arming one at wrap.
