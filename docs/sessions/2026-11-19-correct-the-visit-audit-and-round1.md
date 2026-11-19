# 2026-11-19 · Build 62 was stale, the vet visit audit, and Correct the visit round 1

**Date:** 2026-11-19
**One thing:** none: an investigation and discovery session with no app code.

**Issues:** [CUL-2819](https://linear.app/projectnyx/issue/CUL-2819) (the audit, Done) · [CUL-2820](https://linear.app/projectnyx/issue/CUL-2820) (PR-01, DISCOVERY, in progress) · **Branch:** `claude/kind-noether-ftagh0` · **Mock:** https://claude.ai/artifact/ESc1eGWnPDFBd3EdESjTkz (round 1)

## What happened

**The question.** The PM reported that TestFlight build 62 lacked features expected in it: a saved vet visit's Edit offered only date, clinic, vet, reason and notes, and the iPhone Duo layout looked wrong.

**Build 62 was cut from a stale checkout.** The PM's screenshot showed the screen titled "Edit this visit", which `main` deleted on 2026-11-14 (#1536). EAS builds whatever is in the local folder, and build numbers map to no commit anywhere (`appVersionSource: remote`; CUL-559 has asked for the record since August). The fix is a recut from current `main`. The same recut is needed before the Duo fix of 2026-11-10 (#1505) can be judged; it has never been confirmed on a device.

**The stale build was not the whole story.** Reading the PM's real record (read-only SQL) showed the Sep 16 visit holds 1,817 characters of notes, one trial and one document, and the visit screen puts the notes first at full length. The plan and paperwork were four screens down. That defect is on `main` too.

**The audit (CUL-2819).** Three isolated readers walked bookings and prep, saved visits, and calls plus doors. The lead session re-read every blocking claim in the code. Result: 11 gaps that block an owner from correcting a visit, 10 where data is hard to find, 9 minor. The full table with file references is the outcome comment on the issue. The pattern: each screen was built for the moment of entry and nothing required a way back.

**The rulings (PM, in session).**
1. Option B: everything in one project. The project is **Vet visits: the visit can be corrected**.
2. The hybrid: the hard to find class is what the separate screens produce, and the PM had already ruled the fix on 2026-09-17 (round 6: one page, three faces). It was never cut into build issues, and After the visit patched around it under its R4. So the two rows that would have patched the shipped screens again are replaced by the one page; the write path rows stay.

**Round 1 of the mock.** `docs/culprit-correct-the-visit-mockups.html`, exploratory. It redraws the Visited face on the PM's Sep 16 record and puts six decisions in front of the PM with options side by side: what leads the record (D1), in place sheets or an Edit mode (D2), what a saved visit may attach (D3, unseats After the visit R3), the safety net on a cancelled booking (D4, against convention C-21), what may change pets (D5), and the booking behind a deleted visit (D6). It ends with the cut: twelve rows where there were nine, thirteen if D2 needs a schema row.

## Open

- **The PM recuts the build** from current `main` (commands were given in session).
- **D1 to D6** wait on the PM. Once ruled, the page republishes as one build ready proposal and `docs/nyx-vet-visits-requirements.md` is amended (Tier 2, PM approval before merge).
- **The project page's run order still shows nine rows.** It is rewritten to the ruled cut when D1 to D6 land, so the page never describes rows the PM has not seen ruled.
- Two safeguards were proposed and are not ruled: naming the commit a build was cut from in Settings and refusing a cut from a checkout behind `main`; and a round trip rule (every field an owner enters names where it shows and how it is corrected) for the spec template and `pm-feature-review`.
- Parked: the vet call gaps, [CUL-2827](https://linear.app/projectnyx/issue/CUL-2827).

## Not verified

Eight of the ten hard to find findings and all nine minor ones are as the readers reported them. How the vet report renders a visit, and whether an archived pet's visits are reachable, were not checked.
