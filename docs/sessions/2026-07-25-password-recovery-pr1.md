# Password recovery PR 1 — the foundations (B-280)

**Date:** 2026-07-25

PR 1 of the 5-PR track, built from `docs/nyx-password-recovery-requirements.md` §9. **No user-visible change** — `PASSWORD_RECOVERY_ENABLED` ships off and no screen or handler exists yet. Shipped via **#444**.

## What landed

- **`flowType: 'pkce'`** on the Supabase client (D1a). Behaviour-neutral today — the only other consumers are signup-confirmation links and unused magic links. Deliberately diverges from Supabase's documented RN example (implicit flow), which would cost a new dependency (`expo-auth-session`, to read the URL *fragment*) and put long-lived tokens in a URL on the one flow whose job is re-establishing trust. Implicit's cross-device benefit is unrealisable here anyway: the redirect is a custom scheme no desktop browser can open under either flow.
- **`lib/passwordRecovery.ts`** — pure by contract, carrying FR-4's *two* classifications (URL shape, exchange result), D7's cooldown machine, and `recoveryRedirectUrl()`.
- **The persisted FR-6 recovery gate** in `store/authStore.ts`, following the `justDeletedAccount` precedent.
- **`lib/recoveryMarker.ts`** — FR-12's request marker, doubling as FR-14's provenance signal.
- **FR-17 log redaction** widened in `lib/authDebug.ts`.
- **`PASSWORD_RECOVERY_ENABLED = false`** in `constants/flags.ts`.

## Decisions and findings worth carrying forward

**FR-4(b) ships three exchange outcomes, not the spec's four.** GoTrue returns one indistinguishable shape for expired, already-used *and* D8's resend-overwritten links; they render the identical screen (§10 rows 9/10/20 are specified byte-identical); and a type claiming to tell them apart invites copy asserting a cause the device cannot know — the exact error §5.5's title and §7.2.3's banner both exist to avoid. `wrong_device` and `failed` stay separate because those distinctions are real. `classifyExchangeOutcome` takes an optional `verifierPresent` so **PR 2 is correct whichever way §9.3-Q2 lands** — the locally-knowable fact wins over the error text.

**FR-17 needed a second guard, not just a wider regex.** The key-name regex only works if every future caller names its keys well, and the existing length guard cannot help at all: `nyx:///reset-password?code=` (27) + a 36-char code = **63**, under `MAX_DETAIL_STRING = 64`, stored verbatim in a log the diagnostics screen invites the owner to **Share**. So a narrow value-shape guard now catches a deep link under any key name. It is **scheme-agnostic** (any non-http(s) scheme) rather than matching `nyx://`, so B-278's rename needs no coordination here — a hardcoded literal would have failed *silently* after the rename.

**`parseRecoveryLink` is hand-rolled, not `new URL()`.** RN's URL polyfill has historically shipped without working `searchParams`, and a parser that behaves differently on device than in jest is worse than no parser. It also gained an `unrelated` verdict so a **widget deep link is not rendered as a broken reset** (§6.5's collision, since the shipped widget emits `nyx:///history?pet=…`).

**`loadPersistedRecoveryGate` returns `false` on a read failure.** A storage throw means the arming write almost certainly failed too, so `true` would be a guess with no evidence — and it would loop an owner who never touched recovery through set-password on every launch.

**Recorded in-comment for PR 2, found while wiring the wipe:** §6.4's `wipeLocalSession()` runs at step 5 (the pre-exchange `signOut`) **before** the exchange at step 6, and it now clears the FR-12 marker — so the pre-fill on a failure state must come from the value the handler already read at step 2 and holds in memory, **not** a re-read of disk. The wipe deliberately does **not** clear the gate, for the same reason `justDeletedAccount` is untouched there (§6.3).

**Open for §9.2's dashboard checklist:** `RECOVERY_PROVENANCE_WINDOW_MS` (24h) must stay ≥ the project's configured recovery-link lifetime, or a legitimate late tap on a still-valid link is refused. That lifetime is already an open PM read; this is a second reason to do it.

## Gates

`code-reviewer` → **ship-ready**, and its findings were closed in a follow-up commit: the link parser split the remainder on *every* `?`/`#` rather than the first of each, so `?redirect_to=nyx:///reset-password?code=evil` surfaced the inner code as though the outer link carried it (not independently exploitable — FR-14 and the exchange both still gate it — but this parser decides what a hostile deep link looks like, so it shouldn't be the weak link); route matching is now case-insensitive; the `releaseRecoveryGate` stale-disk residual is named in-comment; and **`lib/session.test.ts` is new**, locking the invariant that had no test — the wipe clears the marker but must not clear the gate.

`rls-privacy-reviewer` is the mandatory merge gate on **PR 2**, where the session swap and exchange actually happen. `clinical-guardrails` **N/A**, stated explicitly (§7): no pet-health inference, no n=1 read, no AI.

tsc clean; jest **1797 / 115 suites** (88 new cases).

## Merge note

`main` moved mid-session and #442 restructured `STATUS.md` — removing the `Last updated` line and the `Recent Sessions` list in favour of this directory. Resolved by taking main's side wholesale and re-homing this record here, which is the first session to be written under the new convention rather than migrated into it.
