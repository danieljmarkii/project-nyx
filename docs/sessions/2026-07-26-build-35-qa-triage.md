# Build 35 TestFlight QA — triage + the protein commit-on-save fix

**Date:** 2026-07-26

## Build history established

Pulled from the Apple TestFlight notifications (the repo records build numbers only
indirectly; EAS/App Store Connect is the authority):

| Build | Version | Available to test |
|---|---|---|
| 35 | 1.1.0 (35) | 2026-07-25 14:21 CDT — iOS 16.4+, iPhone-only |
| 34 | 1.0.0 (34) | 2026-07-18 18:33 CDT — iOS 15.1+, universal |

Build 35 is the first native binary since the SDK 54 → 57 upgrade, the first carrying
the widget + App Group entitlement, the first iPhone-only, and the first cut with
email confirmation live. Delta = ~20 code PRs over seven days. A full block-by-block
QA script for it was produced in-session.

## The QA pass, and what it found

**Block D — a real defect, and the visible half was the smaller half.**

The PM typed `Buffalo` into the main protein's "Other" escape and it saved as
`buffalo`, not `bison` — D9's normalization never ran. Root cause: the commit fires
on the field's `onBlur`/`onSubmitEditing`, but both host screens
(`app/food/[id].tsx`, `app/food-capture.tsx`) wrap the form in a ScrollView with
`keyboardShouldPersistTaps="handled"`, and under that setting a tap on a touchable —
a chip, or **Save** — does not dismiss the keyboard. No blur, no commit; `handleSave`
then persisted the raw draft.

The half nobody saw: `handleMainChange` only demotes the outgoing main on a
`'select'`/`'commit'`, because `'typing'` is explicitly a draft. So an uncommitted
draft that replaced an existing main **dropped that protein entirely** — silent loss
of a captured exposure, which is the exact failure auto-demote exists to prevent.
`chicken` → type `buffalo` → Save saved `{main: 'buffalo', alsoContains: []}`.

And it is permanent: on re-entry `otherDirty` is false, so D3a's no-warrant rule
(correctly) refuses to re-key a value the owner did not type in this session.

**Why 1930 green tests missed it:** every commit test calls
`fireEvent(field, 'blur')` directly. The suite tested the commit *handler*; nothing
tested that a real Save ever reaches it. Same shape as slice 5's `lib/protein.ts:202`
lesson — a rule that only holds when someone remembers to trigger it.

## What shipped

`ProteinPicker` and `ProteinSetPicker` gained an imperative `commitPending()`
(`forwardRef` + `useImperativeHandle`, no dep array so the handle never closes over a
stale draft), and both hosts call it at the top of their save handler and save the
returned set rather than their own state — a `setState` is not visible to the handler
that scheduled it, so the resolver **returns** the value instead of only emitting it.

The demote math moved into one `applyDesignation` shared by the event path and the
save path, so the two cannot drift. The `otherDirty` warrant still gates the whole
thing, so the imperative path inherits D3a rather than bypassing it — covered by a
test asserting a seeded `ocean whitefish` main survives a Save untouched.

Five new tests, all driven through a host shaped like the real one (Save button, no
blur). Four of them fail against the old code.

`tsc` clean · 119 suites / **1935** jest.

## Edge functions — nothing broken, three behind

The PM suspected they had "fubar'd some edge functions". They had not: all ten are
`ACTIVE`, none in an error state. Three were simply behind `main`:

| Function | Deployed | Behind by |
|---|---|---|
| `generate-report` | v13 · Jul 18 | #448 (protein render) |
| `generate-signal` | v25 · Jul 18 | #448 — **no-op for this function**, see below |
| `ask` | v4 · Jul 19 | #449 (day-counter timezone fix) |

This also answers Block F: the vet report renders **server-side**, so Appendix B was
never going to appear from a client build. It needs the deploy, not a new binary.

`generate-signal`'s only change in #448 is additive re-exports in `protein.ts`
consumed by `generate-report` — nothing in `generate-signal` calls them, so its
deploy is unnecessary rather than merely deferred.

