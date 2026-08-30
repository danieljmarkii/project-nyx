# layout-probe — resolving a layout question with React Native's own engine

`jest` has no layout engine. A style assertion can pin that `flexWrap` is `'wrap'`;
it cannot tell a wrap that **resolves** from one that merely relocates the overflow,
and it cannot tell you the gap two wrapped rows actually end up with once the pixel
grid has rounded them. That gap is what CUL-612's adjacency rule is stated in, so on
the log sheet's `Saw it` / `Found it` pair it is a safety question, not a cosmetic one.

This probe closes that gap by compiling **the Yoga in `node_modules`** — the same
engine the app ships — and running the real node tree through it.

It is a diagnostic, not a guard. Nothing in CI runs it. Reach for it when a layout
claim rests on a number no test can compute (the CUL-579 rule: *a tap-target floor
resting on a metric no test can compute is a floor nobody is holding*), and write the
answer back into a test as a style contract once you have it.

## Running it

```bash
# 1. Advance widths, straight off the shipped font.
node scripts/layout-probe/measure-advances.mjs \
  node_modules/@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf

# 2. Compile Yoga out of node_modules and resolve the tree.
cd /tmp && cp -r <repo>/node_modules/react-native/ReactCommon/yoga/yoga .
g++ -std=c++20 -O1 -I. <repo>/scripts/layout-probe/chip-sweep.cpp \
    $(find yoga -name '*.cpp') -o sweep && ./sweep
```

`LF=<n>` overrides the text line-height factor (default `1.300`, measured from
Geist's `hhea`) — use it to check whether a result is a property of the layout or a
coincidence of the line height. That sensitivity run is the point: the first version
of the chip sweep reported a tap-crossing that turned out to be an artifact of Yoga's
**default `pointScaleFactor` of 1.0**, which iOS never uses (it is always 2 or 3).
Set the scale factor before believing any rounding result.

## What it currently models

`components/log/SimpleEventConfirm.tsx`'s time row — `timeRow` → `timeMain` +
`chipPair` → the two chips — which is the AC-CHIP ladder in
`docs/nyx-more-events-picker-requirements.md` §3. Editing it for another surface
means replacing the tree in `main()`; the font and scale-factor scaffolding carries
over unchanged.

**Keep the tree in step with the component.** A probe that has drifted from the
source it claims to model is worse than no probe, because it answers confidently.
