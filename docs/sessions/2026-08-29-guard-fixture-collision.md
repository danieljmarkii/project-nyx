# CUL-712 — guard fixtures move out of the tree the guards scan

**Date:** 2026-08-29

Shipped via #PRNUM (draft). One PR, three guards refactored + one new shared
helper. No app code, no schema, no product surface.

## What this was

Three guards proved themselves the way CLAUDE.md § CUL-613 requires — point the
detector at a known-bad file and require it to go red. All three wrote that
fixture **inside the directory they scan** (`components/`, `app/`) and removed
it in `afterEach`. Jest runs suites in parallel workers, so each guard's fixture
was live inside its neighbours' scan window, and the guards failed each other
two ways: an **ENOENT crash** when the fixture was unlinked between the
directory walk and the read (hit for real during CUL-654, green on the identical
re-run), and a **spurious violation** when it was alive during the scan —
an intermittent red naming a file that no longer exists, pointing at a rule
nobody broke.

That matters more than an ordinary flake because CLAUDE.md § Git Workflow
forbids "fixing" a red run by weakening the check. An intermittent red whose
named file has vanished is exactly the pressure that gets a guard weakened or a
suite dropped — so the guards' own noise floor is load-bearing for the guards'
authority.

## What was built

`guards/fixtureRoot.ts` (new) — `createFixtureRoot()` / `writeFixture()` /
`removeFixtureRoot()`. The root is a `mkdtempSync` under the OS temp dir, and
the helper **throws if the path it is about to hand back lies inside the repo**.

The three guards thread a `root` through their scanners
(`walk` / `sourceFiles` / `parse` / `scanFile` / `matchMarkers` /
`callSites` / `derivedSafetySurfaces`) and their self-tests point it at that
temp root. The repo-level entry points pass `ROOT` explicitly.

`guards/fixtureRoot.test.ts` (new) — the helper's own proof.

## Three things worth keeping

**A helper, not an exclusion.** The obvious fix is one line per scanner ignoring
`__*_guard_fixture__*`. That is a denylist the *next* guard has to remember,
which is the shape that produced this: all three authors knew about `afterEach`
and none of them knew about the neighbour. A shared temp-root helper is the
positive affordance instead — the next guard reaches for the thing that already
exists, and its fixture cannot land in a scanned tree even if nobody reads the
comment. `guards/edgeFunctionDeploy.test.ts` is the in-repo precedent and has
never had this problem, because a scanner that can be pointed at a root never
has to trust its own working tree.

**The `root` parameter is required, never defaulted.** A default silently
re-points a forgetful self-test at the real working tree — the CUL-708 shape,
where silence is a claim. The caller answers and the compiler asks.

**An exemption marker is no protection from the guard next door.** Markers are
per-guard: `haptics-guard-ok:` means nothing to the Geist scan. So a fixture
deliberately exempted *for its owner* was fully exposed to its neighbour — the
reproduction below was a haptics fixture carrying its own valid marker, reported
by `geistRollout` as a live `<Text>` violation.

## Evidence

The issue's quoted repro line does not reproduce against today's fixture
contents (none of the three haptics fixtures contains a `<Text>`); the exposure
is structural and one edit away. Adding a `<Text>` to a fixture for a guard
whose entire scan domain is `components/*.tsx` is a realistic edit, and it goes
red deterministically:

```
+ "components/__haptics_guard_fixture__.tsx:4 — <Text>; use ThemedText, or add a // geist-ok: <reason> above it"
```

The crash half needs no content at all — any foreign fixture in scope will do —
and is what was actually observed.

**The fix proven by observation, not inspection.** A poller watched `app/` and
`components/` for files appearing while all nine guard suites ran in parallel:

| tree | files that appeared |
|---|---|
| pre-fix | `app/__completion_card_guard_fixture__.tsx`, `components/__geist_guard_fixture__.tsx`, `components/__haptics_guard_fixture__.tsx` |
| post-fix | none |

Both runs *passed* — which is the point. The collision is intermittent, so a
green run has never been evidence either way; the fixtures being absent from the
tree is.

**The helper proven by mutation.** Deleting the containment check reds exactly
`THROWS rather than hand back a root inside the repository`; dropping the path
separator from `isInsideRepo` (so a sibling `…/project-nyx-scratch` reads as
in-repo) reds exactly `does not mistake a SIBLING directory for a child`. One
mutation, one red test, each time.

**The live scans proven un-narrowed.** The real risk in threading a `root` is
that a scanner quietly ends up pointed somewhere emptier — which would leave all
three guards green over real defects, the worst possible outcome for this
change. A single probe component carrying one violation per guard was dropped
into `components/` and all three fired on it:

```
components/__cul712_probe__.tsx:1 — import { commitRoutine } from '../lib/haptics';
components/__cul712_probe__.tsx   — a meal without its card loses the WSAVA intake row…
components/__cul712_probe__.tsx:7 — <Text>; use ThemedText, or add a // geist-ok: …
```

The self-tests are refactor-safety tests, not guards, so they were required to
land on the other side: green before *and* after, at unchanged counts
(geist 28, completionCard 12, haptics 6 — 3 of haptics' 6 are its detector).

## One API call worth naming

`createFixtureRoot(prefix, subdirs, baseDir = os.tmpdir())`. The third parameter
exists so the containment branch can be driven with a **real** in-repo base
rather than a mocked `os.tmpdir()` — `process.env.TMPDIR` cannot do it (jest
hands each suite a copy of `process.env`, while `os.tmpdir()` reads the real
environ through libuv), and `jest.spyOn(os, 'tmpdir')` reaches the test's
namespace object but not the helper's. Driving the real `mkdtempSync` and
requiring the throw is a stronger proof than either mock would have been.

## Not done here

The fixtures also keep their `components/` / `app/` **shape** inside the temp
root, so the self-tests still exercise the same walk → filter → read path as the
live scan rather than side-stepping it with a loose file. No guard outside these
three writes a fixture at all (`ownerFacingCopy`, `symptomLists`, `reversePath`,
`loggedDayParity` are read-only; `edgeFunctionDeploy` was already correct).