**The deploys did not happen, and the reason is worth recording.** `deploy_edge_function`
takes the bundle as an inline tool parameter, so the agent has to reproduce the whole
artifact byte-for-byte. `generate-report` minifies to **188 KB on a single
87,048-character line**. Reproducing that reliably is not something to bet a live
vet-report function on — a corrupted deploy takes the report down until it is
rebuilt, and the sha256 read-back catches it only *after* the overwrite. The bundles
are built and verified (`node --check` clean); it is purely the transfer that is
unsafe at this size, and `generate-report` only grows. Filed as **B-485**: provision
a Supabase access token as a cloud-env secret so `npx supabase functions deploy`
uploads from disk and the agent never handles the bytes — the runbook's own §Security
already names this as the escape hatch. Until then, large functions deploy via the
dashboard paste.

**Environment finding:** `esm.sh` is blocked by this session's network policy
(gateway 403 on CONNECT), so `deno test` and `deno cache` cannot run in-container.
`scripts/deploy-edge.sh` still bundles fine — esbuild marks `https://*` external — but
its verification step must be skipped with `--no-test`. Both PRs passed those suites
in CI under the required-check gate. Worth knowing before the next backend session
assumes the runbook's verify step is available.

## Filed, not fixed

**B-481** widget unusable on-device (needs its own session with the device; establish
which of the nine states renders before touching code) · **B-482** Landing Signal
pulse redesign (PM: "absolute trash"; a Designer session against the brand spec, not
a tweak) · **B-483** confirm-email lands on a localhost URL (Supabase Site URL still
the default; one dashboard field, then B-432 for the deep-link version) · **B-484**
delete the leftover `zz-deploy-probe` function.

Blocks A, C (functionality) and E passed. E: "LOVE these filters."

## The deploy path got fixed, not just documented

The PM ran `scripts/deploy-edge.sh generate-report` and read its "Deploy
(recommended…)" output as a receipt. It is not — the script's own header says *it
does not deploy*, and `list_edge_functions` confirmed `generate-report` still at
**v13**, `updated_at` untouched since Jul 18. Two useful things did come out of that
run: the bundle's sha256 was **byte-identical** to the one built here (reproducible
build), and their 218 Deno tests passed — the verification this container cannot run.

So the gap closed properly: **`scripts/deploy-edge.sh <name> --deploy`** now does
test → bundle → syntax-gate → sha256 → upload in one command.

It stages the self-contained bundle into a throwaway project and points the CLI
there (`--workdir`, `--use-api`) rather than running `supabase functions deploy`
against `supabase/functions/`. A plain deploy re-bundles from source, which returns
us to the mercy of how the CLI walks imports that escape the function directory
(`../../../lib/protein.ts`, `../generate-signal/detection.ts`); handing it one
self-contained file means there is no module graph to get wrong, and what ships is
byte-identical to what `node --check` validated. `--use-api` bundles server-side, so
no Docker daemon is needed in a Codespace.

`verify_jwt` is the trap and is called out in code: the CLI defaults it **on**, which
is right for every function here except **`view-report`** — deploying that one
without `--no-verify-jwt` would start rejecting the unauthenticated share-link reads
it exists to serve.

**Verified:** syntax, help text, and the missing-token guard (fails with actionable
instructions). **Not verified:** the upload itself — there is no token in this
environment, so its first real run is its verification. The runbook now leads with
this command and demotes the MCP call to the small-function fallback, with the size
ceiling stated.

## Two things the PM should know about the merge

**Backlog IDs collided.** This session filed B-451–B-455; while it ran, sibling
sessions claimed B-451–B-480 on `main`. The rows were renumbered to **B-481–B-485**
at merge. Earlier commit messages and PR #462's body still name the original
numbers — the backlog file is the authority.

**`#459` deleted the B-411 row** (ambiguous label terms — `poultry`, `chicken fat`)
rather than closing it `Done`, which the backlog's own convention forbids. Not
restored here, because reversing another session's deliberate edit from inside a
merge is how records get quietly rewritten twice. Flagged for the PM to rule on: it
is either an absorption into B-351 that should have been recorded as one, or an
accidental drop during that session's own conflict resolution.

— shipped via #462
