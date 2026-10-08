# FAB PR-25: the chip arrives first, and a pet switch deals the foods again

**Date:** 2026-10-08
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of CUL-1646 (PM ruling D3 of the FAB convening, CUL-1625), shipped via #1113. One file of product code, `components/log/FAB.tsx`, plus its own describe block in `FAB.test.tsx`.

**What shipped.** In a two pet home the "Logging for" chip's slot now springs with the veil at delay 0 and the choices fan 60ms after it, nearest first (the mock's §04 figure); a one pet home has no chip and keeps the plain stagger. A pet switch inside the open fan is seen at render; the fan waits on the new pet's keyed read and then deals the food pills in from the disc on the open's own stagger, instead of the new rows appearing in slots already at rest. Every pill is held untappable from the switch until the deal ends (`whileOpen`); a failed read and a close both release that hold. Under Reduce Motion the foods crossfade in: the still FanSlot's opacity became `fade × slot`, which equals `fade` everywhere outside a redeal.

**The one departure from the mock.** The mock plays the outgoing pet's foods retracting for about 140ms under the new pet's name. CUL-723 forbids rendering the previous pet's foods, and the issue lists that as a Must hold, so the retract is the instant un-render and the deal is what reads as "new".

**Two choices worth knowing.** The deal's slots are zeroed during the render that first draws the new foods, not in an effect, because a FanSlot mounts with its value's current reading and a post-commit zero could paint the pills at full for a frame. And only the slots the budget actually draws a food on are zeroed, so a door never blinks when CUL-1636's budget trims a food.

**Proof.** Six new tests; each was reddened by removing what it guards (the tap gate, the chip lead, the zero-and-deal, the failed-read release). The suite's first run caught a test leak, a queued read nobody asked for falling through to the next test, now closed by resetting the read mock per test. Typecheck clean; full jest 612 suites green.

**Residual.** The switcher's Modal slides down in the same moment the deal plays, and the local read is fast, so part of the deal may play under the sliding sheet. That is a device question for the TestFlight sitting; if it reads as hidden, starting the deal once the switcher has gone is the follow-up.
