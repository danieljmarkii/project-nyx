# Engineering lessons — the seed set

**Status:** 🌱 living. Seeded from a predecessor project's `docs/engineering-lessons.md` (44 conventions, 12 spec rulings, 14 process notes, June–September 2026), distilled to what transfers across domains. Every law below was paid for by a real defect, not written from theory.

**How this file works.** CLAUDE.md § Code Conventions carries each adopted rule in a few lines plus its enforcement (the guard, the marker, the file). This file carries the account behind it. When this project earns its own lesson, add it here under a new `E-N` heading (E for engineering; the Tier A/B/C numbers below are the inherited set) (the incident, the measurement, the law) and put the one-paragraph rule in CLAUDE.md, paid for by a deletion there.

**Numbering hazard.** Two branches can both mint `E-12` and git will merge them cleanly. Before adding a number, fetch `origin/main` and take the next free one; a clean merge is not evidence.

---

## Tier A — universal laws

### Honesty of numbers and claims
1. **A completeness figure beside a partial list is a claim about the list. Show only the gap, and nothing when there is none.** "42 of 42 days logged" beside a list that omits whole categories reads as "the record is complete".
2. **The window may only index; only the total may be spoken; keep them in separate variables.** A number labelling a link counts what the destination holds. ("12 readings" came from a query capped at 12 when the record held 20.)
3. **Two counts over one population must partition it.** Decide the winning reason in ONE shared function every surface switches on, so inverting it reds every surface's test at once.
4. **Precedence is honest only when the losing reason is the misleading one.** Precedence deletes the loser, so the winner must be true.
5. **Any field that decides a grouped row's stated reason joins the group key.** "First member wins" over sorted input has a direction.
6. **Fixing one branch of a two-branch surface? Check the sibling, and fix the harmful branch first.** Repairs drift toward the reassuring path.
7. **Where the data cannot settle a question, the output must not answer it.** Say only what holds in every case.
8. **A number and the rule about when it may be shown are one thing; move them together.** A ratio legal only for completed items leaked onto a surface that printed "30 of 28".
9. **A qualifier is true only of the population it was counted over; a sentence mixing scopes names each.** The tell: if you reached outside the window for a number, did you also reach for the damaging one?
10. **A record-anchored date is free; a duration is guarded.** A duration inherits the statistical floors of what produced it, or is disclosed beside that span. Stamp years once per band of dates, never per date.
11. **A summary never drops a member.** It accounts for everything or names no subset.
12. **A catch-all that names one member lies about the others; return the reason, not "empty".**
13. **A threshold may hide a claim; it never hides the caveat that limits the claim.**
14. **A staleness cutoff bounds belief (and at most one denominator), never evidence.** Test: a bound is an evidence bound if dropping a row changes what the output says.
15. **Ask who writes each side of a date comparison.** The time a user tapped "End" is not the time the thing ended.

### Provenance, defaults, intent
16. **A value the system filled in is the system's claim; record its source.** "The user did nothing" and "the user did something" are different answers. A stale default is re-derived on re-entry, never silently re-stamped at save.
17. **A parameter may be optional only if it is independent of what the call always writes;** otherwise it is required with no runtime fallback.
18. **A default on a privacy decision is that decision, made silently.** Make it required, first in the signature.
19. **A value returned before its write lands is an INTENT and is named so** (`intendedX`). Test the refused case, not only the happy path.
20. **A copied constant inherits the other module's QUESTION, not just its value.** Same value, different question → two constants, each with its derivation.
21. **A screen about one record names that record's owner, never "the current selection".** The fallback only ever fires when it is wrong.

### Reads, empty states, concurrency
22. **A read that has not answered is not an empty record.** Loading, failed, answered-empty are three states; pair `loading` with `loaded`. Watch every door where absent and empty merge (`maybeSingle()`, `.find()`, `[0]`, `?? []`).
23. **Before reusing a hydration-dependent value, ask what its `null` costs THIS caller.** Late by a frame is free to a renderer and unrecoverable to a one-shot destructive action.
24. **The newest request wins, and every answer is stamped with whom it was for.** An "already loading, return" guard drops the newer request.
25. **A confirmation that awaits a read can be triggered twice;** take the guard (a ref) before the await.
26. **Adding a second data source to a surface? Re-read every flag that describes "the surface".**

### Safety nets and side effects
27. **Every destructive action gets exactly one safety net: a confirm before, or an undo after.** The confirm names the irreplaceable thing.
28. **Every reversal routes through one shared function,** so a side effect added to a write path is inherited by every delete surface.
29. **Two writers feed one cached copy? A delete undoes only the write its own record made.**
30. **Cosmetic effects are fire-and-forget; never await them on a write's critical path.**
31. **When a fix makes a hidden state visible, follow the control the widening exposes.**

