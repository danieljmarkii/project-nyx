# CUL-647 — the arrival moment's tap goes soft

**Date:** 2026-10-10

**Ruling.** The PM ruled (B) on CUL-647: the first-insight arrival plays a single soft impact, never the system Success notification.

**The premise correction that shaped the build.** The issue framed (B) as "soft whenever the lead finding names a symptom," which implied a predicate. Re-reading the finding union (`lib/signal.ts:643`) showed it has no false branch: safety findings and stood-down lines are gated out of the arrival upstream (`components/home/SignalZone.tsx:727`, CUL-786), and every remaining insight-class type carries `symptomType`, except `trial_response`, which counts vomiting episodes. `more_during_trial` is that finding's direction field, not a finding type. So the tap is soft unconditionally. The one reading that looks like good news (fewer episodes during the trial) is a reassuring read the app must not celebrate either.

**What shipped** (shipped via #1174):
- `lib/haptics.ts` — `insightArrival()` plays `impactAsync(Soft)`; its doc comment carries the reasoning above. It stays its own verb rather than calling `commitSymptom`, per the module's one-verb-per-moment rule (the `commitVisit` precedent).
- `lib/haptics.test.ts` — asserts the soft impact and that the notification API is never reached. Proven by mutation: restoring Success reds the test.
- `components/home/SignalZone.tsx` — two comments that described a "success" / "congratulatory" tap.

**Checks.** `tsc` clean; full jest 646 suites / 16,357 tests green.

**Tier-2 edit proposed, not written.** `docs/nyx-app-polish-requirements.md` §4 ("one soft success tap at 900ms") and the §5.6 shipped-state note ("the §4 arrival's success tap") should read "one soft tap (CUL-647)". Awaiting PM approval.
