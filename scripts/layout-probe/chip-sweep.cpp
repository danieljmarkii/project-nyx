// CUL-663 QA spine #3 / AC-CHIP — the Saw it / Found it size sweep, resolved by
// React Native's OWN layout engine rather than by restating the style arithmetic.
//
// Models components/log/SimpleEventConfirm.tsx's time row:
//   timeRow (flexWrap) -> [ timeMain (flexGrow 1, minWidth 150) , chipPair (flexWrap) ]
//   chipPair -> [ chip "Saw it" , chip "Found it" ]  (both flexShrink 0, numberOfLines 1)
//
// Answers the two questions the device pass asks, at every text size x width:
//   1. does anything CLIP (overflow past its container's content box)?
//   2. once the chips STACK, is the resolved gap >= both hitSlop reaches (8 + 8),
//      i.e. can a tap meant for one chip land on the other? (CUL-612 / CUL-688)
//
// Advance widths come from measure-advances.mjs (the shipped Geist_500Medium.ttf).
// Text-size multipliers are RN's own iOS table — React/CoreModules/
// RCTAccessibilityManager.mm:257-269, read out of node_modules, not recalled.
//
// TWO THINGS TO SET BEFORE BELIEVING A ROUNDING RESULT, both of which produced a
// false "taps cross" on the first run of this probe:
//   * pointScaleFactor. Yoga defaults to 1.0 (whole-point rounding); iOS is ALWAYS
//     2 or 3. At 1.0 this reported a 15pt gap where the real device has 16.
//   * LINE_FACTOR (env LF). Default 1.300 = Geist's (hheaAsc - hheaDesc + gap)/upem.
//     RN measures text through NSLayoutManager, not a flat multiplier, so sweep it
//     to see whether a result is a property of the layout or of the estimate.

#include <yoga/Yoga.h>
#include <cstdio>
#include <vector>
#include <cmath>
#include <cstdlib>

struct Step { const char* name; float mult; float saw; float found; };

static YGNodeRef leaf(YGConfigRef cfg, float w, float h) {
  YGNodeRef n = YGNodeNewWithConfig(cfg);
  YGNodeStyleSetWidth(n, w); YGNodeStyleSetHeight(n, h); return n;
}
static YGNodeRef chip(YGConfigRef cfg, float labelW, float lineH) {
  YGNodeRef c = YGNodeNewWithConfig(cfg);
  YGNodeStyleSetFlexShrink(c, 0);
  YGNodeStyleSetBorder(c, YGEdgeAll, 1);
  YGNodeStyleSetPadding(c, YGEdgeHorizontal, 16);
  YGNodeStyleSetPadding(c, YGEdgeVertical, 4);
  YGNodeStyleSetMinHeight(c, 32);
  YGNodeStyleSetJustifyContent(c, YGJustifyCenter);
  YGNodeInsertChild(c, leaf(cfg, labelW, lineH), 0);
  return c;
}

