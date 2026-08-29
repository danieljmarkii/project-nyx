# CUL-618 — where the pet switcher should live (decision round → build)

**Date:** 2026-08-29 · **Mode:** DISCOVERY, then BUILD after the same-day ruling · **Track:** Aug. 2026 Design Polish

Shipped via #738. Ruled mid-session, so this record covers both halves: the decision round, then
the build it authorised. `app/(tabs)/profile.tsx` + one new test file; no schema, no migration, no
Edge Function, no RLS/Storage path.

The round's deliverable was a mock + three decision briefs. The issue names a
PM fork, and CLAUDE.md's "mock what you change" rule requires options that differ visually to be
drawn side by side rather than described — so the round is the deliverable, not a preamble to one.

Mock: `docs/culprit-pet-switcher-reach-mockups.html` (round 1) —
https://claude.ai/code/artifact/7dc73b4c-31ea-42f9-b2dd-6c8492c4a205

## The question

CUL-599 put the pet's avatar in the tab bar. Everywhere else in the app that face means *open the
switcher* (Home header, FAB chip, log-sheet title); in the bar it navigates to the profile, which
has no switcher. On History and Foods the tab avatar is the only pet control on screen, so the one
visible control answers the wrong question and recovery means going back to Home.

The Designer's CUL-600 comment added the mirror image and a fourth option: after H2a, Home shows
the same face twice ~600pt apart with divergent destinations, and **(d)** would route the
*single-pet* header tap to the profile so both faces agree.

## What the code says (verified, not assumed)

| Surface | Avatar | Tap | File |
|---|---|---|---|
| Home header | 30pt | switcher (chevron only at 2+ pets) | `components/home/HomeHeader.tsx` |
| FAB chip | yes | switcher — **renders only at 2+ pets** | `components/log/FAB.tsx:205` |
| Log sheet title (beta) | none (CUL-679) | switcher at 2+ pets | `components/log/EventTypeSheet.tsx:212` |
| History / Foods | tab bar only | → profile | `components/nav/NyxTabBar.tsx` |
| Pet tab (profile) | 112pt | photo picker | `app/(tabs)/profile.tsx:903` |

**The finding that ranks the options:** `router.push('/add-pet')` and `router.push('/archived-pets')`
are each called from exactly one file — `components/pet/PetSwitcherSheet.tsx:135/141`. There is no
entry in Settings and none on the Pet tab. So for a **one-pet household the only route to a second
pet is a silent, chevron-less tap on the Home header** (no chevron is deliberate — multi-pet spec
§3.1 keeps multi-pet chrome away from single-pet accounts).

Two consequences follow, and both were missing from the issue as filed:

1. **(d) is downstream of (a), not a rival to it.** Routing the single-pet header to the profile
   removes that household's only door to "Add a pet" unless the Pet tab already carries one.
2. **CUL-678 cannot be resolved by deletion.** Pulling the management rows out of the capture sheet
   needs somewhere for them to go first; a switcher on the Pet tab is that somewhere, which turns
   CUL-678 from a fork into a move.

## The honest part of the recommendation

(a) does **not** save a tap. Tab → header → row is three taps; Home → header → row is three taps.
What it buys is that the tap Sam already made stops dead-ending — the recovery lands under her
thumb instead of back across the app. The brief says so rather than claiming a speed win.

## Why a2 over a1 / a3

The issue's (a) says *the profile screen's own header* but the profile has no header row — it opens
straight into a photo card. So (a) was drawn three ways:

- **a1** — Home's header row re-used. Most consistent, but puts the pet's face on the screen
  **three times** (30pt row, 112pt card, 22pt tab): this issue's own complaint, one level down.
- **a2** (rec) — the name that is already the page's title gains the chevron. No new row, no third
  avatar, no new vocabulary, and the chevron still renders only at 2+ pets so a one-pet household
  gains nothing to look at.
- **a3** — an explicit "Switch to Luna" row. Shortest switch at exactly two pets; a second
  switching idiom beside the sheet, degrades past two, reads as settings rather than the pet's page.

**(b) long-press** was ranked last on the complaint itself: at rest it is pixel-identical to
today's frame, and "I couldn't find the list" is not answered by a hidden gesture. It also needs a
VoiceOver custom action and does nothing for the one-pet "Add a pet" door.

If (a) is ruled, the build uses `PetSwitcherSheet` (the Modal wrapper), **not** `PetSwitcherPanel` —
profile is a root screen with nothing presented over it, per the CUL-662 rule.

## Ruled the same day

- **R1 = (a)** · **R2 = a2** — *"pet profile pet name becomes the switch. Love it."*
- **The one-pet sub-decision = (i)**, surfaced rather than assumed (below).
- **R3 still open** — (d) does not gate the build.

### The sub-decision the ruling didn't reach

