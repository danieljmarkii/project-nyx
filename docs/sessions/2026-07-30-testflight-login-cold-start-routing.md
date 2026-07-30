# TestFlight login-every-launch — root cause + fix (cold-start routing)

**Date:** 2026-07-30
**Outcome:** shipped via #518 (branch `claude/testflight-login-prompts-gsnptn`)

## The complaint

PM: "Pretty much every single time that I open the app I have to login." Persistent across the entire frequent-signin fix chain (#306 chunked keychain, #350 `AFTER_FIRST_UNLOCK`, #412 retain-on-transient-failure) and still live on TestFlight build 35.

## The diagnosis — server-side evidence first

Production `auth.sessions` for the PM account told the whole story before any code was read:

- **29 live (zombie) sessions**, one per login.
- Each session was created (password login), then **successfully refreshed exactly once, hours later** — and **5–10 seconds after that successful refresh, a brand-new session appears** (the next password login). Repeating for days: refresh 13:29:23 → login 13:29:29; refresh 01:07:00 → login 01:07:04; refresh 05:01:59 → login 05:02:06…

So the keychain storage, the chunked adapter, and the refresh-token path are all **healthy**: at every cold start the app restores the persisted session and redeems the refresh token server-side. The owner then logs in over the top of a perfectly good session, because they are looking at a login wall. Storage was never the remaining bug — **routing** was.

## The mechanism

Since B-251 PR 5 (#290) added the Signal-led Landing at `app/(auth)/index.tsx`, both `(auth)/index` and `(tabs)/index` match the root URL `/`. expo-router's `sortRoutes` treats both groups as index-like and breaks the tie by route-name length — `(auth)` vs `(tabs)` tie there too — so directory order wins and **`(auth)` sorts first: the Landing is the cold-start initial route for everyone, signed in or not.**

`app/_layout.tsx`'s cold-start `getSession()` handler: the `'proceed'` branch only called `setSession(session)` — **no navigation**. The Landing's own header comment claimed "users with a live session are routed straight to the tabs by app/_layout", but no such route existed anywhere (`grep router.replace('/(tabs)')` → only login/confirm/onboarding/settings). Warm resumes skip remounting, which is why the symptom was "pretty much every" open, not literally every.

This also explains why #412's on-device AC ("Airplane Mode reopen → you stay on Home") could never have passed on a true cold start: the retain branch avoided an explicit bounce, but the initial route already *was* the login wall.

## The fix (this PR)

- **`app/(auth)/index.tsx`** — the missing route, as a session guard on the Landing itself: `focused && session && !recoveryInProgress` → `router.replace('/(tabs)')`.
  - **Focused** because signup mints a session while the Landing sits unfocused beneath it in the stack — an unfocused redirect would hijack signup's own replace to onboarding.
  - **`!recoveryInProgress`** because a recovery session must land on set-password, never Home (B-280 Trap 1).
  - Declaratively covers both the `'proceed'` cold start and the `'retain'` recovery (TOKEN_REFRESHED writes the store while the owner is still on the Landing → the guard fires).
  - The auth CTAs (+ marketing sub + "See how it works") now **hold until the cold-start decision lands** (`isLoading`) and while a session exists — a signed-in cold start shows night ground + moon → Home, never a login-wall flash. A signed-out decision is a local keychain read (no network), so CTAs appear effectively instantly for the owner who needs them.
- **`app/_layout.tsx`** — comments corrected to describe the real routing (the stale "skips straight past auth" claim was load-bearing misdirection for every prior debugging session).
- **`app/(auth)/index.test.tsx`** — five new cases: restored-session redirect (+ no CTAs on that frame), late-arriving-session redirect, no redirect unfocused, no redirect with recovery gate armed, CTAs held while loading.

## Verification

- `tsc --noEmit` clean; full `npm test` green locally; auth-adjacent suites (58 tests) green.
- Server-side evidence is the regression test in spirit: after this ships, `auth.sessions` for the PM account should stop minting a new session per open (watch: new sessions only on genuine sign-ins; existing session's `refreshed_at` advancing across days).

## Explicitly out of scope / follow-ups

- **B-609 (new):** an OFFLINE cold start ('retain' with no recoverable network) still waits on the Landing with CTAs rather than reaching Home on local data — tabs render empty without a user (`usePet` bails). Needs local-first pet hydration, not routing.
- **Zombie-session cleanup:** the 29 abandoned sessions are harmless (they expire per project refresh-token settings); no action taken.
- **B-279's trigger** ("revisit if logouts persist after build 34") is answered: they persisted, but the cause was routing, not the chunked adapter's residuals. Row untouched.
