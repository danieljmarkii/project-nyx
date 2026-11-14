# Loose ends PR-29: the report says only what it can see (CUL-2274, CUL-2715)

**Date:** 2026-11-14
**One thing:** T6 L1 — The report: it can only say what its own data shows, so "the owner was told" is a claim it has to earn · check: pending

Shipped via #1533. Dispatched row, `Teach: yes`. The PR body is the record of what changed and what review found; this file carries the teach.

## Teach

### One thing — the report can only say what its own data shows (T6, L1)
The vet report is built on the server from the pet's saved records. It never sees the owner's phone screen. So a sentence like "the owner was told it is worth booking a vet visit" is not a fact the report holds; it is a guess about what another screen showed. Today's fix makes the report say what it does hold, the app's own weight check, until the phone actually draws that warning.

**Like:** a doctor's referral letter can say "her blood test shows low iron". It should not say "the patient was told to eat more spinach" unless the letter writer knows that conversation happened.

**In today's work:** `supabase/functions/generate-report/render.ts:3306`
```
: `The app's weight check reads it as ${ask}.`
```
This is the line the weight row now prints for a current weight loss. Before, it printed "The owner was told it is …". Home has no weight row yet, so the old line told a vet the owner had been warned when they had not.

**Why it matters to you as PM:** any time a spec has one surface describe another ("the owner saw", "the card said"), ask which data the describing surface can actually read; if it cannot read the other surface, the sentence needs a switch that someone flips when the other surface ships.

**Check:** When PR-37 makes Home draw the weight row, what happens to this report sentence if nobody flips the switch, and which way does that error lean: louder or quieter?
