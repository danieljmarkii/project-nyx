# Mixed meals: a new or unclassified food can join the bowl from the mix picker (CUL-2089)

**Date:** 2026-10-23
**One thing:** D4 L1 — A test is proven by breaking the code on purpose: if it stays green, it was not checking that code · check: correct

Dispatched BUILD row, plan gated; the PM ruled option (a) in session. Shipped via #1295. The PR body is the record of the change. This file exists because the row carried `Teach: yes`.

What shipped: the bowl picker keeps its "Snap a new food" row. Capture runs in its add only mode and writes no meal, then hands the new food back to the meal that asked, and the split rises with it. A topper shows dimmed with its reason, and a food not set as a meal opens its page to set the type. That half also finishes CUL-2143. The picker and the bowl writer now share one rule, `isMixableFood`. The mock's §1b holds the ruled frames; (b) and (c) left the page.

## Teach

### One thing — Proving a test by breaking the code on purpose (D4, L1)
A test that passes tells you the code does what the test checks. It does not tell you the test checks anything that matters. So after writing one, you break the code it is meant to protect, on purpose, and run it again. If it goes red, it guards that code. If it stays green, it was never watching it, and either the test or the code is wrong.

**Like:** testing a smoke alarm by holding a match under it. A green light on the alarm says it has power, not that it would ring in a fire.

**In today's work:** `app/mix.tsx:151`
`if (food && isMixableFood(food)) pickSecondRef.current(food);`
This line lets a food saved from capture into the bowl only if it is a meal food. Deleting the `isMixableFood(food)` check turned a test red ("a food saved as a treat, topper or Other lands on the picker"), so that test guards it. A second break went the other way. An extra rule meant to drop a stale food when the screen opens stayed green when switched off, because the screen already ignored that food before the meal finished loading. The rule was dead weight, and it came out.

**Why it matters to you as PM:** "tested" in a PR is only worth something if someone broke the code and watched the test catch it. This repo asks for that proof, and today it found code that was doing nothing.

**Check:** If someone later changed capture so the meal log path also handed its food back, would today's tests catch it? Say which one, or why none would.
