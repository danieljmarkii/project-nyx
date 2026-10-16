# Medication revamp round 4: the full design critique, persona sign off and team readout (CUL-1903)

**Date:** 2026-10-13
**One thing (re-ask):** P3 L1 — Sequencing (asked again on today's Gate 1: of the seven rulings, which one frees the most work, and why?) · check: pending
**One thing:** P1 L1 — The strategy kernel: the critique's verdict is a diagnosis, a guiding policy and a set of actions · check: pending

DISCOVERY session on [CUL-1903](https://linear.app/projectnyx/issue/CUL-1903), run Oct 12 to 13 as one conversation. No app code, no Edge Function code, no schema. Shipped via #1210, which names only CUL-1903.

## The ask

The PM asked for a hard review of the medication revamp after round 4 merged (#1137): review the ideal use case, stress test the design so the feature is beautifully designed, check the user and vet personas agree with the direction, and gather the product team with consultants (motion, design and style) to go over where things stand. The session first wrote that as a prompt; the PM added a veterinary technician consultant, then asked for the prompt to run in this session.

## What happened, in order

1. **Filed and claimed** CUL-1903, related to [CUL-1902](https://linear.app/projectnyx/issue/CUL-1902) (the open review round) and [CUL-1698](https://linear.app/projectnyx/issue/CUL-1698) (the discovery that drew round 4) by Linear relations, never in the PR.
2. **Oriented** on round 4's full text, CUL-1902, CUL-1698's comments and the round 2 critique. CUL-1902 had no comments since filing, so every brief stood as filed.
3. **Rendered** round 4: 53 frames with Reduce Motion on and off, the page at 390 and 1280, every section in light and dark, the report page alone at print width with a 1 bit fax simulation, and the glyphs at 3x. No page errors, no sideways scroll. The page has no demo buttons, so nothing on it animates.
4. **Wrote the stress sheet** before any lens ran: three golden paths (Jordan and Mochi; Sam and Pixel; the PM and Nyx's real prednisolone course), 22 stress cases including two new fixtures (a pill vomited up minutes after it was given; a T4 draw timed to the last dose), and one success line per lens.
5. **Posted the plan** and waited for the PM's go before the spend.
6. **Ran the critique** at full depth: thirteen lenses, a verifier each, a synthesis, a completeness critic, six follow ups and a final synthesis. 35 agents, none failed, about 15 hours of wall clock (the plan said four to five; the lenses ran long on images and code). 201 findings plus 56 from follow ups, merged into 107 items.
7. **The lead's pass:** spot checked every claim that would become an issue against the code; diffed the touched files against `main` (which moved to `4949559` during the run; only medication capture and the sign-out wipe changed, both for AI consent, and neither touches a defect); deduped against Linear; renamed the synthesis's GC-1 to GC-12 to Gate 1 to Gate 12 so they never collide with the settled GC-5 A; corrected one overstated contrast claim (None of it already passes at 5.33:1).
8. **Filed** eight shipped defects and commented the evidence onto five existing issues; **posted** the updated briefs on CUL-1902 and the team readout on CUL-1903; **wrote** `docs/medication-revamp-round4-critique-2026-10.md`.

## What the critique found

* **The direction is unanimous.** All thirteen lenses and six follow ups agree: a course belongs to its pet, logging stays on +, the end of a course asks and never celebrates, the ledger speaks the trial screen's language, reminders are built around the double dose hazard.
* **The round is not yet a spec.** Its frames lean on four rules nobody wrote: a slot model, the meal link, one write contract, a complete concern table. Setup breaks the settled GC-5 A (the steps carry no confirm). The page's fold line sits 81pt too low, so D2 and L1 were judged from the wrong line.
* **Twelve gates** before the requirements: five team rules (Gates 2 to 6) and seven PM rulings (Gates 1 and 7 to 12), three of them new (the headline count against ratified D1, the repeat card before a write, D8's contrast floors).
* **Five persona conflicts:** is it working (Dr. Chen against the Data Scientist, Sam and the cold read vet), the lock screen name, D5's bowl, D8's fill, the end card's order.
* **The forecast** moves from 14 rows to about 25.
* **Is it beautiful?** Not yet: the bones are, the round is not. The three lifts: one mark system with measured floors, the course screen on the trial screen's own title block and attention panel, and a motion table.
* **From the counter:** the vet tech's five commonest callbacks (spat, vomited, skipped, doubled, ran out) all dead end; capture the vet's instruction for a dose that did not go in at setup.
* **Readiness:** rule the gates, then a focused round 5, then the requirements.

## Found and filed

* [CUL-1915](https://linear.app/projectnyx/issue/CUL-1915) · Live harm, Waiting on PM. The trial completion sheet prints before and during counts without reading any course; Nyx's opens Sat Oct 17, inside her prednisolone's masking tail, and no fix can land by then. Two clinical questions for the PM ride on it.
* [CUL-1916](https://linear.app/projectnyx/issue/CUL-1916) · Live harm. Logging a dose never regenerates the Signal (the wire still waits on a PR that landed).
* [CUL-1917](https://linear.app/projectnyx/issue/CUL-1917) · Live harm. A dose linked to a removed meal is read three ways.
* [CUL-1918](https://linear.app/projectnyx/issue/CUL-1918) · Live harm. The vet report never reads `how_given`, so it can say no dose was given in food over doses logged in food.
* [CUL-1919](https://linear.app/projectnyx/issue/CUL-1919) · Live harm. The report's trial block ignores a course's masking tail.
* [CUL-1920](https://linear.app/projectnyx/issue/CUL-1920) · Live harm. Offline, capture says the label photo is saved when it never uploaded.
* [CUL-1921](https://linear.app/projectnyx/issue/CUL-1921) · Delivered notifications outlive sign-out and account deletion.
* [CUL-1922](https://linear.app/projectnyx/issue/CUL-1922) · Backlog. The dose card cuts off the drug name.
* Commented onto [CUL-1710](https://linear.app/projectnyx/issue/CUL-1710) (into M0), [CUL-1892](https://linear.app/projectnyx/issue/CUL-1892) (the class is wider than antihistamines), [CUL-231](https://linear.app/projectnyx/issue/CUL-231) (abandoned label photos), [CUL-1666](https://linear.app/projectnyx/issue/CUL-1666) (the trial ledger's teal at 2.26:1, missing from its measured set) and [CUL-572](https://linear.app/projectnyx/issue/CUL-572) (the repeat check's shape and Gate 8).

## What broke, and how it was fixed

* **The plan's wall clock was wrong by three times.** Four to five hours were forecast; the run took about 15. The cause is the container's two agents at a time and lenses that read many images and much code. A future full depth run with thirteen lenses should plan for a day.
* **The synthesis reused GC labels.** Round 2's critique used GC-1 to GC-6, and GC-5 A is a PM ruling; the new GC-5 meant something else. Renamed to Gate 1 to Gate 12 everywhere the lead wrote.
* **An overstated contrast line.** The synthesis said every logged mark sat near 1.37:1; None of it actually passes at 5.33:1. Corrected in the doc and on CUL-1902 before the PM read it.
* **Main moved mid run.** Checked by diff rather than assumed; no defect changed.

## Residuals

* The report page's next cold read waits for its fixes, in the report milestone's PR (the two pass cap).
* "Is it working" needs one more adversarial pass in its own build PR.
* 320pt and the accessibility text sizes were judged from the fan table and shipped code, never rendered; round 5 should render them.
* The verifiers listed 62 things the lenses missed; the synthesis weighed them, and the doc does not list them one by one.