a2 mirrors Home by gating the chevron on `pets.length > 1`. But Home's cluster stays
*tappable* at one pet **because it is that household's only "Add a pet" door** — the asymmetry
this round documented. So a2 had to answer what the name does at one pet, and the answer is
load-bearing for R3: gate the tap too, and the Pet tab never becomes a second door, so (d) stays
blocked. PM ruled **(i)**: at one pet the name does nothing and the tab **states the action** —
a quiet `Add a pet` beside `Archive {name}`, the same rare-lifecycle register the existing
comment there already describes.

## The build (a2 + (i))

`app/(tabs)/profile.tsx` only. No schema, no migration, no Edge Function, no RLS/Storage path.
`PetSwitcherSheet` is reused unchanged.

- **The name is the switcher at 2+ pets** — `nameRow` + `ChevronDown`, opening `PetSwitcherSheet`
  (the Modal **wrapper**, not `PetSwitcherPanel`: this is a root screen with nothing presented
  over it — CUL-662). A11y label via the existing `headerSwitcherLabel`, **not** a second
  predicate: the control renders iff `multiPet`, so the param is the same fact it gates on.
- **At one pet**, the name renders in the same `nameRow` as a plain `View` — so the card's rhythm
  does not change with the household's pet count — and `Add a pet` renders at the bottom.
- **`multiPet` is derived in the render body**, beside `photoUri` and for the same reason: the
  switch happens *in place* here (the tab never blurs), so anything mirrored into state would
  need its own reset, and a forgotten one renders the previous pet's material under the new
  pet's name — CUL-574's wrong-pet class arriving through a switch instead of a lookup.

### The tap-target call, and why it went the other way from CUL-612's usual answer

The name sits 12pt below `Change photo`, which already carries `hitSlop={8}`. Facing slop of 8
plus *any* slop on the name exceeds that gap, and two overlapping touchables resolve by
**z-order, not intent** — on a control whose neighbour opens the camera roll. So this is the
CUL-579 case where `hitSlop` is the wrong tool and **growing the box** is right: `minHeight: 44`
on `nameRow`, no slop, taking none of the neighbour's reach. It also makes the floor
**assertable** — a claim resting on a rendered line box is one jest cannot compute.

### Tests — and the pre-fix run that earns them

`app/(tabs)/profile.test.tsx` (new, 8 cases). Per **CUL-613**, they were run against the tree they
were written for before being trusted:

- **4 of 7 confirmed RED on the pre-fix tree** — the name is a button and says so; it opens the
  sheet and the sheet lists the other pet; exactly one Modal is visible with the switcher open
  (the CUL-662 guard shape); `Add a pet` routes to `/add-pet`.
- **3 pass pre-fix by design** (regression guards): no duplicate `Add a pet` at 2+ pets, the
  in-place switch renames the block, and the one-pet name is not a tap target.
- One pins the **geometry** — `minHeight: 44` present, `hitSlop` absent — so the tap floor and the
  no-overlap rule survive a later type or spacing change instead of relying on this comment.
- The last of those is the **ruling-(i)** guard, so it was falsified separately: flipping the
  render to an always-tappable name (option (ii)) turns it **red**, and only it. That also
  validates the helper — per **CUL-579**, `fireEvent.press` can reach a handler by *descending*
  from an enclosing composite, so "is this tappable?" is asserted by walking **up** to the owning
  responder and testing identity, never by a synthetic press.

## Verification

`tsc --noEmit` clean · `jest` **278 suites / 6083 tests green**. Pre-existing `act()` warning noise
from this screen's async loaders is unchanged by the diff.

Subagent passes (`code-reviewer`, `pm-feature-review`) were **not** run — this session was
instructed not to dispatch agents. The diff was scanned against the anti-pattern lists in-context
instead; that is a weaker check than an un-anchored read, and the device pass still owes the real
proof that the sheet presents (jest renders Modals happily — the CUL-662 lesson).

## Not folded in

CUL-679, CUL-680, CUL-678, CUL-617, CUL-628 all read and left alone. **(d) is filed as CUL-704**
rather than ridden along, per R3's recommendation — its prerequisite is now satisfied, so it needs
a ruling rather than a rebuild.

## Manual updated

One Tier-1 CLAUDE.md addition, appended to the existing CUL-612/CUL-579 tap-geometry bullet: **growing
a box can spend the gap the adjacency rule needs.** The two halves of that bullet interact, and this
session hit the interaction — folding a neighbour's `marginTop` into a new `minHeight` box is the
natural way to keep a card's rhythm, and it silently subtracts that margin from the gap the
arithmetic depends on. Nothing was broken (abutting is not overlapping) and no test would have
failed, which is what makes it worth writing down: the only visible symptom was an in-place comment
that had quietly become false.

## Note on the branch

`main` moved mid-session — a sibling landed CUL-621 (completion cards → the shared `TimeEditSheet`).
Merged in rather than rebased; files are disjoint (`components/ui/` vs `app/(tabs)/`) and the merge
was clean. The combined tree was re-validated before push: `tsc` clean, **279 suites / 6099 tests**.

## Not folded in

CUL-679, CUL-680, CUL-678, CUL-617, CUL-628 were all read and deliberately left alone — each is its
own issue, and two of them (678, 680) are on `Waiting on PM` for related but distinct calls.
