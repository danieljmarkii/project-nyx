# CUL-618 — where the pet switcher should live (decision round)

**Date:** 2026-08-29 · **Mode:** DISCOVERY · **Track:** Aug. 2026 Design Polish

Deliverable: a mock round + three decision briefs. **No app code changed.** The issue names a
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

## Ruling requested

- **R1** — should the Pet tab switch pets? Options (a) / (b) / (c); rec **(a)**.
- **R2** — if (a), which shape? a1 / **a2** (rec) / a3.
- **R3** — is (d) in scope now or a follow-on? Rec **follow-on**, ruled after (a) is on a device.

## Not folded in

CUL-679, CUL-680, CUL-678, CUL-617, CUL-628 were all read and deliberately left alone — each is its
own issue, and two of them (678, 680) are on `Waiting on PM` for related but distinct calls.
