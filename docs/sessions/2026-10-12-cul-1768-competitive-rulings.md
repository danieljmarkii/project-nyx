# 2026-10-12 · CUL-1768 · the October competitive decision round, ruled

**Date:** 2026-10-12 · **Mode:** DISCOVERY · **Branch:** `claude/vibrant-maxwell-8wcrap` · **Track:** App Store 1.2.0 · the first public release · **Outcome:** shipped via the session's draft PR (CUL-1768, CUL-1776)

## What happened

The PM ruled the rest of the October competitive brief's decision round (D1 was ruled earlier the same day via CUL-1825):

- **D2 (b):** keep the subtitle "Track symptoms, find triggers"; apply only the accuracy fixes (CUL-1775, now unblocked).
- **D3:** run by proxy in-session. App Store autocomplete, US, 24 terms: "track symptoms", "symptom diary", "stool tracker", "dog poop tracker", "elimination diet" and "pet / dog / cat health tracker" have volume; "find triggers", "food trial", "dog food trial", "dog allergy" and "vet report" have none. Exact Search Ads scores need the PM's account and would not change D2.
- **D4:** neither option. Monetization is undecided, so the listing makes no pet-count claim; D-M1 vs D-M8 stays for the monetization pass.
- **D5:** already satisfied. The PM's clinic read the emailed May report in July, prescribed a novel-protein trial and used its photos to separate regurgitation and hairballs from vomiting; the PM also reviewed the PDF with the vet in person. CUL-598 closed; the evidence is in `docs/vet-report-mock-review.md` §5 with names removed.
- **D6 (a):** no portal; harden the PDF (CUL-1771). **D7 (a):** monetization after submission. **D8 (a), not a blocker:** CUL-1777 starts from the free tiers the PM already has installed; listing claims stay at text strength until it runs.
- **§14:** items 1, 2, 3 and 5 ratified and written in this PR; item 4 follows D2 (CUL-1775), item 6 waits on monetization, item 7 was already fixed in CLAUDE.md (CUL-1773 holds the question).

## Files

- `docs/culprit-competitive-landscape-2026-07.md`: superseded banner, fourteen ⚠ pointers, §V addendum.
- Pulse §V pointers in three research briefs; the README signals row narrowed.
- `docs/dev-handoff-runbook.md`: installed build is the 1.2.0 cut of 2026-08-29 (build number unrecorded), at the same byte count (the CUL-1874 ratchet).
- `docs/vet-report-mock-review.md` §5: the first two real-vet rows.

## Open

- A real vet's read of the v15+ report, and a cold read by a vet who has not met the pet (CUL-1312).
- Synthetic panel 2 (CUL-1831) narrowed to one question: does "find triggers" read as a people app or a diagnosis.
