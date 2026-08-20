# Re-authentication before account deletion (CUL-215 / B-119)

**Date:** 2026-08-20
**Shipped via:** #684 (draft)
**Mode:** BUILD (launch-hardening, post-B-039)

## What shipped

A password re-confirmation before the destructive account-deletion call, closing the
threat type-to-confirm `DELETE` never addressed: an **unlocked/stolen phone** whose holder
already has a valid session can type `DELETE` too. The password is the "it's really you"
factor `DELETE` isn't.

**Design (Option B, PM-ratified in-session):** the password is sent with the delete request
and the **`delete-account` Edge Function re-verifies it server-side** — against the
token-holder's own email (from the verified JWT, never the body) on a fresh anon client —
**before any path collection or delete**. Wrong/absent password → 401, nothing deleted; the
client maps that 401 to an inline "That doesn't match your password."

Files:
- `components/profile/DeleteAccountSheet.tsx` — password field + inline mismatch; single
  server-verified delete call.
- `lib/account.ts` — `canConfirmAccountDeletion` now also requires a non-empty password
  (presence only, never trimmed); `requestAccountDeletion(password)` sends `{ password }` and
  maps the function's 401 → `reason: 'reauth'` (structural read of `error.context.status`, so
  no value-import of `@supabase/supabase-js` into the jest-mocked module).
- `supabase/functions/delete-account/index.ts` — server re-verify as step 0.
- `supabase/functions/delete-account/plan.ts` + `plan.test.ts` — `extractPassword` (pure,
  fails closed on every non-string/empty/missing shape) + deno tests.
- `lib/account.test.ts` — arm-predicate + 401-mapping tests.
- `supabase/functions/deploy-manifest.json` — `delete-account` → `hold` (deploy gate, below).

## Why server-side verify, and why NOT also client-side

The `app/settings/password.tsx` change-password screen re-authenticates **client-side** via
`signInWithPassword`. The first cut of this mirrored that (client re-auth + server re-verify).
The **`rls-privacy-reviewer`** flagged the cost: two sign-ins per deletion, ms apart, same
account → the second can **429 a correct password** on a tight rate limit, and CAPTCHA/rate-limit
dashboard states can silently brick the erasure path. Since the client check was never the
security boundary (it's trivially bypassed by a direct API call with a lifted token), it was
**dropped** — single server-side verify, identical UX (same inline error). This is a refinement
of the PM's Option B (server-side defense-in-depth preserved), not a reversal; noted in the PR.

Unlike change-password, deletion is **our own endpoint with no Supabase "Secure password change"
backstop**, so the server-side re-verify is the *only* place to close the direct-API bypass —
which is exactly why it's here and not left to the client.

## Deploy ordering — client-first (the one thing that must travel with this)

The function now **fails closed** (`reauth_required` 401) on a body with no password, and the
**current** shipped client sends none. Deploying the function **before** a client build with the
password field is live would 401 every current-client deletion — an **Apple 5.1.1(v) erasure
regression**. So: recorded in the deploy ledger as **`hold` (CUL-215)**; the CUL-135 drift gate
now holds the deploy until someone clears it *after* the client is live. The merge is safe (it
doesn't deploy); the deploy is the gated step.

## Reviews (DoD)

- **`rls-privacy-reviewer` — PASS.** 9 named attacks, each with the concrete attempt and the
  check that stopped it: lifted-token + no/wrong password refused before any read/delete;
  confused-deputy intact (identity token-only, password the sole body value); body
  type-confusion (`number`/`object`/`array`/`null`/missing) all fail closed via
  `typeof === 'string'`; re-auth strictly before `collectOwnedPaths` (failed run intact +
  re-runnable, FR-6); missing-email token fails closed (not skipped); brute-force bounded by
  GoTrue's own sign-in rate limits and own-account-only; no password/enumeration leak in
  responses or logs; B-039/B-354/B-478 erasure guards in `plan.ts` untouched.
- **`code-reviewer` — fix-before-merge applied** (extract + deno-test the server gate). Its
  duplication finding was resolved by dropping the client sign-in; it confirmed the flow is
  otherwise correct (no path fires the destructive call on bad re-auth, state hygiene right,
  tokens-only, no `any`, voice clean).
- **Adversarial review — N/A** (no clinical/statistical logic).
- `tsc` clean; full suite 5350/5350 (pre-push hook); copy-guard 17/17.

## Persona sign-off

Trust & Safety ✓ (server-side fail-closed boundary; erasure completeness untouched) —
Engineer ✓ (single verify, pure gate unit-tested, ledger hold) — Designer ✓ (nyx-voice, no dark
patterns, additive friction) — Dr. Chen N/A.

## Decisions / notes

- **Kept BOTH type-to-confirm DELETE and the password** (additive; different failure modes —
  accidental vs. unauthorized). Password-only would be lower-friction but drops shipped AC-2;
  flagged to PM as an open Designer call, not taken unilaterally.
- **STATUS.md untouched.** Orthogonal launch-hardening; changes no working-state field (Current
  Phase / Parallel Track / Blocking OQ / Runtime). The deploy gate lives in the ledger + on
  CUL-215, not in STATUS (size-budget discipline; same call as the CUL-137 session).

## PM action items (from the rls-privacy review — off-repo, before the client-first deploy)

- Confirm auth **CAPTCHA / bot-protection is OFF** (else the server sign-in fails for everyone →
  deletion bricked; login works today so it's presumed off).
- Confirm the **per-account sign-in rate limit** tolerates a deletion's sign-in.
- After the redeploy, confirm `delete-account` still shows `verify_jwt: true`.

## Residual filed

- Follow-up CUL issue: **delete-account re-auth — distinct client copy for a rate-limit/captcha
  failure vs. a wrong password** (honesty on the erasure path — a correct-password user hitting a
  rate limit currently sees "that doesn't match your password"). Low; the risk is much reduced by
  the single-sign-in design, so it's a polish item, not a blocker.
