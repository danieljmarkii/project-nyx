# Vet visits VV-2 — the Pet-tab card, the list, the empty state, booking, the visit read-only

**Date:** 2026-09-11
**Issue:** CUL-900 (Vet visits — the appointment companion, milestone **B — the home**)
**Outcome:** shipped via #833
**Mode:** BUILD

---

## What shipped

The companion's first **owner-visible** surface. VV-0 seeded the flag and VV-1 built the substrate; this is the first PR an allowlisted owner can see, and it is the home VV-4 and VV-5 both open from.

**`components/vetvisits/`** — the namespace the AC 0 harness stubs: the Pet-tab card (mock A1, incl. its zero state), the appointment block, the past-visit row with its derived plan tags, the empty state (E2), the booking sheet (E3) and the visit body (D3 without ⋯).

**`app/vet-visits/index.tsx` + `[id].tsx`** — the list and one visit. They hold the *gate* and delegate the *drawing*, which is the convention VV-0 set and this PR is the first to exercise.

**`lib/vetVisits.ts`** — the model: the reads, the two local-first writes, the derived tags, the hand-parsed date helpers. It lives outside the namespace because the harness stubs every namespace export into a null-rendering component, so a helper there would be silently wrapped.

Three *decide on the fly* items taken at the issue's defaults: "Add" asks happened-or-booked first · time optional · the card between Vet report and Vet Files.

---

## Two calls the issue did not cover

**How "time optional" is stored.** VV-1 handed the mechanism here explicitly (066's header: *"VV-2 stores a chosen hour or a sensible default"*), and `scheduled_at` is `TIMESTAMPTZ NOT NULL`. It is **local midnight** — the stored instant's local calendar date is then always the date the owner picked, and the one value it cannot hold is a genuine 12:00 am booking. Local noon was the alternative, more robust under travel, and was rejected because its collision — a real noon appointment silently losing its printed time — is plausible where midnight's is not.

**The appointment's *Get ready* and *Change* doors are absent, not disabled.** Their destinations are VV-5's and VV-4's. `disabled` is an accessibility claim that a control exists and is unavailable (C-7); it would be a lie about a control nobody has built.

---

## What the checks caught that reading did not

**The VV-0 tripwire fired on the first `npm test`, before a line of the card existed** — by design, and it named all three consumers plus the three debts it was holding: the card under `components/vetvisits/`, the beta shelf's on-state hint (*"there is nothing to see yet"*, true at VV-0 and false the moment the card landed), and its own deletion. All three paid in the same change.

**The permanent rule that replaced it was too weak, and its weakness was the next PR's.** `vetVisitsUiModules().length > 0` is satisfied by *any* file existing in the namespace — so with the card in place, VV-4 or VV-5 could have written its UI inline in a screen and the guard would have sat green over exactly the leak it exists to catch. It is per-consumer now: every file that reads the flag imports from the namespace, with an empty-by-assertion exemption registry for a future flag read that decides without drawing.

**AC 11 caught a defect in this PR's own list screen.** It read `usePetStore.getState().activePet` at submit time — the `app/vet-visit.tsx:117` shape spec §2 names as the one this track must not inherit. Not hypothetical: `setPets` resolves the active selection during hydration, so a pull landing under a half-filled booking sheet would write the row under a pet the owner never chose. The screen now freezes the pet it was opened for and scopes the read, the prefill, the writes and the "Also for" list to it.

---

## The reviews

Both mandatory reviews returned findings. `code-reviewer` returned **fix-before-merge**; `pm-feature-review` returned NEEDS-WORK on four of six flows. Everything below was fixed in-session.

### The one with a clinical consequence

**A future-dated `visited_at` was reachable in three taps.** The booking sheet's two arms have opposite date bounds, `minimumDate`/`maximumDate` constrain only the *picker*, and a date already in state when the arm flipped was re-validated by nothing. Open "Add" (which lands on `booked` and seeds the last visit's `next_visit_at`, a date weeks out) → tap "Already happened" → submit. A `vet_visits` row dated in the future.

That is the one date `generate-report`'s window rung 1, the rundown's `MAX(visited_at)` and the Vet Files link picker all trust not to be one — **making it unwritable is the entire argument for putting bookings in their own table** (G3, migration 066), and this walked straight past the structure that was built to prevent it. The clamp now lives on the transition rather than in the picker.

The sheet had **no test file at all**, which is why it shipped unguarded: the screen-level tests never switched the mode chip after opening. `BookVisitSheet.test.tsx` now exists.

### Where a green test measured nothing

Two in one session, both caught by mutation rather than by reading:

