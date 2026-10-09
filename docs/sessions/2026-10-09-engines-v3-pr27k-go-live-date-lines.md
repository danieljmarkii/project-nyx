# Engines v3 PR-27k: the go-live date lines

**Date:** 2026-10-09
**One thing:** S3 L1 — A flag's row can carry a value, not only on or off: the go-live day rides in the switch's own row · check: pending

CUL-1513 (EN-3 remainder ⑥), shipped via #1134. A `/dispatch` child, BUILD mode. Client only: no Supabase migration, no local SQLite change, no server change.

## What shipped

The tiers spec §5 ("The GA day") has three lines that name the day the new rule went live. They needed a date that only exists once CUL-1407 seeds `engines_v3_en3`, and this PR had to land first. The issue's proposed way out is the one built: the day rides in the key's own `app_config` value as `live_since: "YYYY-MM-DD"`. Both resolvers read only `enabled` and `allowlist`, so the field changes no gate. With no day, a malformed one, or the key off for this caller, every line renders nothing.

- **`lib/ruleSeam.ts`** (pure), with three readers:
  - `liveSinceOf` reads a strict calendar day.
  - `earlierRuleLineOf` gives the record's "Read under the earlier rule, before {date}."
  - `newSinceLineOf` / `ruleSeamOf` give the pet's first new-rule read "New since {date}: …".
  - `datedCallLinesOf` gives the month's "Before / From {date}" lead-ins and the seam's day.
- **`hooks/useEn3LiveSince.ts`**: returns the day only while the key is on for this caller.
- **`hooks/useNewSinceLine.ts`**: reads the pet's reads from the phone's copy (`readPetSeamReads` in `lib/readCopy.ts`). It issues no read when the line cannot be said.
- **`IncidentReadCard`** gains a `ruleNote` meta line. Both analysis sections feed it.
- **The month:**
  - The legend and the screen reader's sentence are dated the same way.
  - An inert 2pt rule in the ink marks the day, wrapped like the edge-row days, so the day's box, hit area and label are unchanged.

## Decisions

- **The day is a local calendar day, read from local midnight.** The month's keys are local days, and so is "before Oct 20". The seed must name the flip day or a later one, never an earlier one. That constraint is noted on CUL-1407.
- **Each line is said only where the record backs it (C-3):**
  - "before {date}" appears only on a read last written before the day. Instants are parsed, never compared as text (C-40).
  - The month dates its lines only when it holds both rules' calls and every counted day sits on its line's side. Otherwise it keeps today's undated lines. A Re-run after go-live can tier an old incident, and "From {date}" over a September day would be false.
- **"First new-rule read" means the first read WRITTEN under the new rule,** ordered by the read's last write and not by the event's time. The line is withheld when that read predates the day, which covers an allow-listed tester. These are the code review's two findings, both fixed and mutation-proven.
- **The key must be on for the caller.** A day seeded while an owner is outside the allowlist would otherwise put "before {date}" on reads that are still being made under the earlier rule.
- **The date is year-less ("Oct 20"),** as the mock draws it.

## Reviews

- **code-reviewer: fix-before-merge, two findings, both fixed in `97811a1`:**
  - A Re-run of an old incident took "New since" from the real first read.
  - "New since" was printed over a tiered read made before the date.
  - Each was proven by mutation: reverting the ordering or the gate reds its own test.
  - Not fixed: the nit on the seam's bare `width: 2`, which matches the file's existing marks.
- **Adversarial review: N/A.** No detection, escalation, correlation or report logic moved. The lines are disclosures about which rule wrote a read, and the never-reassure check (Pattern 8's vocabulary) runs over every one of them.

## Definition of Done

- **Acceptance (CUL-1513, spec §5):**
  - The record's earlier-rule line ✓
  - The first tiered read's "New since" line, decided from the record ✓
  - The month's two dated lines plus the seam, with a one-sided month showing one line ✓
  - Dark until the row carries a day ✓
  - Nothing reaches Home, a notification, motion or a haptic ✓
- **Anti-patterns:**
  - theme tokens only;
  - ThemedText;
  - no new touchables, and the seam is `pointerEvents="none"`;
  - no `!`;
  - no read of the verdict outside the allowed readers (the `readState` and `unknownVerdict` guards are green).
- **Types and tests:**
  - `tsc` clean.
  - The full jest suite ran: one suite red (`app/insights/designV2.test.tsx`, whose config mock lacked the raw map), fixed in `a8f4e20`.
  - Touched suites are green after the review fix.
- **Secrets:** N/A.
- **Personas:** Designer ✓ (Principle 5; the mock's §05 frames, copy verbatim) · Engineer ✓ · Data ✓ (two populations never summed; C-3 and C-40 on every dated claim) · Dr. Chen N/A (the report is untouched) · T&S N/A.
- **Future-self:** a value riding in a flag's own row is the cheapest honest answer to the circularity. The risk is a seed with the wrong day, which the CUL-1407 comment names.

## Teach

### One thing — A flag's row can carry a value, not only on or off (S3, L1)
A config flag is a row in a table that the app reads at start. Usually its value says only "on" or "off". But the row is just data, so it can carry more. Here it carries the day the new rule went live. The app shows the dated lines only when that row holds a day, so nothing new appears on any phone until someone writes the date into the row. No new app release is needed for it.

**Like:** a shop's "Open" sign that also has a little slot for the opening date. The shop can hang the sign before the date is decided. The date appears on the sign the moment someone slides the card in.

**In today's work:** `hooks/useEn3LiveSince.ts:11`
`return on ? liveSinceOf(raw) : null;` means: if the switch is on for you, read the day out of the switch's own row. Otherwise there is no day, and every dated line stays hidden.

**Why it matters to you as PM:** when CUL-1407 turns the switch on, the date you put in that row is what every owner reads. It must be the flip day or later, never earlier.

**Check:** if the switch is turned on for your account but the row has no `live_since` day yet, what does an old "Worth a call" read show?
