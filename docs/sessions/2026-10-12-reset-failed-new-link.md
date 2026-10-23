# Password reset: a failed link offers a new one, not a retry that can't work (CUL-1888)

**Date:** 2026-10-12
**One thing:** D3 L2 — A contract test checks someone else's code, so a library upgrade cannot quietly undo a decision built on it · check: pending

Shipped via #1203. BUILD session on [CUL-1888](https://linear.app/projectnyx/issue/CUL-1888), found by the `rls-privacy-reviewer` pass on [CUL-1886](https://linear.app/projectnyx/issue/CUL-1886) earlier the same day.

## What broke

The reset screen's `failed` state (a transport or server failure on the code exchange, or the 20-second watchdog) offered "Try again", which re-exchanged the same code through `retryRecoveryExchange`. auth-js 2.105.4 removes `${storageKey}-code-verifier` on both the error path and the catch path of `_exchangeCodeForSession`, so the verifier is gone after any failure, a thrown network error included. The step 8 reconcile `signOut({ scope: 'local' })` removes it again. A retry therefore always classified `wrong_device`: "Open this link on the phone you asked from", shown on the phone that asked.

The issue offered a second shape, keeping "Try again" for a failure before the request reached the network. Checked against the source: there is no such failure. A missing verifier throws into the same catch, and a fetch that never connects throws into it too. Only one shape was left, so it was built as a team call inside the ratified design.

## What shipped

- `app/(auth)/reset-password.tsx`: the `failed` state's primary action is "Send a new link", to the request screen pre-filled with the address held before the wipe (FR-12), the same exit `link_unusable` uses. Body copy: "Something interrupted the connection, and a reset link can't be tried twice. Send yourself a fresh one." The title stays. The deep-link URL read and `StateScreen`'s `primaryLoading` prop went with the retry.
- `lib/recoveryDeepLink.ts`: `retryRecoveryExchange` deleted. The issue's first adjacent finding (the retry ran without `recoveryExchangePending`) no longer has code to apply to.
- `lib/recoveryVerifierContract.test.ts`: drives the real auth-js `AuthClient` through `resetPasswordForEmail`, then a failed exchange (a thrown network error, and a 503), and asserts the verifier is gone and a same-code retry classifies `wrong_device`. Named apart from #1202's `authEventContract.test.ts` so the two PRs don't collide.
- `docs/culprit-password-recovery-mockups.html`: section 2b, the shipped and proposed frames side by side (08d).

Mutation proof: with the verifier kept across a failure (storage refusing to delete it), both contract cases fail. With the screen change reverted, the new screen test fails.

## Reviews

- **code-reviewer: ship-ready.** No bugs. It traced the watchdog path. A late success still routes to the form, because the gate is armed and the success clears `recoveryScreen`. A late failure releases the gate in the handler's `finally`. A stall that never resolves leaves the persisted gate armed until a fresh link completes, which is true of "Back to log in" today as well.
- `guards/ownerFacingCopy.test.ts` passes on the new string. Read against `nyx-voice`: no exclamation mark, no dash, no blame, names why a new link is needed without the mechanism.
- Not clinical or statistical, so no adversarial pass. It removes an access path rather than adding one, and the remaining recovery ordering is untouched, so no fresh `rls-privacy-reviewer` pass.

## Found along the way

[CUL-1889](https://linear.app/projectnyx/issue/CUL-1889): two different reset links opened back to back. The loser's cleanup signs out the winner's fresh session. Self-DoS, not a leak. Split out of CUL-1888 into Backlog.

## Residual

- The spec (`docs/nyx-password-recovery-requirements.md`) never described the exchange `failed` state; its §5.6 is the request-failed state. Proposed as a Tier-2 edit, not written.
- No device run. The failed state is hard to reach on purpose; the QA script uses airplane mode at the moment of tapping the link.