- The first version of *"drops a time when the arm becomes one that cannot store it"* asserted `scheduledAt === null` after switching to `happened` — which `submit()` returns on that arm **whatever the state holds**. It survived the mutation that removed the clamp entirely. It now asserts on the way *back*, where the clearing is what stops a stale 3:30 pm reappearing on a different booking.
- Typing the screen test's write mocks by their real signatures meant passing them to the `jest.mock` factory directly — and a factory is hoisted above the `const` declarations, so the spies were still in their temporal dead zone. It does not throw: it wires `undefined`, and three AC 11 tests went green-to-zero-calls. The arrow wrappers defer the reference to call time; the mutation proof was re-run afterwards.

### The rest

- **A blank white screen on a failed read** on the visit detail — `loaded` was set only inside the `try`, so a read error fell through every branch to `: null`. The list screen beside it had this right; C-12 met on one screen and missed on its sibling.
- **The one-shot navigation intent re-armed itself every render.** `add` stays in the URL for the life of the screen, so the render-body assignment re-armed the ref the focus effect had just cleared — open a visit, come back, and the sheet opened again unrequested. The ref was doing its job; the **source** was re-supplying the request.
- **The Pet-tab card had no `loaded` flag.** Its zero state is two doors saying "you have nothing booked and nothing logged", so before the read answered an owner with years of visits saw that on every focus, and after a failed read they saw it permanently. The flag is the **pet id** the data belongs to rather than a boolean, which closes the multi-pet half for free: a plain flag stays true across a switch, so the card would have rendered the previous pet's appointment under the new pet's name.
- **A partial "Also for" save reported as a total failure** — the primary row had committed when a second pet's insert threw, so "Could not save" appeared over a save that partly happened, with the sheet still open where the obvious retry duplicated the first row.
- **A booking whose day passed vanished from every surface.** The record still held it and no cancel exists, so the owner's only recovery was to re-type — minting a second row and orphaning the original forever. `awaiting` now carries it; the list renders it, the card does not (it answers "what is next", and that row is not).
- **The sheet promised a Home strip that does not exist.** *"Shows on Home in the days before"* is mock E3 verbatim, and the frame is drawn in a world where VV-5 has shipped. An owner who books Tuesday, reads that, then watches Home for five days and sees nothing concludes the save failed.
- **The one question the sheet asks was never asked out loud** — the booked/happened chips rendered bare, the only control on the sheet with no visible label, with the question living in `accessibilityLabel`.
- **Two voice defects in one line:** the card's plan sentence lowercased a drug name (a proper noun; "Cerenia" in the design authority), and folded "2 documents" in after the word "Plan:", which claims the vet prescribed paperwork. `PlanTagKind` carries four members now so the card selects on meaning rather than on a label string.
- **The namespace rule was satisfiable by a type-only import** — erased at compile time, renders nothing. Rejected now, proven by mutating every namespace import to `import type`. The regex still cannot tell a *rendered* import from a merely-present one; that limit is stated in the file rather than left to read as coverage (C-36).

---

## Accepted, with the limit measured

The midnight sentinel is read in the **reading** device's zone, so a zone change between booking and viewing can print a time that was never given, hide an early-morning one, or shift the displayed day. It is **structurally invisible to the CI timezone matrix**, which runs one fixed `TZ` per job — compose and read always agree inside a run — so the test builds the mismatch by hand rather than leaving it to a job that cannot see it. Accepted for v1: the fix is a `scheduled_time_known` column, a column is a migration, and a migration is its own PR. **CUL-941.**

---

## Residuals

- **CUL-939** (`Waiting on PM`, High) — no cancel for an appointment, no undo for a logged visit, and a mis-dated visit moves the report's rung-1 window. The appointment half needs no held deploy.
- **CUL-940** — mock E3 owes a frame for the happened/booked question, and the "Add" default should be decided with it drawn ("Mock what you change").
- **CUL-941** — the `scheduled_time_known` column.
- **CUL-942** — two log-a-visit doors during the beta; the rundown tile still opens the old screen, which captures more. Mostly resolves at VV-4.
- **CUL-943** — "Also for {pet}" gives no acknowledgement on success.

Not filed, noted here: `readVetVisitsHome` has no `LIMIT` and is shared by the card (which needs a count and one row) and the list (which needs every row), so the Pet tab does avoidable work on every focus. Properly batched, not N+1. A separate card read would be a second predicate over one population, which is the trade to weigh if it ever matters.

---

## No new convention

Nothing here generalises past what C-7, C-12, C-18, C-22, C-32 and C-36 already say — this session mostly demonstrated them. The two worth remembering are already written: **a guard's registry is an exemption, and the empty set is the assertion** (C-32, which fired exactly as designed and named its own debts), and **a survived mutant is the tell that a green test measures nothing** (C-18, twice in one session).

No schema, no Edge Function, no deploy, no new secret, no build-phase change.