### Structure and claims in prose
32. **A comment asserting that A reaches B is backed by a test or deleted.** A comment writing a cheque the code does not cash is worse than none.
33. **A shared module's boundary is whatever imports it, not its name.** One string in `utils.ts` redeployed three server functions.
34. **Trigger on the fact, never on the presentation.** Two states that render identically are not the same state.
35. **Before keying a collection by name, ask whether the source can carry the name twice.**
36. **A record of an action is written by the thing that did it, in the same run.** A record written by a later human step drifts.
37. **Two local fixes plus a missed third instance is a class; turn it into a guard.** Knowledge in a comment cannot find the other sites.

### Time
38. **Never compare timestamps as text; parse both sides.** `…00.000Z` and `…00+00:00` are one instant, `+` sorts before `.`, and the rows exactly on the boundary are the ones dropped.
39. **Build day fixtures from local components, step whole calendar days, and prove clock fixes under a skewed clock,** never by re-running today. A date-pinned fixture inside a rolling window fails on a calendar day, not a change. Run the suite under extreme timezones in CI (±14h, a quarter-hour offset).

### Process
40. **Stop patching when findings don't converge** (3 → 6 → 6, each round caused by the last fix). Deletions hold; additions don't. Close one seam, re-attack.
41. **Verify a premised surface at file:line before building on it.** One wrong premise invalidated four rules at once.
42. **Measure a structural hypothesis before filing it.**
43. **A statistical or safety rewrite of user-facing copy re-enters the voice review.** Length caps eat the "why" first.
44. **A claim needs an owner.** Status says someone started; the branch in a claim comment says who.
45. **Working-state files must net out.** Every addition is paid for by a deletion, enforced by a ratchet whose ceiling is never raised to go green.
46. **A shared counter in a document is a merge hazard git cannot see.**
47. **A rule is a floor with a date on it.** When something better violates it, raise a better-than-the-rule brief. Neither comply quietly nor deviate quietly.

---

## Tier B — stack-conditional

### Client + database + sync
1. **A sync push marks the VERSION it sent, not the row** (`WHERE id = ? AND updated_at IS ?`, null-safe). Every re-queueing mutation moves `updated_at`, enforced by a scan.
2. **Drain each queue one at a time with a bounded wait.** A caller mid-run gets one trailing run; past the ceiling it runs anyway, degrading to the old behaviour rather than a new failure. Judge a lock by where it falls back to.
3. **A moved write path does not inherit the old path's checks.** Enumerate what the old one checked. An `UPDATE` matching nothing returns `{changes: 0}` silently. Warning sign: a control over rows read from one store that writes to another.
4. **Earn completeness from a count, never from a short page.** Page by rows received, sort on a total key (`time DESC, id DESC`), trust `count: exact`. A server row cap with no `ORDER BY` keeps the OLDEST rows.
5. **Before shipping a rule keyed on a field, list every path that writes that field** and check each reaches the in-memory store, not only the database.
6. **A client that never checks a write's returned error marks failures as success.** Libraries that return errors instead of throwing make this the default.

### Postgres / row-level security
7. **A DEFINER trigger's error message never carries a value read from another row.** It runs before RLS; one message for "missing" and "out of bounds"; prove with a probe from a zero-ownership identity.
8. **A guard on the child row is not the invariant; ask what else can move.** Validate on change (`IS DISTINCT FROM OLD`) so violating rows stay repairable, never bricked. Assert the invariant over rows at rest inside the migration.
9. **Elevated-key queries scope the subject by id PAIRED with its owner, written once** (a CTE). Zero rows is ambiguous. Scoping the subject does not scope the joins.
10. **Rehearse a migration against a stub of exactly the surface it touches,** in a transaction, as the real roles, then roll back. `REVOKE` on DEFINER functions is the step people forget.

### Feature flags
11. **"Flag-off is byte-identical" means equal to the code's ABSENCE.** An on/off diff is green on an ungated leak; a golden snapshot's repair (`-u`) approves the leak. Keep the feature's rendering in one namespace so it can be stubbed. Eligibility and opt-in are two gates. A beta that costs server money is gated server-side too.

### React / React Native
12. **Consume a one-shot request in a ref cleared before the side effect;** state carries only a tick. Count calls: `toHaveBeenCalledWith` cannot see an identical second fire.
13. **A value correct one commit late is wrong for anything that acts on mount.** Read settings once before first render; unknown reads as the safe value.
14. **Never present a Modal from inside a Modal;** split into panel + thin wrapper.
15. **`disabled` is an accessibility claim** ("dimmed"). Where no control exists in a state, render a plain accessible `View`.
16. **Truncated text is still read in full;** a label added to rescue truncation is a placebo.
17. **`accessibilityLiveRegion` is Android-only;** pair it with an iOS announcement.
18. **Adjacent touch targets need a gap ≥ the sum of their facing hit-slops;** a wrapping row creates new neighbours.
19. **Contrast depends on the ground, which grep cannot see;** decide per site and test both halves.
20. **A rule whose effect lands at the tail of a virtualized list is asserted over data in a pure module,** never through the rendered tree.

---

