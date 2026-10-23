# AI consent PR 3a: the permission sheet, the doors, Settings → AI reading

**Date:** 2026-10-12
**One thing:** S5 L2 — Device-local state and the sign-out wipe: a cache is a copy of someone's answer, so it belongs to one account and leaves with them · check: pending

Row PR-13 of *App Store 1.2.0 · the first public release* (Wave 2, AI consent), CUL-1834. Shipped via #1208.

## What shipped

The app side of App Review 5.1.2(i) consent, part one, built verbatim from mock round 4 (the PM approved round 4 and the plan in this session, after synthetic panel 1 and the D18 policy sentence had cleared the row's gates).

- **The write path** (`lib/aiConsent.ts`): remote first, never the sync queue. A yes inserts its `legal_acceptances` row (`ai_consent`, copy version `2026-10-12`) before the `ai_consent` upsert, so a yes the gate acts on always has its evidence; `23505` reads as already recorded. Reads name their columns. `source` is typed to `'backstop' | 'settings'`, and a test reads migration 100's CHECK so the client can never send a value the table refuses.
- **The cache** (`store/aiConsentStore.ts`): keyed by user id, a response that lands after the account changed is dropped, a read that started before a saved write never puts the older answer back, and `wipeLocalSession` resets it (registered WIPED in the store classification).
- **The sheet** (`components/consent/AiConsentSheet.tsx`): frames A and C as one panel plus a thin Modal; *What's sent* (frame B) swaps in place (C-14).
- **The doors** (`hooks/useAiConsentDoor.ts`): before the food and medication picker, camera and library alike, and on Ask's first open. Not now writes nothing. A no already on file routes to the typed form or keeps Ask closed. A failed or stalled read (4s) proceeds and leaves the decision to the server gate.
- **Settings → AI reading** (`app/settings/ai-reading.tsx`, frames I to L): the hub row reads On / Off / Not set once a read answers; the switch writes every flip with no confirm; Allow and Don't allow while unanswered; "On since" from the server's `decided_at`; Ask named where it is on.

## Reviews and what they changed

- **rls-privacy-reviewer: HOLDS WITH FIXES.** It replayed migration 100 on a scratch PG16 cluster with Supabase's roles: the upsert under the column grants, a cross-account upsert (42501), `select *` on the history (42501), a bad `source` (23514). All held. **F1** was real: a recorded no returned `proceed` at a door, and until PR-17 lifts the six holds the deployed functions don't read `ai_consent`, so a later photo would have reached Anthropic. Fixed: a no on file is honoured on the phone too. F2 (food detail's Re-run extraction has no door) is CUL-1905; F3 (a copy version bump never re-asks) is CUL-1906.
- **adversarial-reviewer: HOLDS.** A declined owner logging two photoless vomits in four hours still reaches `worth_a_call` (the server's contextual flags run before its photo-only gate); a photographed vomit under a no still writes the escalation; a cat that stops eating still raises the Signal (only phrasing is gated); first-time Not now at Ask returns to Home, whose Signal is the same source as Ask's safety lead. No client-side skip of a read call was added.
- **code-reviewer:** a double tap orphaning a door, a stale focus read overwriting a fresh Settings write, a thrown write leaving buttons disabled, links under 44pt. All fixed with tests.
- Writing the Settings tests caught two bugs of my own before review: the Off disclosure lowercased "Culprit", and a currently-on owner whose history read failed lost the "Reads that already ran" line.

## Decisions (team calls, logged on CUL-1834, reversible)

A multi-pet account gets the mock's "your pet" fallback; Settings names Ask with frame C's own words and adds "Ask stays closed." where Ask is on; the sheet's picture is an icon tile. The Dr. Chen vet-line option belongs to PR-14's record card; its default is (a).

## Residuals

- PR-17 must land before owners get this build: until then an unanswered owner whose read fails still reaches the ungated functions. Already in the run order (D12).
- Device check rides the TestFlight cut's sitting.

## The one thing

The consent answer cached on the phone is a copy of one owner's answer to a privacy question. On a shared phone the next person must neither be shown it nor be spared a question by it, so the cache carries the account it was read for, drops anything that arrives after the account changed, and is cleared in the sign-out wipe like every other place account data rests. The registry test in `lib/session.test.ts` fails the build if a new store under `store/` is not classified, which is how this one was caught the moment it was added.
