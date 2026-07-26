# B-301 — remove the temporary auth-diagnostic scaffolding

**Date:** 2026-07-26

Reverted #327's auth-probe instrumentation now that its gate is met: the PM confirmed on-device that build 34 holds a session across a locked-phone refresh. The probe did its job — the build-33 trail pinned the frequent-logout bug on an iOS keychain `errSecInteractionNotAllowed` during a locked-device background refresh, and the real fix (`AFTER_FIRST_UNLOCK`) shipped in #350. With the fix confirmed, the scaffolding is dead weight in the auth hot path.

## What was removed

- `lib/authDebug.ts` and `lib/authDebug.test.ts` — the breadcrumb ring, the redaction guards, the AsyncStorage writer.
- `app/settings/diagnostics.tsx` — the hidden viewer, plus its `<Stack.Screen name="settings/diagnostics" />` registration in `app/_layout.tsx` and the version-foot `Pressable` long-press in `app/settings.tsx` (the version string stays, now a bare `Text`).
- Every `logAuth` call site: 9 in `lib/secureStore.ts`, 1 in `lib/supabase.ts`, 3 in `app/_layout.tsx`.

## Two things the removal surfaced that a literal file-revert would have missed

**`keyKind` was orphaned, not shared.** `lib/secureStore.ts` exported `keyKind()` — the classifier that told a genuine session removal apart from the benign per-`_saveSession` PKCE `-code-verifier` clear. Its only callers were the three `logAuth` calls in that same file, so it went too, along with its `describe` block in `secureStore.test.ts`. Same for `writeToTier`'s `wroteUpTo` counter and `removeItem`'s `hadPtr` (and the `readPointer` call that computed it): all three existed solely to populate a breadcrumb detail. Removing the breadcrumbs left `writeToTier`'s `try/catch` doing nothing but log-and-rethrow, so the block came out and the throw now propagates directly to `setItem`'s tier-fallback loop — same semantics, one less layer.

**Three comments justified a real architectural split by pointing at the probe.** `lib/secureStoreTiers.ts` exists because Metro bundles whole modules and the widget extension must not inherit the app-only graph — but its header, `lib/widgetSession.ts`'s import note, and the `FORBIDDEN` entry in `lib/widgetBundleImports.test.ts` all explained the split as *"secureStore drags authDebug/AsyncStorage."* With `authDebug` gone that rationale reads as stale, and a future session could reasonably have concluded the split was now pointless and collapsed it. The split is still correct — `secureStore.ts` carries the chunking/generation/retention logic and a `react-native` `Platform` import, none of which belongs in the extension — so the three comments were rewritten to say *that* instead. `./authDebug` was dropped from `FORBIDDEN`; `./secureStore` stays, with the corrected reason.

## The AsyncStorage purge needed its own home

`__culprit_auth_debug_v1` was written deliberately *outside* `wipeLocalSession` so the trail would survive the `SIGNED_OUT` teardown it existed to investigate. That choice means deleting the writer strands the key: an owner who never signs out would carry up to 500 breadcrumbs for the life of the install, with nothing left on the device that would ever reclaim them.

So the purge runs at **startup**, unconditionally, not on sign-out — new `lib/retiredStorage.ts`, fire-and-forget from `app/_layout.tsx`'s launch effect. It is deliberately *not* folded into `wipeLocalSession`: that function answers "whose data is this?", and this answers "does anything still write this?" — different questions, and conflating them would put a key that has no account semantics into the sign-out contract. The module keeps a `RETIRED_KEYS` list so the next retired probe has an obvious home. Five tests cover it (removal, exact key spelling, live keys untouched, idempotence, never-throws-on-store-failure).

## Verification

- `tsc --noEmit` — clean.
- `npx jest --ci` — **133 suites / 2327 tests** on the branch alone; **135 / 2482** after merging `main` at wrap (three sibling PRs landed mid-session), all passing.
- CI green on both jobs (`App (typecheck + jest)`, `Edge Functions (deno test)`) on the merged head.
- No `authDebug` / `logAuth` / `keyKind` / `settings/diagnostics` / `__culprit_auth_debug_v1` references remain outside `lib/retiredStorage.ts`, which names the key on purpose.

## DoD

- **AC:** B-301 is a backlog cleanup item, not a `technical-spec.md` build step — no step AC applies. The row's own four clauses (delete the module + test, drop the breadcrumbs, drop the route + long-press, purge the key) are each satisfied; the row is marked `Done — 2026-07-26`.
- **Anti-patterns:** none introduced. No theme-token, schema, RLS, or sync surface touched; no migration.
- **Types / tests:** pass (above). `lib/retiredStorage.ts` is a new shared `lib/` utility, so it ships with tests per the DoD.
- **Secrets Register:** unchanged — no secret added or referenced.
- **Personas:** Engineer ✓ (dead-code removal is behavior-preserving; the three stale split rationales rewritten rather than left to rot) — Trust & Safety ✓ (a diagnostic log the owner could Share is off the device, and the retired key is actively reclaimed rather than abandoned) — Designer ✓ (the "You" screen loses a hidden non-feature; the version string is unchanged) — Data N/A — Dr. Chen N/A — QA ✓ (full suite green).
- **Adversarial review:** N/A — no clinical or statistical logic touched. The auth path is load-bearing but the change is a pure instrumentation strip; the `writeToTier` control-flow simplification is covered by the existing `secureStore.test.ts` suite (torn reads, tier fallback, commit atomicity, sign-out clearing), which passes unchanged.
- **Future-self review:** `lib/retiredStorage.ts` is the one new pattern. Worth keeping in 12 months — retiring a storage key is a recurring need and the alternative (an inline `removeItem` in the launch effect) is untestable and has no obvious home for the next one. The named risk is the list growing unboundedly; each entry costs one key in a single `multiRemove`, so the honest prune trigger is "the writing code is far enough in the past that no live install can still hold the key," not a size limit.

## Shipped via #477