## Tier C — how to prove a check works (the crown jewels)

### Proving a guard
1. **A guard that has only ever been green has not been tested.** Run it against the pre-fix tree first.
2. **Prove it by mutation, not by reading it.** Break the protected source one defect at a time and watch it red.
3. **Decide the test's direction first.** A guard reds before the fix and greens after; a refactor-safety test is green both times. Run both against the old tree.
4. **Check the mutant:** unreachable or behaviour-neutral mutations test nothing; a mutation that failed to apply reads exactly like a proof (check the file changed); a type-error mutation never ran; "equivalent mutant" must be argued over the whole input space.
5. **A surviving mutant is the only thing separating a test from a test-shaped comment.**

### Non-vacuity floors
6. **Any guard whose verdict is equality over two things first asserts both are non-empty.** A normalizer once collapsed every tree to `{element: 'View'}` and eight tests stayed green.
7. **A floor derived from the thing it checks cannot catch that thing's removal.** Derive the expected set from the REPOSITORY, not from the constant under test.
8. **"At least one found" is not a floor;** anchor it to the specific item that must be there.
9. **When the population does not exist yet, invert the floor:** assert EXACTLY ZERO call sites and name the issue that lands the first (`firstCallerLands`). The first caller reds the guard and forces the handler in with it.

### Registries and exemptions
10. **A discovery guard's registry is an EXEMPTION.** Registered files are skipped. Never register a file to record that you thought about it; ask what stops being checked.
11. **A registry entry describes what the guard checks, never what you intend the file to do.**
12. **Exemptions are inline markers, `// <guard>-ok: <reason>`, reason mandatory, within N lines above the site, one per site,** never per file.
13. **An exemption you apply 26 times is a scope error.** Scope a detector by running it first.
14. **Pay for an exemption with a gate plus a test;** never move the call into an unscanned file.

### Scanning mechanics
15. **Blank comments and strings before scanning, line-preservingly, in ONE left-to-right pass.** Chained `.replace()` passes read each other's delimiters and swallow violations. An AST is better still.
16. **A pattern containing `.*` is not a guard.** Slice the object under test and anchor the match; bound an extractor at the statement boundary, never a character count.
17. **Detector fixtures live OUTSIDE the scanned tree** (a fixture-root helper with a REQUIRED `root` parameter; teardown checks provenance as well as containment). Prove the live scan by dropping a real violation into the real tree.
18. **A scan set tracks where the words are, not where the behaviour went.** Extracting code out of a scanned file owes an always-scanned entry, proven by mutation.
19. **Match the shape of the effect, not a bare string,** and state the detector's exclusions as tests.
20. **By-effect guards run over the computed import closure with an allow-set per file AND per helper,** never a boolean.

### Tests that measure nothing
21. **A test that re-derives the production rule is a tautology with fixtures.** Drive the real function; derive fixture boundaries from the shipped constant. (Deleting a production bound left 7,576 of 7,577 tests green.)
22. **Assert a premise separately,** so the day the runtime removes the hazard, the premise fails instead of the suite silently greening.
23. **A fixture that cannot exist in production is green over nothing.** Ask from the defect's side: which shape would this bug need, and is it in the suite?
24. **A mock standing in for a pure function uses the real implementation.** Stub the read, never the rule.
25. **A mock narrower than its API makes the missing half untestable.**
26. **A negative assertion proves a gate only if the gated thing was available to leak.** Seed the unsafe side; assert the read was never issued.
27. **A harness that behaves too well reproduces only the happy path.** Hold async reads open across the interaction.
28. **A test that counts work done cannot see a caller that failed to wait;** count at the moment the next caller arrives.
29. **Assert the rendered result, never tokens restated in the test.** Pin both halves: the fix passes and the thing it replaced fails.
30. **A type asserts nothing a test can read;** keep a runtime array the type derives from.
31. **Replay a captured statement against a real row** whose columns can be told apart.
32. **A property test over a construction monotone by design cannot fail.**
33. **A CI job named for a hazard is not coverage of it;** check the code under test consults the variable the job varies.

### Review discipline
34. **State a guard's blind spots in the guard file.** An undocumented blind spot reads as coverage. Never write a mutation proof into a comment you have not run.
35. **A completeness check is falsified by someone who did not design it.** On safety logic, re-run the falsification after every correction.
36. **A review subagent shares your working tree.** Tell it to `cp -r` before mutating; snapshot first.
37. **A guard whose repair approves the bug is not a guard.** Green on the bug and red on the fix → delete it.

---

## Deliberately not carried over (domain-only)
The predecessor's clinical invariants in their literal form (their general shape is Tier A and the `ai-output-guardrails` skill); product-specific spec rulings; its home-screen write-class rule (the by-effect guard mechanism is kept, Tier C 20); its haptic vocabulary; its font rollout and colour tokens; its widget runtime constraint; its mobile build/runtime commands; its mock-publishing specifics (the portable form is `docs/templates/mock-round-protocol.md`).
