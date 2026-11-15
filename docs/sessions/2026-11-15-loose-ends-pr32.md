# Loose ends PR-32: the vet report says when no symptom was logged

**Date:** 2026-11-15
**One thing:** T6 L1 — The report: a zero is a count of entries, not a finding about the patient, so the page has to say which · check: pending

Shipped via #1552 ([CUL-2718](https://linear.app/projectnyx/issue/CUL-2718)). A dispatched BUILD row, routine, built from its build note.

## What shipped

- **Headline.** With no symptom logged in the window, page 1 used to read "Primary sign logged: the logged observations". It now reads "No symptom entry was logged in this window: an absence in the record, not a finding that there were none." The monitoring (no trial) headline had the same fallback and says the same thing.
- **The sentence is scoped to what it counted.** Entries logged as "other" and the owner's daily looks sit outside the symptom count, so each is named beside the absence when present. When trial days fall outside the report window, their symptom count rides the window clause.
- **Trial tile 1.** A bare `0`, "none logged in this window", then the unlogged-tail line or "an entry of any kind on X of N days — not a symptom check". A report with a symptom logged renders byte for byte as before.

## What broke, and how

The cold read of the first cut failed the tile: "0 / 32 d logged" read as nothing logged, and "32 of 32 days had an entry" under a symptom label read as a daily symptom check that found none. The first adversarial pass then broke the headline twice: 14 vomits in trial days outside the window sat four blocks below a bold absence claim, and "No symptom was logged" overclaimed past "other" entries and daily looks. All three fixed. Pass 2 passed at the cap with six branches proven by mutation.

Its four residuals (none can quiet a warning) are parked in one comment on the issue.

## Teach

**The report: a zero is a count of entries, not a finding about the patient** (T6, L1)

The report can only count what the owner wrote down. When it prints a zero for symptoms, the true statement is "nobody logged one", which is different from "the dog had none". A reader in a hurry hears the second. So wherever the report prints an absence, the words beside it have to say that it is the record that is empty, and what the count did and did not look at.

**Like:** a guest book with no signatures. It tells you nobody signed. It does not tell you nobody visited. A sign beside it reading "0 visitors" would be a claim the book cannot make.

**In today's work:** `supabase/functions/generate-report/render.ts:3428`

```ts
const noneLogged = `<b>No symptom entry was logged in this window</b>: an absence in the record, not a finding that there were none.${
```

This is the sentence the headline prints when the symptom count is zero. The bold half says what was counted (entries, in this window). The second half says what the zero is not. The `${` at the end is where the extra clauses attach when there is something the count never looked at.

**Why it matters to you as PM:** any time a spec asks a surface to show a count, ask what an empty count will be read as, because the empty case is the one a busy vet or owner is most likely to mistake for good news.

**Check:** a pet's report window holds no symptom entry, but the owner marked "scratching more" on six daily looks. Before today's change, what would a vet skimming the headline have concluded, and which clause now stops that?