int main() {
  const float SPACE1 = 8, SPACE3 = 24;
  const float CHIP_PAIR_GAP = 4, CHIP_STACK_GAP = 16, CHIP_ROW_GAP = 8, REACH = 8;
  // Geist_500Medium: (hheaAsc 1005 - hheaDesc -295 + gap 0)/upem 1000
  float LINE_FACTOR = atof(getenv("LF") ? getenv("LF") : "1.300");

  std::vector<Step> steps = {
    {"default ", 1.000f,  38.441f,  50.401f},
    {"xxxLarge", 1.353f,  52.011f,  68.193f},
    {"AX2     ", 2.143f,  82.379f, 108.009f},
    {"AX3     ", 2.643f, 101.600f, 133.210f},
    {"AX5     ", 3.571f, 137.273f, 179.982f},
  };
  std::vector<float> widths = {320.f, 375.f, 390.f};
  std::vector<float> scales = {1.5f, 2.f, 2.625f, 2.75f, 3.f, 3.5f, 4.f};

  printf("%-5s %-7s %-9s %-7s %-10s %-9s %s\n","dev","scale","size","layout","overflow","stackGap","taps");
  for (float PSF : scales) for (float DEV : widths) for (auto& s : steps) {
    YGConfigRef cfg = YGConfigNew();
    YGConfigSetPointScaleFactor(cfg, PSF);
    float fs = 13.f * s.mult;
    float lineH = fs * LINE_FACTOR;

    YGNodeRef root = YGNodeNewWithConfig(cfg);
    YGNodeStyleSetWidth(root, DEV);
    YGNodeStyleSetPadding(root, YGEdgeHorizontal, SPACE3);

    YGNodeRef row = YGNodeNewWithConfig(cfg);
    YGNodeStyleSetFlexDirection(row, YGFlexDirectionRow);
    YGNodeStyleSetFlexWrap(row, YGWrapWrap);
    YGNodeStyleSetAlignItems(row, YGAlignCenter);
    YGNodeStyleSetBorder(row, YGEdgeAll, 1);
    YGNodeStyleSetPadding(row, YGEdgeHorizontal, SPACE1);
    YGNodeStyleSetPadding(row, YGEdgeVertical, SPACE1);
    YGNodeStyleSetMinHeight(row, 56);
    YGNodeStyleSetGap(row, YGGutterRow, CHIP_ROW_GAP);

    YGNodeRef main = YGNodeNewWithConfig(cfg);
    YGNodeStyleSetFlexGrow(main, 1); YGNodeStyleSetFlexShrink(main, 1);
    YGNodeStyleSetFlexDirection(main, YGFlexDirectionRow);
    YGNodeStyleSetAlignItems(main, YGAlignCenter);
    YGNodeStyleSetGap(main, YGGutterAll, SPACE1);
    YGNodeStyleSetMinWidth(main, 150);
    YGNodeInsertChild(main, leaf(cfg, 28, 28), 0);
    YGNodeRef labels = YGNodeNewWithConfig(cfg);
    YGNodeStyleSetFlexShrink(labels, 1);
    YGNodeInsertChild(labels, leaf(cfg, 120.f * s.mult, lineH * 2), 0);
    YGNodeInsertChild(main, labels, 1);
    YGNodeInsertChild(row, main, 0);

    YGNodeRef pair = YGNodeNewWithConfig(cfg);
    YGNodeStyleSetFlexShrink(pair, 0);
    YGNodeStyleSetFlexDirection(pair, YGFlexDirectionRow);
    YGNodeStyleSetFlexWrap(pair, YGWrapWrap);
    YGNodeStyleSetGap(pair, YGGutterColumn, CHIP_PAIR_GAP);
    YGNodeStyleSetGap(pair, YGGutterRow, CHIP_STACK_GAP);
    YGNodeStyleSetJustifyContent(pair, YGJustifyFlexEnd);
    YGNodeRef cSaw = chip(cfg, s.saw, lineH), cFound = chip(cfg, s.found, lineH);
    YGNodeInsertChild(pair, cSaw, 0); YGNodeInsertChild(pair, cFound, 1);
    YGNodeInsertChild(row, pair, 1);
    YGNodeInsertChild(root, row, 0);
    YGNodeCalculateLayout(root, DEV, YGUndefined, YGDirectionLTR);

    float pairW = YGNodeLayoutGetWidth(pair);
    float lineW = YGNodeLayoutGetWidth(row) - 2*SPACE1 - 2*1;
    float sawY = YGNodeLayoutGetTop(cSaw), sawH = YGNodeLayoutGetHeight(cSaw);
    float fndY = YGNodeLayoutGetTop(cFound);
    float sawR = YGNodeLayoutGetLeft(cSaw)+YGNodeLayoutGetWidth(cSaw);
    float fndR = YGNodeLayoutGetLeft(cFound)+YGNodeLayoutGetWidth(cFound);
    bool stacked = fndY > sawY + 0.01f;
    bool clipped = sawR - pairW > 0.01f || fndR - pairW > 0.01f || pairW - lineW > 0.01f;
    float gap = stacked ? fndY - (sawY + sawH) : 0.f;

    float ovf = fmaxf(fmaxf(sawR - pairW, fndR - pairW), pairW - lineW);
    printf("%-5.0f %-7.3f %-9s %-7s %-+10.3f ", DEV, PSF, s.name,
           stacked ? "STACK" : "inline", ovf);
    if (stacked) printf("%-9.3f %s\n", gap,
                        gap >= REACH*2 - 0.001f ? "abut (ok)" : "*** CROSS ***");
    else printf("%-9s %s\n", "-", "n/a");
    (void)clipped;
    YGNodeFreeRecursive(root); YGConfigFree(cfg);
  }
  return 0;
}
