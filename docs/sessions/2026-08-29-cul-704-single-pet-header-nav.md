# CUL-704 — should the single-pet Home header tap leave Home? (ruled: no)

**Date:** 2026-08-29 · **Mode:** DISCOVERY · **Track:** Aug. 2026 Design Polish

**Outcome: ruled (b) — leave it. No code changed.** Shipped via #742. This session's deliverable is
a ruling and one verified finding; the only committed file is this record. CUL-704 closed as a
known limit.

## The question

CUL-618's ruled follow-on (R3), raised by the Designer on CUL-600: after H2a, Home shows the pet's
photo twice ~600pt apart with two destinations — the 30pt header avatar opens the switcher, the
22pt tab-bar avatar goes to the profile. Option **(d)** would have re-pointed the header tap to the
profile **when `pets.length === 1`**, so both faces agree for the household that sees no chevron.

## Ruled the same day

**(b) — the single-pet header keeps opening the switcher.**

> *"I like the switcher on home opening up the bottom sheet and staying on home. Because that user
> may want to quickly switch to see signals, log food..etc."* — PM

The scope was surfaced before the ruling was recorded, because the PM's stated reason is a
*multi-pet* reason and (d) never touched multi-pet: a 2+ pet household would have kept the sheet,
the chevron, and exactly that switch-then-stay-on-Home flow. The PM confirmed the stronger reading:
**the header tap means the same thing at every pet count — the sheet — and its destination must not
depend on how many pets a household happens to have.** That is the argument that ranked option (a″)
(route only when there are no archived pets) last in the brief, applied one step further to (a)
itself. A silent tap target with a count-dependent destination is worse than a silent tap target.

## The finding — the prerequisite was half true

CUL-704 asserted its own blocker was cleared: (d) had been blocked because the Home header was the
one-pet household's only door to "Add a pet", and CUL-618 put a stated `Add a pet` on the Pet tab.
True — and it is only half of what lives behind that sheet.

`router.push('/archived-pets')` is called from **exactly one file** — `components/pet/PetSwitcherSheet.tsx:141`
— and that screen is the app's only un-archive ("Bring back") path. Every door into the sheet is
gated on `pets.length > 1`:

| Entry | Gate |
|---|---|
| `components/home/HomeHeader.tsx:171` | **ungated** — the only one that opens at one pet |
| `components/log/FAB.tsx:205` | `pets.length > 1` |
| `components/log/EventTypeSheet.tsx:211` | `disabled={!multiPet}` |
| `app/(tabs)/profile.tsx:1405` (CUL-618) | `multiPet` |

So **(a) as filed would have stranded the archived record.** A household with one active pet and ≥1
archived pet — reached by having two and archiving one, i.e. the pet-died / foster-left path — loses
every route to `/archived-pets`, and with it the archived pet's health record and the un-archive that
recovers a mis-tap. `store/petStore.ts:132` holds `pets` to non-archived pets by invariant, so
`pets.length === 1` is exactly the state where it bites. Hence the brief offered **(a′)** — route
*and* put an `Archived pets` row on the Pet tab beside the shipped `Add a pet`, behind a shared
`countArchivedPets()` so the query is not hand-rolled twice — rather than (a) alone.

(b) makes it moot: nothing moves, and the one door stays open. The finding is recorded on CUL-704
so the next session that proposes re-pointing this tap meets the cost before re-deriving it.

**The generalisable half:** *"the prerequisite is satisfied"* is a claim about **every** door a
surface carries, not the one the issue happens to name. The switcher sheet carried two — `Add a pet`
and `Archived pets` — and CUL-618 only replaced the first. Counting the call sites took four
minutes and changed the recommendation.

## Residual, deliberately not filed

At one pet the header's left cluster remains a **silent** tap target (no chevron — app-polish spec
§2's no-multi-pet-chrome rule) that opens a list of one. (b) declines to fix that by moving the
destination; it does not assert the silence is fine. Offered as a separate issue and **PM ruled to
leave it alone**, so it lives in the CUL-704 comment rather than as a new `CUL` row.

## Also verified, and cheap to know

The change really was as small as the issue claimed: `router.push('/(tabs)/profile')` is the shipped
idiom (`TrialStrip`, `MedStrip`, `day-summary`), so (a) was one line — plus `headerSwitcherLabel`,
whose one-pet string `"{name} — your pets"` would have become a lie.

## Definition of Done

No code diff, so most of the checklist is `N/A` by construction rather than by exemption:

- Acceptance criteria — **N/A**, no build step advanced; the deliverable is a ruling.
- Anti-pattern scan — **N/A**, no diff. (The finding above *is* the anti-pattern catch: a one-door
  navigation path about to lose its door.)
- Types / lint / tests — **N/A**, no source file touched. Working tree carries this record only.
- Secrets Register — **N/A**, none used.
- Persona sign-off — **Designer ✓** (the H2a duplication complaint that spawned (d), and the
  count-dependent-destination argument that killed it) · **Dir. of Engineering ✓** (call-site count
  across the four switcher entries; the `/archived-pets` reachability finding) · Data **N/A** ·
  Dr. Chen **N/A** · QA **N/A** (nothing to verify on device).
- Adversarial review — **N/A**, no clinically or statistically load-bearing logic.
- Mock — **N/A**. (a) and (b) are pixel-identical at rest; they differ only in destination, so
  CLAUDE.md's "mock what you change" rule has nothing to draw. (a′) *would* have added a visible row
  to the Pet tab and would have landed as a frame in `docs/culprit-pet-switcher-reach-mockups.html`
  (round 1's existing artifact URL) — it was not ruled, so no frame was drawn.
- PM Action Items — **None.** The ruling was made in-session; CUL-704 is closed and its
  `Waiting on PM` label removed.

## Not folded in

CUL-678, CUL-679, CUL-680, CUL-617, CUL-628 were read in orientation and left alone — each is its
own issue, and two are on `Waiting on PM` for related but distinct calls. Per the one-PR-per-session
rule, nothing rode along.
