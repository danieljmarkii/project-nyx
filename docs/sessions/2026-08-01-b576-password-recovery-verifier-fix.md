# B-576 — the password-recovery §6.4 ordering deletes the PKCE verifier

**Date:** 2026-08-01
**Shipped via #549** (draft). Docs-only; no code, no schema.

## What this fixes

The password-recovery spec (`docs/nyx-password-recovery-requirements.md`) reached
v1.2 with §6.4's handler ordering **step 5 `supabase.auth.signOut()` → step 6
`exchangeCodeForSession(code)`** — deliberately, so the shipped `SIGNED_OUT`
teardown runs (the v1.1 fix for `rls-privacy-reviewer`'s five blockers) instead
of a second teardown written for a non-null → non-null swap.

That ordering **cannot work**. `signOut()` deletes the PKCE code verifier that
`exchangeCodeForSession` needs, so step 5 destroys the credential step 6 depends
on. Every recovery exchange would fail — and fail as `wrong_device`, telling the
owner to open the link on the phone they are already holding. B-576 filed it
(2026-07-28, while building B-432's confirm handler); this session evaluated the
options and rewrote §6.4.

## Verified against the installed library, not inferred

Read `node_modules/@supabase/auth-js/dist/module/`:

- `_removeSession()` (`GoTrueClient.js:4016`) removes `${storageKey}-code-verifier`
  — and `signOut()` calls it.
- `_exchangeCodeForSession()` (`:1466`) *reads* that verifier; with it gone it
  throws `AuthPKCECodeVerifierMissingError`, whose message is literally
  *"PKCE code verifier not found in storage. This can happen if the auth flow was
  initiated in a different browser or device…"*.
- That message matches the app's `wrong_device` classifier —
  `classifyExchangeOutcome`'s `VERIFIER_ABSENT_RE = /code[_ ]verifier|pkce/i`
  (`lib/passwordRecovery.ts:138`). So the library's own error text blames "a
  different device", which is the exact false story §5.5b would render on the
  right phone.
- Bonus corroboration: `_saveSession()` (`:3980`) also clears the verifier, which
  is why the **success** path (adopting B's session) needs no cleanup.

The bug is invisible to the test suite because `passwordRecovery.ts` is pure and
all its cases pass; the fault lives only against the real client. The full jest
suite (176 suites / 3931 tests) stayed green through the change — as it must,
since no code was touched.

## The decision — B-576 option (d)

The backlog row had filed three options. This session added and chose a fourth:

- **(a)** save the verifier before `signOut()`, restore it after — writes into
  auth-js's *private* storage key; fragile across upgrades. Rejected.
- **(b)** exchange first, then tear down — reopens the exact non-null → non-null
  swap window the v1.1 F1 fix closed. Rejected.
- **(c)** wipe without `signOut()` — right direction, but framed as "a second
  teardown", the thing §6.4 was avoiding.
- **(d) chosen** — drive the **store** session to null (`setSession(null)` +
  `wipeLocalSession()`) instead of calling `signOut()`. `useSync.ts:13` and
  `useWidgetSnapshots.ts:30` destructure `session` from `useAuthStore` and gate
  their `[session]` effects on `if (!session) return` — they key on the **store,
  not the Supabase client** — so the store-null transition stands them down
  exactly as `SIGNED_OUT` does. `wipeLocalSession()` is the *same* shipped
  teardown, called directly (not a second one), so the verifier is never touched.

The framing that resolves it: **`signOut()` was §6.4's *mechanism*, never its
*requirement*.** What the v1.1 fix actually needed was the store session to go
null; `signOut()` was one way to get there, and it happened to be the one that
also deletes the verifier.

## The hazard option (d) introduces, and how it's closed

Nulling only the store leaves auth-js still holding the previous owner's tokens
(`persistSession: true`). On success this is harmless — the exchange overwrites
them. But on a **failed** exchange the store reads signed-out while auth-js still
holds A, and its `autoRefresh` could refresh A's token and emit `SIGNED_IN` —
silently restoring the previous owner onto the just-wiped device. So **FR-15's
`finally` now calls a real `supabase.auth.signOut()` on the failure path** to
purge those tokens, safe there because the exchange has already failed and no
live PKCE flow remains for the verifier deletion to break. Step 8 orders the
reconcile `signOut()` before `releaseRecoveryGate()`, so its `SIGNED_OUT` routes
to the §5.5 failure screen (gate still armed) rather than the Landing.

## Edits (all in the two docs)

- **Spec bumped v1.2 → v1.3.** §6.4 rewritten (two-round history + the (a)–(d)
  option table + the re-sequenced steps 1–8 + the hazard/reconcile note + the
  updated "Where the `SIGNED_OUT` branch goes"). FR-7 (store-null teardown), FR-15
  (failure-path reconcile `signOut()`), §0.3, the version-history block, §9's PR-2
  row, §6.6's step reference, and §12's F1 audit pointer all aligned so no section
  still asserts the old mechanism.
- **Backlog:** B-576 marked design-resolved (still a PR-2 build item); B-280's
  PR-2 clause updated.
- **STATUS.md:** password-recovery track section updated (spec v1.3, PR-2 blocker
  resolved, the carry-forward finding's "fix" clause corrected).

## Residual flagged, not fixed (docs-only session)

Two comments in `lib/session.ts` (~lines 126, 132) describe step 5 as "the
pre-exchange signOut" and will want a one-word touch-up when PR 2 is built. Their
*substance* (the wipe runs before the exchange; the FR-12 pre-fill comes from
memory; the gate is spared) is unchanged.

## Personas / review

Engineer (the teardown/ordering call) · Trust & Safety / Privacy (the
cross-account restore hazard on the failure path — the reason FR-15's reconcile
`signOut()` is mandatory). No clinical/statistical logic touched, so
`adversarial-reviewer` is N/A; the equivalent rigour here was the line-by-line
verification against `@supabase/auth-js`. PR 2 (the code) still carries the
mandatory `rls-privacy-reviewer` merge gate per §9 — this session only corrects
the spec it will build against.
