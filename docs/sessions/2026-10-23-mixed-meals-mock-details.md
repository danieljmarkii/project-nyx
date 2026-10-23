# Mixed meals: three mock details the build skipped (CUL-2134)

**Date:** 2026-10-23
**One thing:** D3 L1 — Reading a test: a test proves only what it actually touched, and a "tap" in a test can reach a button a finger never could · check: pending

Dispatched BUILD row, shipped via #1292. The PR body is the record of the change. This file exists because the row carried `Teach: yes`.

What shipped: the card and edit screen steppers show one visible end stop line ("¾ {food} is as far as the steps go.", from `stepEndLine` in `lib/mixRatio.ts`). The bowl picker shows treats dimmed and inert with "Treat · logged on its own". A mixed bowl's card subtitle says "one bowl". The mock's M1b, M3 and M4 frames are redrawn as built and republished. Found along the way: toppers and other foods still vanish from the bowl picker with no reason, filed as CUL-2143 (Backlog).

## Teach

### One thing — A test proves only what it actually touched (D3, L1)
A test does three things: it sets up a screen, it acts on it, and it checks what happened. What it proves is limited by how real the action was. In our test tool, "press this text" doesn't press like a finger. It searches nearby components for any tap handler and calls the first one it finds, even one the screen never wired to a button.

**Like:** testing a doorbell by reaching through the window and touching the bell's wire. It rings, but that tells you nothing about whether the button outside works.

**In today's work:** `components/log/FoodPicker.test.tsx:490`
`if (typeof node.type === 'string') expect(node.props.onStartShouldSetResponder).toBeUndefined();`
The first version of the treat tile test "pressed" the treat's name. That reached a tap handler on the tile's parent and logged the treat, even though the screen draws the treat as plain text with no button. This line checks the real thing instead: it walks up from the label through what the phone actually renders and confirms nothing there can take a touch. The handler also refuses the treat now, as a second wall.

**Why it matters to you as PM:** a green test is a claim about what it touched. When a PR says "tested", the question that matters is whether the test acts the way an owner would.

**Check:** if someone later wrapped the treat tile in a button again by mistake, which of today's two checks would go red: the "press the name" one, or the "walk up" one?
